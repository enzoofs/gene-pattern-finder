import logging
import math
from collections import Counter
from Bio import AlignIO

logger = logging.getLogger(__name__)


def _shannon_entropy(column: list[str]) -> float:
    """Calcula entropia de Shannon para uma coluna do alinhamento.

    H = -sum(pi * log2(pi))
    H = 0 -> totalmente conservada
    H = log2(n) -> maxima variabilidade
    """
    non_gap = [c for c in column if c not in ('-', '.')]
    if not non_gap:
        return 0.0

    counts = Counter(non_gap)
    total = len(non_gap)
    entropy = 0.0

    for count in counts.values():
        p = count / total
        if p > 0:
            entropy -= p * math.log2(p)

    return entropy


def detect_conserved_regions(
    aligned_fasta: str,
    threshold: float = 0.9,
    min_length: int = 5,
    method: str = "identity",
) -> dict:
    """Detecta regioes conservadas no alinhamento.

    method: "identity" (frequencia do caractere mais comum) ou
            "entropy" (Shannon - entropia baixa = conservado)
    """
    alignment = AlignIO.read(aligned_fasta, "fasta")
    n_seqs = len(alignment)
    n_pos = alignment.get_alignment_length()

    logger.info("Conservation analysis: %d sequences, %d positions, threshold=%.2f, method=%s",
                n_seqs, n_pos, threshold, method)

    position_identity = []
    position_entropy = []

    for i in range(n_pos):
        column = [str(alignment[j].seq[i]).upper() for j in range(n_seqs)]
        non_gap = [c for c in column if c not in ('-', '.')]

        if not non_gap:
            position_identity.append(0.0)
            position_entropy.append(0.0)
            continue

        counts = Counter(non_gap)
        most_common_count = counts.most_common(1)[0][1]
        identity = most_common_count / len(non_gap)
        position_identity.append(round(identity, 4))
        position_entropy.append(round(_shannon_entropy(column), 4))

    # Escolher score para deteccao de regioes
    if method == "entropy":
        # Entropia baixa = conservado; normalizar para 0-1 onde 1 = conservado
        max_entropy = math.log2(4) if n_seqs > 0 else 1.0  # DNA=4 bases
        scores = [1.0 - (e / max_entropy) if max_entropy > 0 else 1.0
                  for e in position_entropy]
    else:
        scores = position_identity

    # Detectar regioes conservadas
    regions = []
    start = None
    for i, score in enumerate(scores):
        if score >= threshold:
            if start is None:
                start = i
        else:
            if start is not None and (i - start) >= min_length:
                region_scores = scores[start:i]
                region_identities = position_identity[start:i]
                regions.append({
                    "start": start,
                    "end": i - 1,
                    "length": i - start,
                    "avg_identity": round(sum(region_identities) / len(region_identities), 4),
                })
            start = None

    if start is not None and (n_pos - start) >= min_length:
        region_scores = scores[start:]
        region_identities = position_identity[start:]
        regions.append({
            "start": start,
            "end": n_pos - 1,
            "length": n_pos - start,
            "avg_identity": round(sum(region_identities) / len(region_identities), 4),
        })

    total_conserved = sum(r["length"] for r in regions)

    return {
        "position_identity": position_identity,
        "position_entropy": position_entropy,
        "regions": regions,
        "total_positions": n_pos,
        "total_conserved": total_conserved,
        "conservation_pct": round(100 * total_conserved / n_pos, 2) if n_pos > 0 else 0,
        "threshold": threshold,
        "method": method,
        "n_sequences": n_seqs,
    }
