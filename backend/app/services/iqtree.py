import logging
import os
import re
import subprocess
import tempfile
from app.config import settings

logger = logging.getLogger(__name__)

SUBPROCESS_TIMEOUT_FAST = 120
SUBPROCESS_TIMEOUT_IQ = 3600


def _run_external_tool(cmd: list[str], timeout: int = 3600,
                        capture_stdout: bool = False) -> str:
    """Executa ferramenta externa com tratamento de erros padronizado."""
    logger.info("Running: %s", " ".join(cmd[:4]))
    result = subprocess.run(
        cmd, capture_output=True, text=True, timeout=timeout,
    )

    if result.returncode != 0:
        stderr_preview = (result.stderr or "")[:500]
        tool_name = os.path.basename(cmd[0])
        logger.error("%s failed: %s", tool_name, stderr_preview)
        raise RuntimeError(f"{tool_name} failed: {stderr_preview}")

    return result.stdout if capture_stdout else ""


def _count_sequences(fasta_path: str) -> int:
    count = 0
    with open(fasta_path) as f:
        for line in f:
            if line.startswith(">"):
                count += 1
    return count


def _extract_bootstrap_values(newick: str) -> list[dict]:
    """Extrai valores de bootstrap/SH-aLRT da string Newick do IQ-TREE.

    Formato IQ-TREE com -bb e -alrt: (A:0.1,B:0.2)95/87:0.3
    Formato IQ-TREE so com -bb: (A:0.1,B:0.2)95:0.3
    """
    pattern = r'\)(\d+(?:\.\d+)?(?:/\d+(?:\.\d+)?)?):'
    matches = re.findall(pattern, newick)

    values = []
    for match in matches:
        parts = match.split("/")
        entry: dict = {"ufboot": float(parts[0])}
        if len(parts) > 1:
            entry["sh_alrt"] = float(parts[1])
        values.append(entry)

    return values


def run_fasttree(aligned_fasta: str, is_nucleotide: bool = True) -> str:
    cmd = [settings.fasttree_bin]
    if is_nucleotide:
        cmd.append("-nt")
    cmd.append(aligned_fasta)

    newick = _run_external_tool(cmd, timeout=SUBPROCESS_TIMEOUT_FAST, capture_stdout=True).strip()
    logger.info("FastTree completed, tree length: %d chars", len(newick))
    return newick


def run_iqtree(aligned_fasta: str, is_nucleotide: bool = True,
               outgroup: str | None = None) -> dict:
    work_dir = tempfile.mkdtemp(prefix="iqtree_")
    prefix = os.path.join(work_dir, "analysis")
    n_seqs = _count_sequences(aligned_fasta)

    cmd = [
        settings.iqtree_bin,
        "-s", aligned_fasta,
        "-m", "MFP",
        "-nt", str(settings.iqtree_threads),
        "-pre", prefix,
        "--quiet",
    ]

    # Bootstrap + SH-aLRT requer pelo menos 4 sequencias
    if n_seqs >= 4:
        cmd.extend(["-bb", "1000", "-alrt", "1000"])
    else:
        logger.info("Skipping bootstrap: only %d sequences (need 4+)", n_seqs)

    # Outgroup para enraizar a arvore
    if outgroup:
        cmd.extend(["-o", outgroup])

    newick = _run_external_tool(cmd, timeout=SUBPROCESS_TIMEOUT_IQ)

    treefile = f"{prefix}.treefile"
    if not os.path.exists(treefile):
        raise RuntimeError("IQ-TREE did not produce a tree file")

    with open(treefile) as f:
        newick = f.read().strip()

    # Validar formato Newick basico
    if not newick or newick.count("(") != newick.count(")"):
        raise RuntimeError("IQ-TREE produziu arvore Newick invalida (parenteses desbalanceados)")

    model = "unknown"
    log_file = f"{prefix}.log"
    if os.path.exists(log_file):
        with open(log_file) as f:
            for line in f:
                if "Best-fit model:" in line:
                    model = line.split("Best-fit model:")[1].split()[0].strip()
                    break

    # Extrair valores de bootstrap da Newick
    bootstrap_data = _extract_bootstrap_values(newick) if n_seqs >= 4 else None

    logger.info("IQ-TREE completed, model=%s, bootstrap_nodes=%d",
                model, len(bootstrap_data) if bootstrap_data else 0)
    return {"newick": newick, "model": model, "bootstrap_data": bootstrap_data}
