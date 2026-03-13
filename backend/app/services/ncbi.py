import asyncio
import logging
import time
from functools import partial
from Bio import Entrez, SeqIO
from io import StringIO
from app.config import settings
from app.models import SeqType

logger = logging.getLogger(__name__)

Entrez.email = settings.ncbi_email
Entrez.timeout = 30
if settings.ncbi_api_key:
    Entrez.api_key = settings.ncbi_api_key

MAX_RETRIES = 3
RETRY_DELAY = 2


async def _to_thread(func, *args, **kwargs):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, partial(func, *args, **kwargs))


def _search_species_sync(query: str, max_results: int = 20) -> list[dict]:
    for attempt in range(MAX_RETRIES):
        try:
            if query.strip().isdigit():
                handle = Entrez.efetch(db="taxonomy", id=query.strip(), retmode="xml")
                records = Entrez.read(handle)
                handle.close()
            else:
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
        except Exception as e:
            logger.warning("NCBI species search attempt %d failed: %s", attempt + 1, e)
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY * (attempt + 1))
            else:
                raise


async def search_species(query: str, max_results: int = 20) -> list[dict]:
    return await _to_thread(_search_species_sync, query, max_results)


def _get_db_for_type(seq_type: SeqType) -> str:
    if seq_type == SeqType.protein:
        return "protein"
    return "nucleotide"


def _fetch_sequences_sync(taxon_id: int, seq_type: SeqType, max_results: int = 50, gene: str = "") -> list[dict]:
    db = _get_db_for_type(seq_type)

    # Build search term with RefSeq filter and reasonable size range
    base_term = f"txid{taxon_id}[Organism]"
    if gene:
        # Filtro por gene/titulo — busca no titulo e no campo gene
        base_term += f" AND ({gene}[Gene] OR {gene}[Title])"
    if seq_type == SeqType.protein:
        term = f"{base_term} AND refseq[filter] AND 50:5000[SLEN]"
    else:
        term = f"{base_term} AND refseq[filter] AND 100:10000[SLEN]"

    for attempt in range(MAX_RETRIES):
        try:
            return _do_fetch_sequences(db, base_term, term, seq_type, max_results)
        except Exception as e:
            logger.warning("NCBI fetch_sequences attempt %d failed: %s", attempt + 1, e)
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY * (attempt + 1))
            else:
                raise


def _do_fetch_sequences(db: str, base_term: str, term: str, seq_type: SeqType, max_results: int) -> list[dict]:
    logger.info("NCBI search: db=%s term=%s max=%d", db, term, max_results)

    handle = Entrez.esearch(db=db, term=term, retmax=max_results, usehistory="y")
    result = Entrez.read(handle)
    handle.close()

    count = int(result["Count"])
    logger.info("NCBI search returned count=%d", count)

    if count == 0:
        # Fallback sem RefSeq filter
        if seq_type == SeqType.protein:
            term = f"{base_term} AND 50:5000[SLEN]"
        else:
            term = f"{base_term} AND 100:10000[SLEN]"
        handle = Entrez.esearch(db=db, term=term, retmax=max_results, usehistory="y")
        result = Entrez.read(handle)
        handle.close()
        count = int(result["Count"])
        if count == 0:
            return []

    webenv = result["WebEnv"]
    query_key = result["QueryKey"]

    # Fetch only up to max_results, capped to avoid huge downloads
    fetch_count = min(max_results, count)
    logger.info("NCBI efetch: fetching %d sequences", fetch_count)

    handle = Entrez.efetch(
        db=db,
        query_key=query_key,
        WebEnv=webenv,
        rettype="fasta",
        retmode="text",
        retmax=fetch_count,
    )
    fasta_text = handle.read()
    handle.close()

    sequences = []
    for record in SeqIO.parse(StringIO(fasta_text), "fasta"):
        seq_str = str(record.seq)
        if len(seq_str) == 0:
            continue
        sequences.append({
            "accession": record.id.split(".")[0] if "." in record.id else record.id,
            "title": record.description,
            "sequence": seq_str,
            "length": len(seq_str),
        })

    return sequences


async def fetch_sequences(taxon_id: int, seq_type: SeqType, max_results: int = 50, gene: str = "") -> list[dict]:
    return await _to_thread(_fetch_sequences_sync, taxon_id, seq_type, max_results, gene)
