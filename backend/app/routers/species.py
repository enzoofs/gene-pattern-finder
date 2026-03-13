import logging

import redis
from fastapi import APIRouter, Query, HTTPException

from app.config import settings
from app.services.ncbi import search_species
from app.schemas import SpeciesSearchResult

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/species", tags=["species"])

# Rate limiting para proteger contra bloqueio do NCBI
_redis_client: redis.Redis | None = None

def _get_redis() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(settings.redis_url)
    return _redis_client

def _check_ncbi_rate_limit():
    """Limita chamadas ao NCBI usando contador Redis com TTL de 1s."""
    try:
        r = _get_redis()
        key = "ncbi_rate_limit"
        # 3 req/s sem API key, 10 req/s com key
        max_per_second = 10 if settings.ncbi_api_key else 3
        current = r.get(key)
        if current and int(current) >= max_per_second:
            raise HTTPException(
                status_code=429,
                detail="Muitas buscas simultaneas. Aguarde 1 segundo e tente novamente."
            )
        pipe = r.pipeline()
        pipe.incr(key)
        pipe.expire(key, 1)
        pipe.execute()
    except HTTPException:
        raise
    except Exception:
        # Se Redis falhar, nao bloqueia a requisicao
        pass


@router.get("/search", response_model=list[SpeciesSearchResult])
async def search(q: str = Query(..., min_length=2), limit: int = Query(default=20, ge=1, le=100)):
    _check_ncbi_rate_limit()
    try:
        results = await search_species(q, max_results=limit)
        return results
    except Exception as e:
        logger.error("Species search failed for q=%s: %s", q, e)
        raise HTTPException(status_code=502, detail=f"NCBI indisponivel: {e}")
