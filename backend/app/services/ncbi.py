from Bio import Entrez, SeqIO
from io import StringIO
from app.config import settings
from app.models import SeqType

Entrez.email = settings.ncbi_email
if settings.ncbi_api_key:
    Entrez.api_key = settings.ncbi_api_key

async def search_species(query: str, max_results: int = 20) -> list[dict]:
    handle = Entrez.esearch(db="taxonomy", term=query, retmax=max_results)
    result = Entrez.read(handle)
    handle.close()

    if not result["IdList"]:
        return []

    handle = Entrez.efetch(db="taxonomy", id=",".join(result["IdList"]), retmode="xml")
    records = Entrez.read(handle)
    handle.close()

    return [
        {
            "taxon_id": int(rec["TaxId"]),
            "name": rec["ScientificName"],
            "rank": rec.get("Rank", "unknown"),
            "lineage": rec.get("Lineage", ""),
        }
        for rec in records
    ]

def _get_db_for_type(seq_type: SeqType) -> str:
    if seq_type == SeqType.protein:
        return "protein"
    return "nucleotide"

def _get_rettype_for_type(seq_type: SeqType) -> str:
    return "fasta"

async def fetch_sequences(taxon_id: int, seq_type: SeqType, max_results: int = 50) -> list[dict]:
    db = _get_db_for_type(seq_type)
    term = f"txid{taxon_id}[Organism]"

    handle = Entrez.esearch(db=db, term=term, retmax=max_results)
    result = Entrez.read(handle)
    handle.close()

    if not result["IdList"]:
        return []

    handle = Entrez.efetch(
        db=db,
        id=",".join(result["IdList"]),
        rettype="fasta",
        retmode="text",
    )
    fasta_text = handle.read()
    handle.close()

    sequences = []
    for record in SeqIO.parse(StringIO(fasta_text), "fasta"):
        sequences.append({
            "accession": record.id.split(".")[0] if "." in record.id else record.id,
            "title": record.description,
            "sequence": str(record.seq),
            "length": len(record.seq),
        })

    return sequences
