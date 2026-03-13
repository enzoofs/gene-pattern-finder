import logging
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from app.config import settings

logger = logging.getLogger(__name__)

SUBPROCESS_TIMEOUT = 3600  # 1 hour — large alignments can be slow


def _build_mafft_command(input_fasta: str) -> tuple[list[str], dict[str, str]]:
    """Build MAFFT command and env, handling Windows msys2 distribution."""
    env = os.environ.copy()
    mafft_bin = settings.mafft_bin

    if sys.platform == "win32" and os.path.isdir(mafft_bin):
        # mafft_bin points to the mafft-win directory (e.g. tools/mafft-win)
        mafft_dir = Path(mafft_bin)
        bash_exe = str(mafft_dir / "usr" / "bin" / "bash.exe")
        mafft_script = str(mafft_dir / "usr" / "bin" / "mafft")
        # Prepend mafft's own bin dir so its bundled coreutils are found
        env["PATH"] = str(mafft_dir / "usr" / "bin") + ";" + env.get("PATH", "")
        # Set MAFFT_BINARIES to the msys2-relative path where helper binaries live
        env["MAFFT_BINARIES"] = str(mafft_dir / "usr" / "lib" / "mafft")
        # Use a Windows temp dir that msys2 bash can access
        win_tmp = os.path.join(settings.work_dir, "mafft_tmp")
        os.makedirs(win_tmp, exist_ok=True)
        env["TMPDIR"] = win_tmp
        env["TMP"] = win_tmp
        env["TEMP"] = win_tmp
        cmd = [bash_exe, mafft_script, "--auto", "--thread", "1", input_fasta]
    else:
        # No Linux, se MAFFT_BINARIES estiver configurado (distribuicao standalone),
        # setar no env do subprocess pra ele encontrar os helpers
        mafft_binaries = os.environ.get("MAFFT_BINARIES", "")
        if mafft_binaries:
            env["MAFFT_BINARIES"] = mafft_binaries
        cmd = [mafft_bin, "--auto", "--thread", "-1", input_fasta]

    return cmd, env


def run_mafft(input_fasta: str, output_path: str | None = None) -> str:
    if output_path is None:
        fd, output_path = tempfile.mkstemp(suffix=".fasta")
        os.close(fd)

    cmd, env = _build_mafft_command(input_fasta)
    logger.info("Running MAFFT: %s", " ".join(cmd))

    with open(output_path, "w") as out_file:
        result = subprocess.run(
            cmd, stdout=out_file, stderr=subprocess.PIPE,
            text=True, timeout=SUBPROCESS_TIMEOUT, env=env,
        )

    if result.returncode != 0:
        logger.error("MAFFT failed: %s", result.stderr)
        raise RuntimeError(f"MAFFT failed: {result.stderr[:500]}")

    logger.info("MAFFT completed: %s", output_path)
    return output_path
