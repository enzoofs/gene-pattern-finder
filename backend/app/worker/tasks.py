import logging
import os
import tempfile
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings
from app.models import AnalysisJob, CollectionSpecies, Sequence, Species, JobStatus, SeqType
from app.services.mafft import run_mafft
from app.services.iqtree import run_fasttree, run_iqtree
from app.services.conservation import detect_conserved_regions
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


def _publish_progress(job_id: UUID, pct: int, msg: str):
    import redis as redis_lib
    import json
    r = redis_lib.from_url(settings.redis_url)
    r.publish(f"job:{job_id}", json.dumps({"pct": pct, "msg": msg}))
    r.close()


@celery_app.task(bind=True, name="run_analysis")
def run_analysis(self, job_id: str):
    job_uuid = UUID(job_id)

    with SyncSession() as db:
        job = db.get(AnalysisJob, job_uuid)
        if not job:
            logger.error("Job %s not found", job_id)
            return

        stmt = (
            select(CollectionSpecies)
            .where(CollectionSpecies.collection_id == job.collection_id)
        )
        links = db.execute(stmt).scalars().all()

        if len(links) < 3:
            _update_job(db, job_uuid, status=JobStatus.failed, error_msg="Need at least 3 sequences")
            _publish_progress(job_uuid, -1, "Failed: Need at least 3 sequences")
            return

        seq_ids = [link.sequence_id for link in links]
        sequences = []
        for sid in seq_ids:
            seq = db.get(Sequence, sid)
            if seq:
                # Eagerly load species name
                species = db.get(Species, seq.species_id)
                seq._species_name = species.name if species else "unknown"
                sequences.append(seq)

        is_nucleotide = sequences[0].seq_type in (SeqType.dna, SeqType.rna) if sequences else True

        work_dir = tempfile.mkdtemp(prefix="gpf_analysis_")

        try:
            # STEP 1: Prepare FASTA (0-5%)
            _update_job(db, job_uuid, status=JobStatus.aligning, progress_pct=0, progress_msg="Preparing sequences...")
            _publish_progress(job_uuid, 0, "Preparing sequences...")

            input_fasta = os.path.join(work_dir, "input.fasta")
            with open(input_fasta, "w") as f:
                for seq in sequences:
                    label = f"{seq.accession}|{seq._species_name.replace(' ', '_')}"
                    f.write(f">{label}\n{seq.sequence}\n")

            _update_job(db, job_uuid, progress_pct=5, progress_msg=f"Aligning {len(sequences)} sequences with MAFFT...")
            _publish_progress(job_uuid, 5, f"Aligning {len(sequences)} sequences with MAFFT...")

            # STEP 2: MAFFT alignment (5-40%)
            aligned_fasta = os.path.join(work_dir, "aligned.fasta")
            run_mafft(input_fasta, aligned_fasta)

            with open(aligned_fasta) as f:
                alignment_text = f.read()

            _update_job(db, job_uuid, progress_pct=40, progress_msg="Alignment complete. Building preview tree...", alignment=alignment_text)
            _publish_progress(job_uuid, 40, "Building preview tree with FastTree...")

            # STEP 3: FastTree preview (40-50%)
            _update_job(db, job_uuid, status=JobStatus.preview_tree)
            try:
                preview_newick = run_fasttree(aligned_fasta, is_nucleotide=is_nucleotide)
                _update_job(db, job_uuid, progress_pct=50, preview_tree=preview_newick, progress_msg="Preview tree ready. Running full analysis...")
                _publish_progress(job_uuid, 50, "Preview tree ready. Running IQ-TREE...")
            except Exception as e:
                logger.warning("FastTree failed (non-fatal): %s", e)
                _update_job(db, job_uuid, progress_pct=50, progress_msg="FastTree skipped. Running IQ-TREE...")
                _publish_progress(job_uuid, 50, "Running IQ-TREE...")

            # STEP 4: IQ-TREE (50-90%)
            _update_job(db, job_uuid, status=JobStatus.full_tree)
            iq_result = run_iqtree(aligned_fasta, is_nucleotide=is_nucleotide)

            _update_job(
                db, job_uuid,
                progress_pct=90,
                tree=iq_result["newick"],
                tree_model=iq_result["model"],
                progress_msg="Tree complete. Detecting conserved regions...",
            )
            _publish_progress(job_uuid, 90, "Detecting conserved regions...")

            # STEP 5: Conservation (90-100%)
            _update_job(db, job_uuid, status=JobStatus.conservation)
            conservation_data = detect_conserved_regions(aligned_fasta, threshold=0.9)

            _update_job(
                db, job_uuid,
                status=JobStatus.done,
                progress_pct=100,
                progress_msg="Analysis complete",
                conservation=conservation_data,
                finished_at=datetime.now(timezone.utc),
            )
            _publish_progress(job_uuid, 100, "Analysis complete")

        except Exception as e:
            logger.exception("Analysis failed for job %s", job_id)
            _update_job(
                db, job_uuid,
                status=JobStatus.failed,
                error_msg=str(e)[:1000],
                finished_at=datetime.now(timezone.utc),
            )
            _publish_progress(job_uuid, -1, f"Failed: {str(e)[:200]}")
