import logging
import math
from collections import Counter, defaultdict
from Bio import AlignIO
from scipy.stats import binom

logger = logging.getLogger(__name__)

# IUPAC degenerate base codes
IUPAC_MAP = {
    frozenset(['A']): 'A', frozenset(['C']): 'C', frozenset(['G']): 'G', frozenset(['T']): 'T',
    frozenset(['A', 'G']): 'R', frozenset(['C', 'T']): 'Y', frozenset(['G', 'C']): 'S',
    frozenset(['A', 'T']): 'W', frozenset(['G', 'T']): 'K', frozenset(['A', 'C']): 'M',
    frozenset(['C', 'G', 'T']): 'B', frozenset(['A', 'G', 'T']): 'D',
    frozenset(['A', 'C', 'T']): 'H', frozenset(['A', 'C', 'G']): 'V',
    frozenset(['A', 'C', 'G', 'T']): 'N',
}


def _background_frequencies(sequences: dict[str, str]) -> dict[str, float]:
    """Compute empirical background nucleotide/amino acid frequencies."""
    counter: Counter = Counter()
    for seq in sequences.values():
        counter.update(c for c in seq if c not in ('-', '.', 'N', 'X'))
    total = sum(counter.values())
    if total == 0:
        return {}
    return {c: count / total for c, count in counter.items()}


def _motif_pvalue(
    k_observed: int,
    n_seqs: int,
    kmer: str,
    bg_freq: dict[str, float],
    avg_seq_len: float,
) -> float:
    """Binomial p-value for observing a k-mer in k_observed out of n_seqs sequences.

    P(kmer at one position) = product of bg_freq[c] for each c in kmer
    P(kmer anywhere in sequence) ≈ 1 - exp(-p_per_pos * (L - k + 1))
    Then: P(X >= k_observed) ~ Binomial(n_seqs, p_in_seq)
    """
    # Probability of k-mer at a single position by chance
    p_per_pos = 1.0
    for c in kmer:
        p_per_pos *= bg_freq.get(c, 0.25)

    # Effective number of positions
    k = len(kmer)
    n_positions = max(1, avg_seq_len - k + 1)

    # Poisson approximation: P(kmer appears at least once)
    expected = p_per_pos * n_positions
    p_in_seq = 1.0 - math.exp(-expected)
    p_in_seq = min(max(p_in_seq, 1e-300), 1.0)

    # Binomial test: H0 is that k_observed sequences contain the kmer by chance
    return float(binom.sf(k_observed - 1, n_seqs, p_in_seq))


def _build_pwm(
    kmer: str,
    positions_per_seq: dict[str, list[int]],
    sequences: dict[str, str],
) -> list[dict[str, float]]:
    """Build Position Weight Matrix from all occurrences of a k-mer."""
    k = len(kmer)
    occurrences = []
    for seq_id, positions in positions_per_seq.items():
        seq = sequences.get(seq_id, "")
        for pos in positions:
            if pos + k <= len(seq):
                occurrences.append(seq[pos:pos + k])

    if not occurrences:
        return []

    alphabet = sorted(set(c for occ in occurrences for c in occ if c not in ('-', '.', 'N', 'X')))
    if not alphabet:
        alphabet = ['A', 'C', 'G', 'T']

    pseudo = 0.01
    pwm = []
    for i in range(k):
        col_counts = Counter(occ[i] for occ in occurrences if i < len(occ) and occ[i] not in ('-', '.', 'N', 'X'))
        total = sum(col_counts.values()) + len(alphabet) * pseudo
        pwm.append({
            base: round((col_counts.get(base, 0) + pseudo) / total, 4)
            for base in alphabet
        })

    return pwm


def _iupac_consensus(pwm: list[dict], seq_type: str = "dna") -> str:
    """Generate IUPAC degenerate consensus from PWM."""
    if seq_type == "protein":
        # For protein: just use most frequent amino acid per position
        consensus = []
        for pos_freqs in pwm:
            if not pos_freqs:
                consensus.append('X')
                continue
            best = max(pos_freqs, key=pos_freqs.get)
            consensus.append(best)
        return ''.join(consensus)

    # DNA/RNA: use IUPAC codes
    consensus = []
    for pos_freqs in pwm:
        if not pos_freqs:
            consensus.append('N')
            continue

        # Get DNA bases only
        dna_freqs = {b: f for b, f in pos_freqs.items() if b in 'ACGTU'}
        if not dna_freqs:
            consensus.append('N')
            continue

        max_freq = max(dna_freqs.values())
        threshold = 0.25 * max_freq

        significant = frozenset(
            b.replace('U', 'T') for b, f in dna_freqs.items()
            if f >= threshold
        )
        consensus.append(IUPAC_MAP.get(significant, 'N'))

    return ''.join(consensus)


def _information_content(pwm: list[dict], bg_freq: dict[str, float], seq_type: str = "dna") -> list[float]:
    """Compute Information Content per position (bits).

    IC = sum_b(f_b * log2(f_b / bg_b)) — relative entropy (KL divergence)
    Max IC for DNA = 2 bits, for protein ≈ 4.3 bits
    """
    ic = []
    default_bg = 0.25 if seq_type != "protein" else 0.05

    for pos_freqs in pwm:
        kl = 0.0
        for base, freq in pos_freqs.items():
            if freq > 0 and base not in ('-', '.', 'N', 'X'):
                bg = bg_freq.get(base, default_bg)
                if bg > 0:
                    kl += freq * math.log2(freq / bg)
        ic.append(round(max(0.0, kl), 4))

    return ic


def _merge_overlapping_kmers(kmers: list[dict]) -> list[dict]:
    """Agrupa k-mers sobrepostos ou contidos em motifs consolidados."""
    if not kmers:
        return []

    sorted_kmers = sorted(kmers, key=lambda x: (-x["length"], x["sequence"]))

    merged = []
    used = set()

    for i, kmer in enumerate(sorted_kmers):
        if i in used:
            continue

        group = [kmer]
        used.add(i)

        for j, other in enumerate(sorted_kmers):
            if j in used:
                continue
            # Check if other is a substring of kmer or vice versa
            if other["sequence"] in kmer["sequence"] or kmer["sequence"] in other["sequence"]:
                group.append(other)
                used.add(j)

        merged.append(_consolidate_group(group))

    return merged


def _consolidate_group(group: list[dict]) -> dict:
    """Consolida um grupo de k-mers sobrepostos em um unico motif."""
    best = max(group, key=lambda x: (x["support"], x["length"]))

    all_positions = {}
    for kmer in group:
        for seq_id, positions in kmer["positions"].items():
            if seq_id not in all_positions:
                all_positions[seq_id] = set()
            all_positions[seq_id].update(positions)

    positions = {k: sorted(v) for k, v in all_positions.items()}

    return {
        "sequence": best["sequence"],
        "length": best["length"],
        "support": best["support"],
        "positions": positions,
        "n_occurrences": sum(len(p) for p in positions.values()),
        # p_value, e_value, pwm, consensus, information_content added later
    }


def discover_motifs(
    aligned_fasta: str,
    min_length: int = 6,
    max_length: int = 20,
    min_support: float = 0.5,
    max_motifs: int = 50,
    seq_type: str = "dna",
) -> dict:
    """Discover motifs with statistical validation.

    Adds p-values, E-values, PWM, IUPAC consensus, and information content
    to each discovered motif.
    """
    alignment = AlignIO.read(aligned_fasta, "fasta")
    n_seqs = len(alignment)
    n_pos = alignment.get_alignment_length()

    logger.info(
        "Motif discovery: %d sequences, %d positions, k=%d-%d, min_support=%.2f, seq_type=%s",
        n_seqs, n_pos, min_length, max_length, min_support, seq_type,
    )

    # Extract gap-stripped sequences
    sequences = {}
    for record in alignment:
        seq_id = record.id
        clean_seq = str(record.seq).upper().replace("-", "").replace(".", "")
        if clean_seq:
            sequences[seq_id] = clean_seq

    if not sequences:
        return {
            "motifs": [],
            "n_sequences": n_seqs,
            "alignment_length": n_pos,
            "total_motifs": 0,
            "parameters": {
                "min_length": min_length,
                "max_length": max_length,
                "min_support": min_support,
            },
            "background_frequencies": {},
            "n_kmers_tested": 0,
        }

    # Compute background frequencies
    bg_freq = _background_frequencies(sequences)
    avg_seq_len = sum(len(s) for s in sequences.values()) / len(sequences)

    min_seqs = max(2, int(n_seqs * min_support))

    # Valid characters for k-mers
    valid_chars = set("ACGTUN") if seq_type != "protein" else set("ACDEFGHIKLMNPQRSTVWY")

    # Count k-mers
    kmer_results = []
    n_kmers_tested = 0

    for k in range(min_length, min(max_length + 1, int(min(len(s) for s in sequences.values())) + 1)):
        kmer_seqs = defaultdict(set)
        kmer_positions = defaultdict(lambda: defaultdict(list))

        for seq_id, seq in sequences.items():
            for i in range(len(seq) - k + 1):
                kmer = seq[i:i + k]
                if all(c in valid_chars for c in kmer):
                    kmer_seqs[kmer].add(seq_id)
                    kmer_positions[kmer][seq_id].append(i)

        n_kmers_tested += len(kmer_seqs)

        for kmer, seq_ids in kmer_seqs.items():
            if len(seq_ids) >= min_seqs:
                support = len(seq_ids) / n_seqs
                kmer_results.append({
                    "sequence": kmer,
                    "length": k,
                    "support": round(support, 4),
                    "positions": dict(kmer_positions[kmer]),
                })

    # Merge overlapping k-mers
    motifs = _merge_overlapping_kmers(kmer_results)

    # Add statistical validation to each motif
    for motif in motifs:
        k_observed = int(round(motif["support"] * n_seqs))

        # P-value
        pval = _motif_pvalue(k_observed, n_seqs, motif["sequence"], bg_freq, avg_seq_len)
        motif["p_value"] = round(pval, 8)

        # E-value (Bonferroni correction)
        motif["e_value"] = round(min(pval * max(n_kmers_tested, 1), 1e6), 6)

        # PWM
        pwm = _build_pwm(motif["sequence"], motif["positions"], sequences)
        motif["pwm"] = pwm

        # IUPAC consensus from PWM
        if pwm:
            motif["consensus"] = _iupac_consensus(pwm, seq_type)
        else:
            motif["consensus"] = motif["sequence"]

        # Information Content
        if pwm:
            motif["information_content"] = _information_content(pwm, bg_freq, seq_type)
        else:
            motif["information_content"] = []

    # Sort by p-value (ascending), then by support (descending)
    motifs.sort(key=lambda m: (m.get("p_value", 1.0), -m["support"]))

    # Limit quantity
    motifs = motifs[:max_motifs]

    logger.info(
        "Found %d motifs from %d raw k-mers, %d tested",
        len(motifs), len(kmer_results), n_kmers_tested,
    )

    return {
        "motifs": motifs,
        "n_sequences": n_seqs,
        "alignment_length": n_pos,
        "total_motifs": len(motifs),
        "parameters": {
            "min_length": min_length,
            "max_length": max_length,
            "min_support": min_support,
        },
        "background_frequencies": {k: round(v, 4) for k, v in bg_freq.items()},
        "n_kmers_tested": n_kmers_tested,
    }
