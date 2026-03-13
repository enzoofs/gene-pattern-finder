"""Testes para parsing de bootstrap e validacao de Newick."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.iqtree import _extract_bootstrap_values


class TestExtractBootstrapValues:
    def test_single_bootstrap(self):
        newick = "((A:0.1,B:0.2)95:0.3,C:0.4);"
        values = _extract_bootstrap_values(newick)
        assert len(values) == 1
        assert values[0]["ufboot"] == 95.0

    def test_bootstrap_with_sh_alrt(self):
        newick = "((A:0.1,B:0.2)95/87:0.3,C:0.4);"
        values = _extract_bootstrap_values(newick)
        assert len(values) == 1
        assert values[0]["ufboot"] == 95.0
        assert values[0]["sh_alrt"] == 87.0

    def test_multiple_bootstrap_values(self):
        newick = "(((A:0.1,B:0.2)100:0.3,(C:0.1,D:0.2)75:0.3)90:0.5,E:0.4);"
        values = _extract_bootstrap_values(newick)
        assert len(values) == 3
        ufboot_values = sorted([v["ufboot"] for v in values])
        assert ufboot_values == [75.0, 90.0, 100.0]

    def test_no_bootstrap(self):
        newick = "((A:0.1,B:0.2):0.3,C:0.4);"
        values = _extract_bootstrap_values(newick)
        assert len(values) == 0

    def test_empty_newick(self):
        values = _extract_bootstrap_values("")
        assert values == []

    def test_decimal_bootstrap(self):
        newick = "((A:0.1,B:0.2)99.5:0.3,C:0.4);"
        values = _extract_bootstrap_values(newick)
        assert len(values) == 1
        assert values[0]["ufboot"] == 99.5
