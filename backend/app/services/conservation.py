import logging
import math
from collections import Counter
from Bio import AlignIO
from scipy.stats import binom

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


def _column_pvalue(non_gap: list[str], most_common_count: int, alphabet_size: int) -> float:
    """Binomial test: is the most common character significantly above random?

    H0: identity = 1/alphabet_size (random chance)
    P(X >= k) where X ~ Binomial(n, 1/alphabet_size)
    """
    n = len(non_gap)
    if n < 3:
        return 1.0

    p_chance = 1.0 / alphabet_size
    # sf(k-1) = P(X >= k) = survival function
    return float(binom.sf(most_common_count - 1, n, p_chance))


def detect_conserved_regions(
    aligned_fasta: str,
    threshold: float = 0.9,
    min_length: int = 5,
    method: str = "identity",
    seq_type: str = "dna",
) -> dict:
    """Detecta regioes conservadas no alinhamento com significancia estatistica.

    method: "identity" (frequencia do caractere mais comum) ou
            "entropy" (Shannon - entropia baixa = conservado)
    seq_type: "dna", "rna" ou "protein" — afeta alphabet_size para p-values
    """
    alignment = AlignIO.read(aligned_fasta, "fasta")
    n_seqs = len(alignment)
    n_pos = alignment.get_alignment_length()

    # Alphabet size for statistical tests
    alphabet_size = 20 if seq_type == "protein" else 4

    logger.info("Conservation analysis: %d sequences, %d positions, threshold=%.2f, method=%s, seq_type=%s",
                n_seqs, n_pos, threshold, method, seq_type)

    position_identity = []
    position_entropy = []
    position_pvalue = []

    for i in range(n_pos):
        column = [str(alignment[j].seq[i]).upper() for j in range(n_seqs)]
        non_gap = [c for c in column if c not in ('-', '.', 'N', 'X')]

        if not non_gap or len(non_gap) < 2:
            position_identity.append(0.0)
            position_entropy.append(0.0)
            position_pvalue.append(1.0)
            continue

        counts = Counter(non_gap)
        most_common_count = counts.most_common(1)[0][1]
        identity = most_common_count / len(non_gap)
        position_identity.append(round(identity, 4))
        position_entropy.append(round(_shannon_entropy(column), 4))

        # Binomial p-value for this column
        pval = _column_pvalue(non_gap, most_common_count, alphabet_size)
        position_pvalue.append(round(pval, 6))

    # Escolher score para deteccao de regioes
    if method == "entropy":
        # Entropia baixa = conservado; normalizar para 0-1 onde 1 = conservado
        max_entropy = math.log2(alphabet_size)
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
                region_identities = position_identity[start:i]
                region_pvalues = position_pvalue[start:i]
                # Region p-value: geometric mean of column p-values (conservative)
                region_pval = _region_pvalue(region_pvalues)
                regions.append({
                    "start": start,
                    "end": i - 1,
                    "length": i - start,
                    "avg_identity": round(sum(region_identities) / len(region_identities), 4),
                    "p_value": region_pval,
                })
            start = None

    if start is not None and (n_pos - start) >= min_length:
        region_identities = position_identity[start:]
        region_pvalues = position_pvalue[start:]
        region_pval = _region_pvalue(region_pvalues)
        regions.append({
            "start": start,
            "end": n_pos - 1,
            "length": n_pos - start,
            "avg_identity": round(sum(region_identities) / len(region_identities), 4),
            "p_value": region_pval,
        })

    total_conserved = sum(r["length"] for r in regions)

    return {
        "position_identity": position_identity,
        "position_entropy": position_entropy,
        "position_pvalue": position_pvalue,
        "regions": regions,
        "total_positions": n_pos,
        "total_conserved": total_conserved,
        "conservation_pct": round(100 * total_conserved / n_pos, 2) if n_pos > 0 else 0,
        "threshold": threshold,
        "method": method,
        "n_sequences": n_seqs,
        "seq_type": seq_type,
    }


def _region_pvalue(pvalues: list[float]) -> float:
    """Compute region-level p-value using Fisher's method (sum of log p-values).

    More conservative than taking the minimum p-value.
    """
    if not pvalues:
        return 1.0

    # Filter out p=1.0 (non-informative) and p=0.0 (clamp to tiny)
    valid = [max(p, 1e-300) for p in pvalues if p < 1.0]
    if not valid:
        return 1.0

    # Geometric mean of p-values (simple, interpretable)
    log_mean = sum(math.log10(p) for p in valid) / len(valid)
    return round(min(10 ** log_mean, 1.0), 6)
