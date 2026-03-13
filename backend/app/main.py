import logging
import uuid as uuid_mod
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import engine, Base
from app.routers import species, sequences, collections, jobs, exports

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()

app = FastAPI(
    title="Gene Pattern Finder",
    description="TimeLabs - Genetic Sequence Analysis Platform",
    version="0.4.0",
    lifespan=lifespan,
)

# CORS restrito a origens configuradas
origins = [o.strip() for o in settings.allowed_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(species.router)
app.include_router(sequences.router)
app.include_router(collections.router)
app.include_router(jobs.router)
app.include_router(jobs.ws_router)
app.include_router(exports.router)


# Middleware de request ID para rastreamento de logs
@app.middleware("http")
async def add_request_id(request: Request, call_next):
    request_id = str(uuid_mod.uuid4())[:8]
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "gene-pattern-finder", "version": "0.4.0"}


@app.get("/api/health/deep")
async def deep_health():
    """Health check completo: verifica PostgreSQL, Redis e ferramentas externas."""
    import shutil
    import redis as redis_lib
    from sqlalchemy import text
    from app.database import AsyncSessionLocal

    checks: dict[str, str] = {}

    # PostgreSQL
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        checks["postgres"] = "ok"
    except Exception as e:
        checks["postgres"] = f"down: {str(e)[:100]}"

    # Redis
    try:
        r = redis_lib.from_url(settings.redis_url, socket_timeout=3)
        r.ping()
        r.close()
        checks["redis"] = "ok"
    except Exception as e:
        checks["redis"] = f"down: {str(e)[:100]}"

    # Ferramentas externas
    for name, bin_path in [
        ("mafft", settings.mafft_bin),
        ("fasttree", settings.fasttree_bin),
        ("iqtree", settings.iqtree_bin),
    ]:
        found = shutil.which(bin_path) is not None
        checks[name] = "ok" if found else "not_found"

    all_ok = all(v == "ok" for v in checks.values())
    status_code = "healthy" if all_ok else "degraded"

    return {"status": status_code, "checks": checks}
