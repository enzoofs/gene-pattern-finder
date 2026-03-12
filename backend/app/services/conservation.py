import logging
from collections import Counter
from Bio import AlignIO

logger = logging.getLogger(__name__)


def detect_conserved_regions(
    aligned_fasta: str,
    threshold: float = 0.9,
    min_length: int = 5,
) -> dict:
    alignment = AlignIO.read(aligned_fasta, "fasta")
    n_seqs = len(alignment)
    n_pos = alignment.get_alignment_length()

    logger.info("Conservation analysis: %d sequences, %d positions, threshold=%.2f", n_seqs, n_pos, threshold)

    position_identity = []
    for i in range(n_pos):
        column = alignment[:, i]
        non_gap = [c for c in column if c != "-"]
        if not non_gap:
            position_identity.append(0.0)
            continue
        counts = Counter(non_gap)
        most_common_count = counts.most_common(1)[0][1]
        identity = most_common_count / len(non_gap)
        position_identity.append(round(identity, 4))

    regions = []
    start = None
    for i, ident in enumerate(position_identity):
        if ident >= threshold:
            if start is None:
                start = i
        else:
            if start is not None and (i - start) >= min_length:
                region_identities = position_identity[start:i]
                regions.append({
                    "start": start,
                    "end": i - 1,
                    "length": i - start,
                    "avg_identity": round(sum(region_identities) / len(region_identities), 4),
                })
            start = None

    if start is not None and (n_pos - start) >= min_length:
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
        "regions": regions,
        "total_positions": n_pos,
        "total_conserved": total_conserved,
        "conservation_pct": round(100 * total_conserved / n_pos, 2) if n_pos > 0 else 0,
        "threshold": threshold,
        "n_sequences": n_seqs,
    }
