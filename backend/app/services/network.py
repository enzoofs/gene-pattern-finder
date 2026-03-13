import logging
import numpy as np
from Bio import AlignIO
from scipy.sparse.csgraph import minimum_spanning_tree, connected_components, shortest_path
from scipy.sparse import csr_matrix
from app.services.distance import compute_distance_matrix

logger = logging.getLogger(__name__)


def infer_network(
    aligned_fasta: str,
    threshold: float = 0.1,
    cluster_labels: dict | None = None,
    dist_matrix: np.ndarray | None = None,
    seq_labels: list[str] | None = None,
    seq_type: str = "dna",
) -> dict:
    """Build similarity network with graph metrics.

    Improvements over v1:
    - Uses shared pre-computed distance matrix (no duplicate computation)
    - Adds degree centrality, betweenness centrality per node
    - Identifies hub nodes (degree > mean + std)
    - Reports connected components
    """
    alignment = AlignIO.read(aligned_fasta, "fasta")
    n_seqs = len(alignment)

    logger.info("Network inference: %d sequences, threshold=%.3f", n_seqs, threshold)

    # Use pre-computed or compute
    if dist_matrix is None or seq_labels is None:
        dist_matrix, seq_labels = compute_distance_matrix(aligned_fasta, seq_type=seq_type)

    # MST
    sparse_dist = csr_matrix(dist_matrix)
    mst = minimum_spanning_tree(sparse_dist)
    mst_dense = mst.toarray()

    # Collect MST edges
    edges = []
    edge_set = set()

    for i in range(n_seqs):
        for j in range(n_seqs):
            if mst_dense[i][j] > 0:
                edge_key = (min(i, j), max(i, j))
                if edge_key not in edge_set:
                    edge_set.add(edge_key)
                    edges.append({
                        "source": seq_labels[i],
                        "target": seq_labels[j],
                        "weight": round(float(mst_dense[i][j]), 4),
                        "is_mst": True,
                    })

    # Extra edges below threshold
    for i in range(n_seqs):
        for j in range(i + 1, n_seqs):
            edge_key = (i, j)
            if edge_key not in edge_set and dist_matrix[i][j] <= threshold:
                edges.append({
                    "source": seq_labels[i],
                    "target": seq_labels[j],
                    "weight": round(float(dist_matrix[i][j]), 4),
                    "is_mst": False,
                })

    # Build adjacency matrix for graph metrics
    adj = np.zeros((n_seqs, n_seqs))
    weighted_adj = np.full((n_seqs, n_seqs), np.inf)
    np.fill_diagonal(weighted_adj, 0)

    label_to_idx = {lbl: i for i, lbl in enumerate(seq_labels)}
    for edge in edges:
        i = label_to_idx[edge["source"]]
        j = label_to_idx[edge["target"]]
        adj[i][j] = adj[j][i] = 1.0
        weighted_adj[i][j] = weighted_adj[j][i] = edge["weight"]

    # Degree centrality
    degree = adj.sum(axis=1)
    max_possible_degree = n_seqs - 1 if n_seqs > 1 else 1
    degree_centrality = {
        seq_labels[i]: round(float(degree[i] / max_possible_degree), 4)
        for i in range(n_seqs)
    }

    # Hub nodes: degree > mean + std
    mean_degree = degree.mean()
    std_degree = degree.std()
    hub_threshold = mean_degree + std_degree
    hub_nodes = [seq_labels[i] for i in range(n_seqs) if degree[i] > hub_threshold]

    # Connected components
    sparse_adj = csr_matrix(adj)
    n_components, comp_labels = connected_components(sparse_adj, directed=False)

    # Betweenness centrality (only for small graphs, O(n^3))
    betweenness_centrality = {}
    if n_seqs <= 100:
        try:
            sp = shortest_path(csr_matrix(weighted_adj), directed=False)
            betweenness = np.zeros(n_seqs)

            for s in range(n_seqs):
                for t in range(s + 1, n_seqs):
                    path_dist = sp[s][t]
                    if np.isinf(path_dist):
                        continue
                    for v in range(n_seqs):
                        if v == s or v == t:
                            continue
                        if abs(sp[s][v] + sp[v][t] - path_dist) < 1e-9:
                            betweenness[v] += 1

            n_pairs = max((n_seqs - 1) * (n_seqs - 2) / 2, 1)
            betweenness_centrality = {
                seq_labels[i]: round(float(betweenness[i] / n_pairs), 4)
                for i in range(n_seqs)
            }
        except Exception as e:
            logger.warning("Betweenness centrality failed: %s", e)

    # Build nodes
    nodes = []
    for i, label in enumerate(seq_labels):
        cluster = None
        if cluster_labels and label in cluster_labels:
            cluster = cluster_labels[label]

        nodes.append({
            "id": label,
            "label": label,
            "cluster": cluster,
            "degree_centrality": degree_centrality.get(label, 0),
            "betweenness_centrality": betweenness_centrality.get(label, 0),
            "is_hub": label in hub_nodes,
        })

    # Stats
    all_weights = [e["weight"] for e in edges]
    mst_weights = [e["weight"] for e in edges if e["is_mst"]]

    stats = {
        "n_nodes": len(nodes),
        "n_edges": len(edges),
        "n_mst_edges": len(mst_weights),
        "n_extra_edges": len(edges) - len(mst_weights),
        "avg_distance": round(float(np.mean(all_weights)), 4) if all_weights else 0,
        "min_distance": round(float(np.min(all_weights)), 4) if all_weights else 0,
        "max_distance": round(float(np.max(all_weights)), 4) if all_weights else 0,
        "threshold": threshold,
        "n_components": int(n_components),
        "hub_nodes": hub_nodes,
        "degree_centrality": degree_centrality,
        "betweenness_centrality": betweenness_centrality,
    }

    logger.info(
        "Network complete: %d nodes, %d edges (%d MST + %d extra), %d hubs, %d components",
        stats["n_nodes"], stats["n_edges"], stats["n_mst_edges"],
        stats["n_extra_edges"], len(hub_nodes), n_components,
    )

    return {
        "nodes": nodes,
        "edges": edges,
        "stats": stats,
    }
