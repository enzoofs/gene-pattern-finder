import logging
from fastapi import APIRouter, Query, HTTPException
from app.services.ncbi import search_species
from app.schemas import SpeciesSearchResult

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/species", tags=["species"])

@router.get("/search", response_model=list[SpeciesSearchResult])
async def search(q: str = Query(..., min_length=2), limit: int = Query(default=20, ge=1, le=100)):
    try:
        results = await search_species(q, max_results=limit)
        return results
    except Exception as e:
        logger.error("Species search failed for q=%s: %s", q, e)
        raise HTTPException(status_code=502, detail=f"NCBI indisponível: {e}")
