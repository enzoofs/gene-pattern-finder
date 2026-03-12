from fastapi import APIRouter, Query
from app.services.ncbi import search_species
from app.schemas import SpeciesSearchResult

router = APIRouter(prefix="/api/species", tags=["species"])

@router.get("/search", response_model=list[SpeciesSearchResult])
async def search(q: str = Query(..., min_length=2), limit: int = Query(default=20, ge=1, le=100)):
    results = await search_species(q, max_results=limit)
    return results
