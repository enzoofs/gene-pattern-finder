import numpy as np
from scipy.cluster.hierarchy import linkage, to_tree
from scipy.spatial.distance import squareform
from Bio import AlignIO, SeqIO
from Bio.Seq import Seq
from Bio.SeqRecord import SeqRecord
import subprocess
import tempfile
import os

def _p_distance(seq1: str, seq2: str) -> float:
    diffs = sum(1 for a, b in zip(seq1, seq2) if a != b and a != "-" and b != "-")
    compared = sum(1 for a, b in zip(seq1, seq2) if a != "-" and b != "-")
    return diffs / compared if compared > 0 else 1.0

def _to_newick(node, labels: list[str]) -> str:
    if node.is_leaf():
        return f"{labels[node.id]}:{node.dist:.6f}"
    left = _to_newick(node.get_left(), labels)
    right = _to_newick(node.get_right(), labels)
    return f"({left},{right}):{node.dist:.6f}"

async def build_tree(
    sequences: list[dict],
    query_sequence: str | None = None,
    query_label: str = "query",
    mode: str = "all_vs_all",
) -> dict:
    records = []
    labels = []

    if mode == "query_vs_all" and query_sequence:
        records.append(SeqRecord(Seq(query_sequence), id=query_label, description=""))
        labels.append(query_label)

    for seq in sequences:
        acc = seq["accession"]
        records.append(SeqRecord(Seq(seq["sequence"]), id=acc, description=""))
        labels.append(acc)

    if len(records) < 2:
        return {"newick": "", "labels": labels, "distance_matrix": []}

    tmp_dir = tempfile.mkdtemp()
    try:
        input_path = os.path.join(tmp_dir, "input.fasta")
        aligned_path = os.path.join(tmp_dir, "aligned.fasta")

        SeqIO.write(records, input_path, "fasta")

        try:
            subprocess.run(
                ["muscle", "-align", input_path, "-output", aligned_path],
                check=True, capture_output=True, text=True, timeout=300,
            )
        except FileNotFoundError:
            subprocess.run(
                ["mafft", "--auto", input_path],
                stdout=open(aligned_path, "w"),
                check=True, capture_output=False, timeout=300,
            )

        alignment = AlignIO.read(aligned_path, "fasta")
        n = len(alignment)

        aligned_labels = [rec.id for rec in alignment]

        dist_matrix = np.zeros((n, n))
        for i in range(n):
            for j in range(i + 1, n):
                d = _p_distance(str(alignment[i].seq), str(alignment[j].seq))
                dist_matrix[i][j] = d
                dist_matrix[j][i] = d

        condensed = squareform(dist_matrix)
        Z = linkage(condensed, method="average")

        tree_root = to_tree(Z)
        newick = _to_newick(tree_root, aligned_labels) + ";"

        return {
            "newick": newick,
            "labels": aligned_labels,
            "distance_matrix": dist_matrix.tolist(),
        }

    finally:
        import shutil
        shutil.rmtree(tmp_dir, ignore_errors=True)
