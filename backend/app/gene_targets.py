# Catalogo de genes-alvo para selecao automatica
# Cada gene tem um termo de busca NCBI e uma descricao amigavel

from dataclasses import dataclass


@dataclass(frozen=True)
class GeneTarget:
    id: str
    gene_query: str  # termo usado na busca NCBI (campo Gene/Title)
    label: str
    description: str
    seq_type: str  # dna, rna, protein


# Lista curada de genes comuns para analise comparativa
GENE_TARGETS: list[GeneTarget] = [
    GeneTarget(
        id="cox1",
        gene_query="cytochrome c oxidase subunit I",
        label="COX1",
        description="Citocromo c oxidase I — gene mitocondrial universal para animais (DNA barcode)",
        seq_type="dna",
    ),
    GeneTarget(
        id="cytb",
        gene_query="cytochrome b",
        label="Citocromo b",
        description="Gene mitocondrial para vertebrados — bom para comparar mamiferos e aves",
        seq_type="dna",
    ),
    GeneTarget(
        id="16s",
        gene_query="16S ribosomal RNA",
        label="16S rRNA",
        description="Gene ribossomal para bacterias — padrao ouro em microbiologia",
        seq_type="dna",
    ),
    GeneTarget(
        id="rbcl",
        gene_query="rbcL",
        label="rbcL",
        description="RuBisCO large subunit — gene de cloroplasto para plantas",
        seq_type="dna",
    ),
    GeneTarget(
        id="matk",
        gene_query="matK",
        label="matK",
        description="Maturase K — gene de cloroplasto, complementar ao rbcL para plantas",
        seq_type="dna",
    ),
    GeneTarget(
        id="its",
        gene_query="internal transcribed spacer",
        label="ITS",
        description="Espacador transcrito interno — padrao para identificacao de fungos",
        seq_type="dna",
    ),
]

# Indice por ID pra busca rapida
GENE_TARGETS_BY_ID: dict[str, GeneTarget] = {g.id: g for g in GENE_TARGETS}
