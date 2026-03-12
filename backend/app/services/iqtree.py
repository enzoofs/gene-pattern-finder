import logging
import os
import subprocess
import tempfile
from app.config import settings

logger = logging.getLogger(__name__)

SUBPROCESS_TIMEOUT_FAST = 120
SUBPROCESS_TIMEOUT_IQ = 3600


def run_fasttree(aligned_fasta: str, is_nucleotide: bool = True) -> str:
    cmd = [settings.fasttree_bin]
    if is_nucleotide:
        cmd.append("-nt")
    cmd.append(aligned_fasta)

    logger.info("Running FastTree: %s", " ".join(cmd))
    result = subprocess.run(
        cmd, capture_output=True, text=True, timeout=SUBPROCESS_TIMEOUT_FAST,
    )

    if result.returncode != 0:
        logger.error("FastTree failed: %s", result.stderr)
        raise RuntimeError(f"FastTree failed: {result.stderr[:500]}")

    newick = result.stdout.strip()
    logger.info("FastTree completed, tree length: %d chars", len(newick))
    return newick


def _count_sequences(fasta_path: str) -> int:
    count = 0
    with open(fasta_path) as f:
        for line in f:
            if line.startswith(">"):
                count += 1
    return count


def run_iqtree(aligned_fasta: str, is_nucleotide: bool = True) -> dict:
    work_dir = tempfile.mkdtemp(prefix="iqtree_")
    prefix = os.path.join(work_dir, "analysis")
    n_seqs = _count_sequences(aligned_fasta)

    cmd = [
        settings.iqtree_bin,
        "-s", aligned_fasta,
        "-m", "MFP",
        "-nt", "AUTO",
        "-pre", prefix,
        "--quiet",
    ]

    # Bootstrap requires at least 4 sequences
    if n_seqs >= 4:
        cmd.extend(["-bb", "1000"])
    else:
        logger.info("Skipping bootstrap: only %d sequences (need 4+)", n_seqs)

    logger.info("Running IQ-TREE: %s", " ".join(cmd))
    result = subprocess.run(
        cmd, capture_output=True, text=True, timeout=SUBPROCESS_TIMEOUT_IQ,
    )

    if result.returncode != 0:
        logger.error("IQ-TREE failed: %s", result.stderr)
        raise RuntimeError(f"IQ-TREE failed: {result.stderr[:500]}")

    treefile = f"{prefix}.treefile"
    if not os.path.exists(treefile):
        raise RuntimeError("IQ-TREE did not produce a tree file")

    with open(treefile) as f:
        newick = f.read().strip()

    model = "unknown"
    log_file = f"{prefix}.log"
    if os.path.exists(log_file):
        with open(log_file) as f:
            for line in f:
                if "Best-fit model:" in line:
                    model = line.split("Best-fit model:")[1].split()[0].strip()
                    break

    logger.info("IQ-TREE completed, model=%s", model)
    return {"newick": newick, "model": model}
