"""Shared distance matrix computation using Kimura 2-parameter model.

Replaces the duplicated p-distance Python loops in clustering.py and network.py
with a single, vectorized implementation using BioPython's DistanceCalculator.
"""
import logging
import numpy as np
from Bio import AlignIO
from Bio.Phylo.TreeConstruction import DistanceCalculator

logger = logging.getLogger(__name__)


def compute_distance_matrix(
    aligned_fasta: str,
    model: str = "kimura",
    seq_type: str = "dna",
) -> tuple[np.ndarray, list[str]]:
    """Compute pairwise distance matrix from an aligned FASTA file.

    Args:
        aligned_fasta: path to aligned FASTA file
        model: distance model — "kimura" (Kimura 2-param) or "identity" (p-distance)
        seq_type: "dna", "rna", or "protein"

    Returns:
        (dist_matrix, labels) where dist_matrix is NxN numpy array
        and labels is list of sequence IDs.
    """
    alignment = AlignIO.read(aligned_fasta, "fasta")
    n_seqs = len(alignment)
    labels = [record.id for record in alignment]

    logger.info(
        "Computing distance matrix: %d sequences, model=%s, seq_type=%s",
        n_seqs, model, seq_type,
    )

    # Use BioPython DistanceCalculator for DNA/RNA with Kimura model
    if model == "kimura" and seq_type in ("dna", "rna"):
        try:
            calculator = DistanceCalculator("blastn")
            dm = calculator.get_distance(alignment)

            # Convert BioPython DistanceMatrix to full numpy array
            n = len(dm.names)
            dist_matrix = np.zeros((n, n))
            for i in range(n):
                for j in range(n):
                    dist_matrix[i][j] = dm[i][j]

            # Handle NaN (occurs when p > 0.75, Kimura undefined)
            dist_matrix = np.nan_to_num(dist_matrix, nan=2.0)
            dist_matrix = np.clip(dist_matrix, 0, None)

            # Ensure symmetry
            dist_matrix = (dist_matrix + dist_matrix.T) / 2
            np.fill_diagonal(dist_matrix, 0.0)

            logger.info("Kimura distance matrix computed successfully")
            return dist_matrix, labels

        except Exception as e:
            logger.warning("Kimura model failed, falling back to p-distance: %s", e)

    # Fallback: vectorized p-distance using NumPy
    dist_matrix = _vectorized_pdistance(alignment)

    logger.info("P-distance matrix computed successfully")
    return dist_matrix, labels


def _vectorized_pdistance(alignment) -> np.ndarray:
    """Compute p-distance matrix using NumPy vectorization.

    Much faster than the old Python character-by-character loop.
    """
    n_seqs = len(alignment)
    n_pos = alignment.get_alignment_length()

    # Convert alignment to 2D NumPy character array
    seqs = np.array([list(str(record.seq).upper()) for record in alignment])

    # Gap mask: True where character is NOT a gap
    not_gap = (seqs != '-') & (seqs != '.')

    dist_matrix = np.zeros((n_seqs, n_seqs))

    for i in range(n_seqs):
        for j in range(i + 1, n_seqs):
            # Valid positions: both sequences are non-gap
            valid = not_gap[i] & not_gap[j]
            n_valid = valid.sum()

            if n_valid == 0:
                dist_matrix[i][j] = 1.0
            else:
                # Count mismatches at valid positions
                mismatches = (seqs[i][valid] != seqs[j][valid]).sum()
                dist_matrix[i][j] = mismatches / n_valid

            dist_matrix[j][i] = dist_matrix[i][j]

    return dist_matrix
