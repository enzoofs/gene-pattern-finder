import asyncio
import shutil
import subprocess
import tempfile
import os
from functools import partial
from pathlib import Path
from Bio.Blast import NCBIXML
from app.config import settings
from app.utils.sequence import write_fasta, clean_sequence
from app.schemas import BlastHit

SUBPROCESS_TIMEOUT = 300


def _blast_cmd(program: str) -> str:
    if settings.blast_bin_dir:
        return str(Path(settings.blast_bin_dir) / program)
    return program


def _dbtype_for_program(program: str) -> str:
    if program in ("blastp", "tblastn"):
        return "prot"
    return "nucl"


def _run_blast_sync(
    query_sequence: str,
    subject_sequences: list[dict],
    program: str = "blastn",
    max_results: int = 50,
) -> dict:
    query_seq = clean_sequence(query_sequence)
    tmp_dir = tempfile.mkdtemp()

    try:
        query_path = os.path.join(tmp_dir, "query.fasta")
        with open(query_path, "w") as f:
            f.write(f">query\n{query_seq}\n")

        db_fasta = os.path.join(tmp_dir, "subjects.fasta")
        write_fasta(subject_sequences, db_fasta)

        db_name = os.path.join(tmp_dir, "blastdb")
        dbtype = _dbtype_for_program(program)

        subprocess.run(
            [_blast_cmd("makeblastdb"), "-in", db_fasta, "-dbtype", dbtype, "-out", db_name, "-parse_seqids"],
            check=True, capture_output=True, text=True, timeout=SUBPROCESS_TIMEOUT,
        )

        result_path = os.path.join(tmp_dir, "results.xml")
        subprocess.run(
            [
                _blast_cmd(program),
                "-query", query_path,
                "-db", db_name,
                "-out", result_path,
                "-outfmt", "5",
                "-evalue", "1e-5",
                "-max_target_seqs", str(max_results),
            ],
            check=True, capture_output=True, text=True, timeout=SUBPROCESS_TIMEOUT,
        )

        with open(result_path) as f:
            blast_record = NCBIXML.read(f)

        hits = []
        for alignment in blast_record.alignments:
            hsp = alignment.hsps[0]
            coverage_raw = hsp.align_length / blast_record.query_length if blast_record.query_length else 0
            hits.append(BlastHit(
                accession=alignment.accession,
                title=alignment.hit_def,
                score=hsp.score,
                evalue=hsp.expect,
                identity_pct=round(100 * hsp.identities / hsp.align_length, 2) if hsp.align_length else 0,
                coverage=round(min(coverage_raw, 1.0), 4),
                query_start=hsp.query_start,
                query_end=hsp.query_end,
                hit_start=hsp.sbjct_start,
                hit_end=hsp.sbjct_end,
                query_aligned=hsp.query,
                match_line=hsp.match,
                hit_aligned=hsp.sbjct,
            ))

        return {
            "query_length": blast_record.query_length,
            "hits": hits,
            "total_hits": len(hits),
        }

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


async def run_blast(
    query_sequence: str,
    subject_sequences: list[dict],
    program: str = "blastn",
    max_results: int = 50,
) -> dict:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None,
        partial(_run_blast_sync, query_sequence, subject_sequences, program, max_results),
    )
