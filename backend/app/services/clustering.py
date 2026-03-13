import logging
import numpy as np
from Bio import AlignIO
from scipy.cluster.hierarchy import linkage, fcluster, cophenet
from scipy.spatial.distance import squareform
from app.services.distance import compute_distance_matrix

logger = logging.getLogger(__name__)


def _silhouette_score(dist_matrix: np.ndarray, labels: np.ndarray) -> float:
    """Compute silhouette score using precomputed distance matrix."""
    n = len(labels)
    unique_labels = np.unique(labels)

    if len(unique_labels) < 2 or len(unique_labels) >= n:
        return -1.0

    scores = []
    for i in range(n):
        cluster_i = labels[i]

        intra = [dist_matrix[i][j] for j in range(n) if labels[j] == cluster_i and j != i]
        a_i = np.mean(intra) if intra else 0.0

        b_i = float('inf')
        for c in unique_labels:
            if c == cluster_i:
                continue
            inter = [dist_matrix[i][j] for j in range(n) if labels[j] == c]
            if inter:
                b_i = min(b_i, np.mean(inter))

        if b_i == float('inf'):
            b_i = 0.0

        denom = max(a_i, b_i)
        scores.append((b_i - a_i) / denom if denom > 0 else 0.0)

    return float(np.mean(scores))


def _bootstrap_clustering(
    aligned_fasta: str,
    n_bootstrap: int,
    method: str,
    best_k: int,
    dist_matrix: np.ndarray,
    seq_labels: list[str],
) -> dict[str, float]:
    """Bootstrap resampling of alignment columns to assess cluster stability.

    For each replicate:
    1. Resample alignment columns with replacement
    2. Compute p-distance matrix on resampled alignment
    3. Cluster with same method and k
    4. Track co-occurrence (how often pairs end up in same cluster)

    Returns per-sequence stability scores (0-1).
    """
    alignment = AlignIO.read(aligned_fasta, "fasta")
    n_seqs = len(alignment)
    n_pos = alignment.get_alignment_length()

    # Convert alignment to NumPy 2D character array for fast column resampling
    seqs = np.array([list(str(record.seq).upper()) for record in alignment])
    not_gap = (seqs != '-') & (seqs != '.')

    # Main clustering labels for comparison
    condensed_main = squareform(dist_matrix)
    condensed_main = np.nan_to_num(condensed_main, nan=0.0)
    condensed_main = np.clip(condensed_main, 0, None)
    main_labels = fcluster(linkage(condensed_main, method=method), best_k, criterion="maxclust")

    # Co-occurrence matrix
    co_occur = np.zeros((n_seqs, n_seqs))

    for b in range(n_bootstrap):
        # Resample columns with replacement
        cols = np.random.randint(0, n_pos, size=n_pos)
        resampled = seqs[:, cols]
        resamp_not_gap = not_gap[:, cols]

        # Vectorized p-distance on resampled alignment
        sub_dist = np.zeros((n_seqs, n_seqs))
        for i in range(n_seqs):
            for j in range(i + 1, n_seqs):
                valid = resamp_not_gap[i] & resamp_not_gap[j]
                n_valid = valid.sum()
                if n_valid == 0:
                    d = 1.0
                else:
                    d = float((resampled[i][valid] != resampled[j][valid]).sum()) / n_valid
                sub_dist[i][j] = sub_dist[j][i] = d

        condensed = squareform(sub_dist)
        condensed = np.nan_to_num(condensed, nan=0.0)
        condensed = np.clip(condensed, 0, None)

        try:
            Z_boot = linkage(condensed, method=method)
            boot_labels = fcluster(Z_boot, best_k, criterion="maxclust")
        except Exception:
            continue

        for i in range(n_seqs):
            for j in range(i + 1, n_seqs):
                if boot_labels[i] == boot_labels[j]:
                    co_occur[i][j] += 1
                    co_occur[j][i] += 1

    co_occur /= max(n_bootstrap, 1)

    # Per-sequence stability: mean co-occurrence with cluster-mates
    stability = {}
    for i, lbl in enumerate(seq_labels):
        mates = [j for j in range(n_seqs) if main_labels[j] == main_labels[i] and j != i]
        if mates:
            stability[lbl] = round(float(np.mean([co_occur[i][j] for j in mates])), 4)
        else:
            stability[lbl] = 1.0

    return stability


def cluster_sequences(
    aligned_fasta: str,
    n_clusters: int | None = None,
    method: str = "average",
    dist_matrix: np.ndarray | None = None,
    seq_labels: list[str] | None = None,
    n_bootstrap: int = 100,
    seq_type: str = "dna",
) -> dict:
    """Cluster sequences using hierarchical agglomerative clustering (UPGMA).

    Improvements over v1:
    - Uses UPGMA (average) instead of Ward (correct for non-Euclidean distances)
    - Accepts pre-computed distance matrix (Kimura 2-param from distance.py)
    - Adds bootstrap resampling for cluster stability
    - Adds cophenetic correlation for dendrogram quality validation
    """
    alignment = AlignIO.read(aligned_fasta, "fasta")
    n_seqs = len(alignment)

    logger.info("Clustering: %d sequences, method=%s, n_clusters=%s, n_bootstrap=%d",
                n_seqs, method, n_clusters, n_bootstrap)

    # Use pre-computed distance matrix or compute one
    if dist_matrix is None or seq_labels is None:
        dist_matrix, seq_labels = compute_distance_matrix(aligned_fasta, seq_type=seq_type)

    # Convert to condensed form
    condensed = squareform(dist_matrix)
    condensed = np.nan_to_num(condensed, nan=0.0)
    condensed = np.clip(condensed, 0, None)

    # Hierarchical clustering
    Z = linkage(condensed, method=method)

    # Cophenetic correlation (quality metric)
    cophenetic_r_val, _ = cophenet(Z, condensed)
    cophenetic_r_val = round(float(cophenetic_r_val), 4)

    # Determine optimal number of clusters
    best_k = n_clusters
    best_score = -1.0

    if best_k is None:
        max_k = min(n_seqs - 1, 20)
        for k in range(2, max_k + 1):
            cluster_labels = fcluster(Z, k, criterion="maxclust")
            score = _silhouette_score(dist_matrix, cluster_labels)
            if score > best_score:
                best_score = score
                best_k = k

        if best_k is None:
            best_k = 2

    cluster_labels = fcluster(Z, best_k, criterion="maxclust")
    final_score = _silhouette_score(dist_matrix, cluster_labels)

    # Bootstrap resampling
    bootstrap_stability = {}
    if n_bootstrap > 0 and n_seqs >= 4:
        try:
            bootstrap_stability = _bootstrap_clustering(
                aligned_fasta, n_bootstrap, method, best_k, dist_matrix, seq_labels
            )
        except Exception as e:
            logger.warning("Bootstrap failed: %s", e)

    # Build result
    dendrogram_data = Z.tolist()
    distance_matrix_list = dist_matrix.tolist()

    cluster_assignments = {}
    for i, seq_label in enumerate(seq_labels):
        cluster_assignments[seq_label] = int(cluster_labels[i])

    avg_stability = round(float(np.mean(list(bootstrap_stability.values()))), 4) if bootstrap_stability else None

    logger.info("Clustering complete: %d clusters, silhouette=%.3f, cophenetic_r=%.3f",
                best_k, final_score, cophenetic_r_val)

    return {
        "labels": cluster_assignments,
        "dendrogram_data": dendrogram_data,
        "distance_matrix": distance_matrix_list,
        "sequence_labels": seq_labels,
        "n_clusters": best_k,
        "silhouette_score": round(final_score, 4),
        "method": method,
        "n_sequences": n_seqs,
        "cophenetic_r": cophenetic_r_val,
        "bootstrap_stability": bootstrap_stability,
        "avg_bootstrap_stability": avg_stability,
        "n_bootstrap": n_bootstrap,
    }
