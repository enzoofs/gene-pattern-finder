import logging
import os
import subprocess
import tempfile
from app.config import settings

logger = logging.getLogger(__name__)

SUBPROCESS_TIMEOUT = 600


def run_mafft(input_fasta: str, output_path: str | None = None) -> str:
    if output_path is None:
        fd, output_path = tempfile.mkstemp(suffix=".fasta")
        os.close(fd)

    cmd = [settings.mafft_bin, "--auto", "--thread", "-1", input_fasta]
    logger.info("Running MAFFT: %s", " ".join(cmd))

    with open(output_path, "w") as out_file:
        result = subprocess.run(
            cmd, stdout=out_file, stderr=subprocess.PIPE,
            text=True, timeout=SUBPROCESS_TIMEOUT,
        )

    if result.returncode != 0:
        logger.error("MAFFT failed: %s", result.stderr)
        raise RuntimeError(f"MAFFT failed: {result.stderr[:500]}")

    logger.info("MAFFT completed: %s", output_path)
    return output_path
