"""Testes para validacao de sequencias (DNA, RNA, proteina)."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.utils.sequence import validate_dna, validate_rna, validate_protein, clean_sequence


class TestValidateDNA:
    def test_valid_dna(self):
        assert validate_dna("ATCGATCG") is True

    def test_valid_dna_lowercase(self):
        assert validate_dna("atcgatcg") is True

    def test_valid_dna_with_n(self):
        assert validate_dna("ATCGNNNNATCG") is True

    def test_invalid_dna_with_u(self):
        assert validate_dna("AUCGAUCG") is False

    def test_invalid_dna_with_protein_chars(self):
        assert validate_dna("MKVLWAALLLL") is False

    def test_empty_string(self):
        assert validate_dna("") is False


class TestValidateRNA:
    def test_valid_rna(self):
        assert validate_rna("AUCGAUCG") is True

    def test_valid_rna_with_n(self):
        assert validate_rna("AUCGNNN") is True

    def test_invalid_rna_with_t(self):
        assert validate_rna("ATCGATCG") is False

    def test_empty_string(self):
        assert validate_rna("") is False


class TestValidateProtein:
    def test_valid_protein(self):
        assert validate_protein("MKVLWAALLLL") is True

    def test_valid_protein_with_stop(self):
        assert validate_protein("MKVLWA*") is True

    def test_invalid_protein_with_numbers(self):
        assert validate_protein("MKV123") is False

    def test_empty_string(self):
        assert validate_protein("") is False


class TestCleanSequence:
    def test_removes_whitespace(self):
        assert clean_sequence("AT CG\nATCG\t") == "ATCGATCG"

    def test_uppercases(self):
        assert clean_sequence("atcg") == "ATCG"

    def test_preserves_content(self):
        assert clean_sequence("MKVLWA") == "MKVLWA"
