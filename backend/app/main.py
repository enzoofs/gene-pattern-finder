from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base
from app.routers import species, sequences, collections, jobs

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()

app = FastAPI(
    title="Gene Pattern Finder",
    description="TimeLabs - Genetic Sequence Analysis Platform",
    version="0.2.2",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(species.router)
app.include_router(sequences.router)
app.include_router(collections.router)
app.include_router(jobs.router)
app.include_router(jobs.ws_router)

@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "gene-pattern-finder"}
