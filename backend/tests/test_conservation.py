"""Testes para deteccao de regioes conservadas e entropia de Shannon."""
import sys
import os
import tempfile
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.conservation import detect_conserved_regions, _shannon_entropy


class TestShannonEntropy:
    def test_perfectly_conserved(self):
        """Coluna com todos iguais -> entropia 0."""
        assert _shannon_entropy(["A", "A", "A", "A"]) == 0.0

    def test_maximally_variable(self):
        """Coluna com 4 bases diferentes -> entropia maxima (2.0 para 4 simbolos)."""
        entropy = _shannon_entropy(["A", "C", "G", "T"])
        assert abs(entropy - 2.0) < 0.001

    def test_two_equal_groups(self):
        """50/50 -> entropia 1.0."""
        entropy = _shannon_entropy(["A", "A", "C", "C"])
        assert abs(entropy - 1.0) < 0.001

    def test_gaps_ignored(self):
        """Gaps devem ser ignorados no calculo."""
        entropy = _shannon_entropy(["A", "A", "-", "-"])
        assert entropy == 0.0

    def test_empty_column(self):
        assert _shannon_entropy([]) == 0.0

    def test_all_gaps(self):
        assert _shannon_entropy(["-", "-", "-"]) == 0.0


class TestDetectConservedRegions:
    def _write_fasta(self, sequences: list[tuple[str, str]]) -> str:
        """Escreve FASTA temporario e retorna o path."""
        fd, path = tempfile.mkstemp(suffix=".fasta")
        with os.fdopen(fd, "w") as f:
            for name, seq in sequences:
                f.write(f">{name}\n{seq}\n")
        return path

    def test_fully_conserved(self):
        """Sequencias identicas -> 100% conservacao."""
        path = self._write_fasta([
            ("seq1", "AAAAAAAAAA"),
            ("seq2", "AAAAAAAAAA"),
            ("seq3", "AAAAAAAAAA"),
        ])
        try:
            result = detect_conserved_regions(path, threshold=0.9, min_length=3)
            assert result["conservation_pct"] == 100.0
            assert result["total_positions"] == 10
            assert result["total_conserved"] == 10
            assert len(result["regions"]) == 1
            assert result["n_sequences"] == 3
            # Entropia deve ser toda zero
            assert all(e == 0.0 for e in result["position_entropy"])
        finally:
            os.unlink(path)

    def test_fully_divergent(self):
        """Sequencias completamente diferentes -> 0% conservacao."""
        path = self._write_fasta([
            ("seq1", "AAAAAAAAAA"),
            ("seq2", "CCCCCCCCCC"),
            ("seq3", "GGGGGGGGGG"),
        ])
        try:
            result = detect_conserved_regions(path, threshold=0.9, min_length=3)
            assert result["conservation_pct"] == 0
            assert result["total_conserved"] == 0
            assert len(result["regions"]) == 0
        finally:
            os.unlink(path)

    def test_partial_conservation(self):
        """Regiao conservada no inicio, divergente no fim."""
        path = self._write_fasta([
            ("seq1", "AAAAACCCCC"),
            ("seq2", "AAAAAGGGGG"),
            ("seq3", "AAAAATTTTT"),
        ])
        try:
            result = detect_conserved_regions(path, threshold=0.9, min_length=3)
            # Primeiros 5 sao conservados, ultimos 5 divergentes
            assert len(result["regions"]) == 1
            assert result["regions"][0]["start"] == 0
            assert result["regions"][0]["end"] == 4
            assert result["regions"][0]["length"] == 5
        finally:
            os.unlink(path)

    def test_min_length_filter(self):
        """Regioes menores que min_length nao sao reportadas."""
        path = self._write_fasta([
            ("seq1", "AACAACAACA"),
            ("seq2", "AAGAAGAAGA"),
            ("seq3", "AATAATAATA"),
        ])
        try:
            result = detect_conserved_regions(path, threshold=0.9, min_length=5)
            # Pares de AA conservados sao muito curtos (2 posicoes)
            assert result["total_conserved"] == 0
        finally:
            os.unlink(path)

    def test_position_identity_range(self):
        """Todos os valores de identidade devem estar entre 0 e 1."""
        path = self._write_fasta([
            ("seq1", "ATCGATCG"),
            ("seq2", "ATCGATCG"),
            ("seq3", "ATCGATCG"),
            ("seq4", "GCTAGCTA"),
        ])
        try:
            result = detect_conserved_regions(path)
            for val in result["position_identity"]:
                assert 0.0 <= val <= 1.0
            for val in result["position_entropy"]:
                assert val >= 0.0
        finally:
            os.unlink(path)

    def test_entropy_method(self):
        """Metodo entropy deve funcionar sem erros."""
        path = self._write_fasta([
            ("seq1", "AAAAAAAAAA"),
            ("seq2", "AAAAAAAAAA"),
        ])
        try:
            result = detect_conserved_regions(path, method="entropy")
            assert result["method"] == "entropy"
            assert "position_entropy" in result
        finally:
            os.unlink(path)
