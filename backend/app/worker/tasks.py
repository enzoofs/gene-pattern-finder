import logging
import os
import shutil
import tempfile
from contextlib import contextmanager
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from datetime import timedelta

from sqlalchemy import delete

from app.config import settings
from app.models import AnalysisJob, Collection, CollectionSpecies, Sequence, Species, JobStatus, SeqType
from app.services.mafft import run_mafft
from app.services.iqtree import run_fasttree, run_iqtree
from app.services.conservation import detect_conserved_regions
from app.services.motifs import discover_motifs
from app.services.distance import compute_distance_matrix
from app.services.clustering import cluster_sequences
from app.services.network import infer_network
from app.services.insights import generate_insights
from app.utils.sequence import validate_dna, validate_rna, validate_protein
from app.worker.celery_app import celery_app

logger = logging.getLogger(__name__)

sync_engine = create_engine(settings.database_url_sync)
SyncSession = sessionmaker(sync_engine)


def _update_job(db: Session, job_id: UUID, **kwargs):
    job = db.get(AnalysisJob, job_id)
    if job:
        for k, v in kwargs.items():
            setattr(job, k, v)
        db.commit()


def _publish_progress(job_id: UUID, pct: int, msg: str, status: str = ""):
    """Publica progresso via Redis pub/sub com status real do pipeline."""
    import redis as redis_lib
    import json
    r = redis_lib.from_url(settings.redis_url)
    r.publish(f"job:{job_id}", json.dumps({"pct": pct, "msg": msg, "status": status}))
    r.close()


@contextmanager
def _job_workdir(job_id: str):
    """Cria diretorio de trabalho e garante limpeza mesmo em caso de crash."""
    work_path = os.path.join(settings.work_dir, job_id)
    os.makedirs(work_path, exist_ok=True)
    try:
        yield work_path
    finally:
        shutil.rmtree(work_path, ignore_errors=True)


# Validadores por tipo de sequencia
_SEQ_VALIDATORS = {
    SeqType.dna: validate_dna,
    SeqType.rna: validate_rna,
    SeqType.protein: validate_protein,
}


@celery_app.task(bind=True, name="run_analysis")
def run_analysis(self, job_id: str, outgroup: str | None = None):
    job_uuid = UUID(job_id)

    with SyncSession() as db:
        job = db.get(AnalysisJob, job_uuid)
        if not job:
            logger.error("Job %s not found", job_id)
            return

        # Carregar collection pra pegar seq_type
        collection = db.get(Collection, job.collection_id)

        stmt = (
            select(CollectionSpecies)
            .where(CollectionSpecies.collection_id == job.collection_id)
        )
        links = db.execute(stmt).scalars().all()

        # Minimo de 3 especies (3 = arvore sem bootstrap, 4+ = com bootstrap)
        if len(links) < 3:
            _update_job(db, job_uuid, status=JobStatus.failed,
                error_msg="Minimo de 3 especies necessario. Com 3 especies, a arvore e gerada "
                          "sem suporte de bootstrap. Para analise com bootstrap, adicione pelo "
                          "menos 4 especies.")
            _publish_progress(job_uuid, -1, "Minimo de 3 especies necessario", "failed")
            return

        seq_ids = [link.sequence_id for link in links]
        sequences = []
        for sid in seq_ids:
            seq = db.get(Sequence, sid)
            if seq:
                species = db.get(Species, seq.species_id)
                seq._species_name = species.name if species else "unknown"
                sequences.append(seq)

        # Validar consistencia de tipos de sequencia
        seq_types = set(s.seq_type for s in sequences)
        if len(seq_types) > 1:
            _update_job(db, job_uuid, status=JobStatus.failed,
                error_msg=f"Colecao contem tipos mistos de sequencia: {', '.join(t.value for t in seq_types)}. "
                          f"Todas devem ser do mesmo tipo.")
            _publish_progress(job_uuid, -1, "Tipos de sequencia incompativeis", "failed")
            return

        is_nucleotide = sequences[0].seq_type in (SeqType.dna, SeqType.rna)

        # Validar conteudo das sequencias contra o tipo declarado
        expected_type = collection.seq_type if collection else sequences[0].seq_type
        validator = _SEQ_VALIDATORS.get(expected_type)
        if validator:
            for seq in sequences:
                clean = seq.sequence.replace("-", "").replace(".", "")
                if not validator(clean):
                    _update_job(db, job_uuid, status=JobStatus.failed,
                        error_msg=f"Sequencia {seq.accession} nao e {expected_type.value} valida. "
                                  f"Verifique se todas as sequencias sao do mesmo tipo.")
                    _publish_progress(job_uuid, -1, "Tipo de sequencia incompativel", "failed")
                    return

        # Validar outgroup se fornecido
        if outgroup:
            valid_labels = [f"{seq.accession}|{seq._species_name.replace(' ', '_')}" for seq in sequences]
            valid_accessions = [seq.accession for seq in sequences]
            matching = [lbl for lbl in valid_labels if outgroup in lbl]
            if not matching:
                _update_job(db, job_uuid, status=JobStatus.failed,
                    error_msg=f"Outgroup '{outgroup}' nao encontrado na colecao. "
                              f"Accessions disponiveis: {', '.join(valid_accessions[:10])}")
                _publish_progress(job_uuid, -1, "Outgroup nao encontrado", "failed")
                return
            outgroup = matching[0]  # Usar o label completo (accession|species)

        with _job_workdir(job_id) as work_dir:
            try:
                # STEP 1: Preparar FASTA (0-5%)
                _update_job(db, job_uuid, status=JobStatus.aligning, progress_pct=0, progress_msg="Preparing sequences...")
                _publish_progress(job_uuid, 0, "Preparing sequences...", "aligning")

                input_fasta = os.path.join(work_dir, "input.fasta")
                with open(input_fasta, "w") as f:
                    for seq in sequences:
                        label = f"{seq.accession}|{seq._species_name.replace(' ', '_')}"
                        f.write(f">{label}\n{seq.sequence}\n")

                _update_job(db, job_uuid, progress_pct=5, progress_msg=f"Aligning {len(sequences)} sequences with MAFFT...")
                _publish_progress(job_uuid, 5, f"Aligning {len(sequences)} sequences with MAFFT...", "aligning")

                # STEP 2: MAFFT alignment (5-40%)
                aligned_fasta = os.path.join(work_dir, "aligned.fasta")
                run_mafft(input_fasta, aligned_fasta)

                with open(aligned_fasta) as f:
                    alignment_text = f.read()

                _update_job(db, job_uuid, progress_pct=40, progress_msg="Alignment complete. Building preview tree...", alignment=alignment_text)
                _publish_progress(job_uuid, 40, "Building preview tree with FastTree...", "preview_tree")

                # STEP 3: FastTree preview (40-50%)
                _update_job(db, job_uuid, status=JobStatus.preview_tree)
                try:
                    preview_newick = run_fasttree(aligned_fasta, is_nucleotide=is_nucleotide)
                    _update_job(db, job_uuid, progress_pct=50, preview_tree=preview_newick, progress_msg="Preview tree ready. Running full analysis...")
                    _publish_progress(job_uuid, 50, "Preview tree ready. Running IQ-TREE...", "full_tree")
                except Exception as e:
                    logger.warning("FastTree failed (non-fatal): %s", e)
                    _update_job(db, job_uuid, progress_pct=50, progress_msg="FastTree skipped. Running IQ-TREE...")
                    _publish_progress(job_uuid, 50, "Running IQ-TREE...", "full_tree")

                # STEP 4: IQ-TREE (50-90%)
                _update_job(db, job_uuid, status=JobStatus.full_tree)
                iq_result = run_iqtree(aligned_fasta, is_nucleotide=is_nucleotide, outgroup=outgroup)

                _update_job(
                    db, job_uuid,
                    progress_pct=90,
                    tree=iq_result["newick"],
                    tree_model=iq_result["model"],
                    bootstrap_data=iq_result.get("bootstrap_data"),
                    progress_msg="Tree complete. Detecting conserved regions...",
                )
                _publish_progress(job_uuid, 90, "Detecting conserved regions...", "conservation")

                # Determine seq_type string for services
                seq_type_str = expected_type.value  # "dna", "rna", or "protein"

                # STEP 5: Conservation + p-values (90-92%)
                _update_job(db, job_uuid, status=JobStatus.conservation)
                conservation_data = detect_conserved_regions(
                    aligned_fasta, threshold=0.9, seq_type=seq_type_str,
                )

                _update_job(
                    db, job_uuid,
                    progress_pct=92,
                    progress_msg="Conservation complete. Discovering motifs...",
                    conservation=conservation_data,
                )
                _publish_progress(job_uuid, 92, "Discovering motifs...", "motifs")

                # STEP 6: Motif Discovery + p-values + PWM (92-93%)
                _update_job(db, job_uuid, status=JobStatus.motifs)
                motifs_data = discover_motifs(aligned_fasta, seq_type=seq_type_str)

                _update_job(
                    db, job_uuid,
                    progress_pct=93,
                    progress_msg="Motifs found. Computing distance matrix...",
                    motifs=motifs_data,
                )
                _publish_progress(job_uuid, 93, "Computing distance matrix...", "clustering")

                # STEP 7: Shared distance matrix — Kimura 2-param (93-94%)
                dist_matrix, seq_labels = compute_distance_matrix(
                    aligned_fasta, seq_type=seq_type_str,
                )

                _update_job(
                    db, job_uuid,
                    progress_pct=94,
                    progress_msg="Distance matrix ready. Clustering sequences...",
                )
                _publish_progress(job_uuid, 94, "Clustering sequences...", "clustering")

                # STEP 8: Clustering + bootstrap (94-96%)
                _update_job(db, job_uuid, status=JobStatus.clustering)
                clustering_data = cluster_sequences(
                    aligned_fasta,
                    dist_matrix=dist_matrix,
                    seq_labels=seq_labels,
                    seq_type=seq_type_str,
                )

                _update_job(
                    db, job_uuid,
                    progress_pct=96,
                    progress_msg="Clustering complete. Inferring network...",
                    clustering=clustering_data,
                )
                _publish_progress(job_uuid, 96, "Inferring network...", "network")

                # STEP 9: Network + centrality (96-98%)
                _update_job(db, job_uuid, status=JobStatus.network)
                cluster_labels = clustering_data.get("labels") if clustering_data else None
                network_data = infer_network(
                    aligned_fasta,
                    cluster_labels=cluster_labels,
                    dist_matrix=dist_matrix,
                    seq_labels=seq_labels,
                    seq_type=seq_type_str,
                )

                _update_job(
                    db, job_uuid,
                    progress_pct=98,
                    progress_msg="Network complete. Generating insights...",
                    network=network_data,
                )
                _publish_progress(job_uuid, 98, "Generating insights...", "insights")

                # STEP 10: Insights — automated hypothesis generation (98-100%)
                _update_job(db, job_uuid, status=JobStatus.insights)
                insights_data = generate_insights(
                    conservation=conservation_data,
                    motifs=motifs_data,
                    clustering=clustering_data,
                    network=network_data,
                    seq_type=seq_type_str,
                )

                _update_job(
                    db, job_uuid,
                    status=JobStatus.done,
                    progress_pct=100,
                    progress_msg="Analysis complete",
                    insights=insights_data,
                    finished_at=datetime.now(timezone.utc),
                )
                _publish_progress(job_uuid, 100, "Analysis complete", "done")

            except Exception as e:
                logger.exception("Analysis failed for job %s", job_id)
                _update_job(
                    db, job_uuid,
                    status=JobStatus.failed,
                    error_msg=str(e)[:1000],
                    finished_at=datetime.now(timezone.utc),
                )
                _publish_progress(job_uuid, -1, f"Failed: {str(e)[:200]}", "failed")


@celery_app.task(name="cleanup_old_jobs")
def cleanup_old_jobs(days: int = 90):
    """Remove jobs finalizados com mais de N dias para evitar acumulo no banco."""
    with SyncSession() as db:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        stmt = delete(AnalysisJob).where(
            AnalysisJob.finished_at < cutoff,
            AnalysisJob.status.in_([JobStatus.done, JobStatus.failed]),
        )
        result = db.execute(stmt)
        db.commit()
        logger.info("Cleaned up %d old jobs (older than %d days)", result.rowcount, days)
