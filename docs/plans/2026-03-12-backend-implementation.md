# Gene Pattern Finder — Backend Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the FastAPI backend with NCBI integration, local BLAST+ analysis, and phylogenetic tree generation.

**Architecture:** Hybrid approach — NCBI Entrez API for species/sequence search, PostgreSQL for caching, BLAST+ local binaries for sequence comparison, scipy for dendrograms. Async FastAPI with SQLAlchemy 2.0.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 (async), PostgreSQL (asyncpg), Biopython, BLAST+ CLI, scipy, Docker Compose.

---

### Task 1: Project scaffolding + Docker Compose

**Files:**
- Create: `backend/app/__init__.py`
- Create: `backend/app/main.py`
- Create: `backend/app/config.py`
- Create: `backend/requirements.txt`
- Create: `docker-compose.yml`
- Create: `backend/.env.example`

**Step 1: Create docker-compose.yml with PostgreSQL**

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: rainman
      POSTGRES_PASSWORD: rainman_dev
      POSTGRES_DB: rainman
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

**Step 2: Create requirements.txt**

```
fastapi==0.115.6
uvicorn[standard]==0.34.0
sqlalchemy[asyncio]==2.0.36
asyncpg==0.30.0
alembic==1.14.1
biopython==1.85
scipy==1.15.1
numpy==2.2.1
psycopg2-binary==2.9.10
python-dotenv==1.0.1
pydantic-settings==2.7.1
httpx==0.28.1
```

**Step 3: Create config.py**

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://rainman:rainman_dev@localhost:5432/rainman"
    database_url_sync: str = "postgresql+psycopg2://rainman:rainman_dev@localhost:5432/rainman"
    ncbi_email: str = "dev@timelabs.com"
    ncbi_api_key: str = ""
    blast_bin_dir: str = ""
    blast_tmp_dir: str = "/tmp/blast_tmp"

    class Config:
        env_file = ".env"

settings = Settings()
```

**Step 4: Create minimal main.py**

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield

app = FastAPI(title="Gene Pattern Finder", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
async def health():
    return {"status": "ok"}
```

**Step 5: Create .env.example**

```
DATABASE_URL=postgresql+asyncpg://rainman:rainman_dev@localhost:5432/rainman
DATABASE_URL_SYNC=postgresql+psycopg2://rainman:rainman_dev@localhost:5432/rainman
NCBI_EMAIL=your@email.com
NCBI_API_KEY=
BLAST_BIN_DIR=
BLAST_TMP_DIR=/tmp/blast_tmp
```

**Step 6: Create empty __init__.py files**

Create `backend/app/__init__.py`, `backend/app/routers/__init__.py`, `backend/app/services/__init__.py`, `backend/app/utils/__init__.py` as empty files.

**Step 7: Verify Docker + health endpoint**

Run:
```bash
cd backend
docker compose up -d db
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
Then: `curl http://localhost:8000/api/health`
Expected: `{"status":"ok"}`

**Step 8: Commit**

```bash
git add -A
git commit -m "feat: project scaffolding with FastAPI, Docker Compose, and config"
```

---

### Task 2: Database models + Alembic migrations

**Files:**
- Create: `backend/app/database.py`
- Create: `backend/app/models.py`
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`

**Step 1: Create database.py**

```python
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from app.config import settings

engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,
    pool_recycle=3600,
)

AsyncSessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

class Base(DeclarativeBase):
    pass

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
```

**Step 2: Create models.py**

```python
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, Integer, ForeignKey, Enum as SAEnum, DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
import enum

class SeqType(str, enum.Enum):
    dna = "dna"
    rna = "rna"
    protein = "protein"

class SeqSource(str, enum.Enum):
    ncbi = "ncbi"
    manual = "manual"

class TreeMode(str, enum.Enum):
    query_vs_all = "query_vs_all"
    all_vs_all = "all_vs_all"

class Species(Base):
    __tablename__ = "species"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    taxon_id: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    rank: Mapped[str] = mapped_column(String(50), default="species")
    lineage: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    sequences: Mapped[list["Sequence"]] = relationship(back_populates="species", cascade="all, delete-orphan")

class Sequence(Base):
    __tablename__ = "sequences"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    species_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("species.id"))
    accession: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    seq_type: Mapped[SeqType] = mapped_column(SAEnum(SeqType))
    title: Mapped[str] = mapped_column(Text)
    sequence: Mapped[str] = mapped_column(Text)
    length: Mapped[int] = mapped_column(Integer)
    source: Mapped[SeqSource] = mapped_column(SAEnum(SeqSource), default=SeqSource.ncbi)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    species: Mapped["Species"] = relationship(back_populates="sequences")

class AnalysisResult(Base):
    __tablename__ = "analysis_results"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    query_seq: Mapped[str] = mapped_column(Text)
    seq_type: Mapped[SeqType] = mapped_column(SAEnum(SeqType))
    species_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("species.id"))
    program: Mapped[str] = mapped_column(String(20))
    blast_results: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    tree_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    max_results: Mapped[int] = mapped_column(Integer, default=50)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
```

**Step 3: Initialize Alembic**

Run:
```bash
cd backend
alembic init alembic
```

**Step 4: Configure alembic env.py**

Edit `alembic/env.py` to import `app.models` and use `app.config.settings.database_url_sync` as the target URL. Set `target_metadata = Base.metadata`.

**Step 5: Create initial migration**

Run:
```bash
alembic revision --autogenerate -m "initial tables: species, sequences, analysis_results"
alembic upgrade head
```
Expected: Tables created in PostgreSQL.

**Step 6: Verify tables exist**

Run:
```bash
docker exec -it $(docker ps -q -f ancestor=postgres:16-alpine) psql -U rainman -c "\dt"
```
Expected: `species`, `sequences`, `analysis_results` listed.

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: database models and Alembic migrations for species, sequences, analysis_results"
```

---

### Task 3: Pydantic schemas

**Files:**
- Create: `backend/app/schemas.py`

**Step 1: Create schemas.py**

```python
from pydantic import BaseModel, Field
from datetime import datetime
from uuid import UUID
from app.models import SeqType, SeqSource, TreeMode

# --- Species ---
class SpeciesSearchResult(BaseModel):
    taxon_id: int
    name: str
    rank: str
    lineage: str | None = None

class SpeciesOut(BaseModel):
    id: UUID
    taxon_id: int
    name: str
    rank: str
    lineage: str | None
    created_at: datetime
    model_config = {"from_attributes": True}

# --- Sequences ---
class SequenceOut(BaseModel):
    id: UUID
    accession: str
    seq_type: SeqType
    title: str
    length: int
    source: SeqSource
    fetched_at: datetime
    model_config = {"from_attributes": True}

class SequenceListResponse(BaseModel):
    species: SpeciesOut
    sequences: list[SequenceOut]
    total: int
    from_cache: bool

# --- Analysis ---
class BlastRequest(BaseModel):
    query_sequence: str = Field(..., min_length=10)
    seq_type: SeqType
    species_taxon_id: int
    program: str = Field(..., pattern="^(blastn|blastp|blastx|tblastn|tblastx)$")
    max_results: int = Field(default=50, ge=10, le=500)

class BlastHit(BaseModel):
    accession: str
    title: str
    score: float
    evalue: float
    identity_pct: float
    coverage: float
    query_start: int
    query_end: int
    hit_start: int
    hit_end: int
    query_aligned: str
    match_line: str
    hit_aligned: str

class BlastResponse(BaseModel):
    id: UUID
    query_length: int
    hits: list[BlastHit]
    total_hits: int

class TreeRequest(BaseModel):
    analysis_id: UUID
    mode: TreeMode

class TreeResponse(BaseModel):
    newick: str
    labels: list[str]
    distance_matrix: list[list[float]]
```

**Step 2: Commit**

```bash
git add backend/app/schemas.py
git commit -m "feat: Pydantic request/response schemas"
```

---

### Task 4: NCBI service (Entrez API)

**Files:**
- Create: `backend/app/services/ncbi.py`

**Step 1: Implement ncbi.py**

```python
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
```

**Step 2: Verify by running a quick test in Python REPL**

```bash
cd backend
python -c "
import asyncio
from app.services.ncbi import search_species
result = asyncio.run(search_species('Escherichia coli'))
print(f'Found {len(result)} species')
print(result[0]['name'] if result else 'No results')
"
```
Expected: `Found N species` and `Escherichia coli`.

**Step 3: Commit**

```bash
git add backend/app/services/ncbi.py
git commit -m "feat: NCBI Entrez service for species search and sequence fetch"
```

---

### Task 5: BLAST+ service

**Files:**
- Create: `backend/app/services/blast.py`
- Create: `backend/app/utils/sequence.py`

**Step 1: Create utils/sequence.py**

```python
import re

def validate_dna(seq: str) -> bool:
    return bool(re.match(r'^[ATCGNatcgn\s]+$', seq))

def validate_rna(seq: str) -> bool:
    return bool(re.match(r'^[AUCGNaucgn\s]+$', seq))

def validate_protein(seq: str) -> bool:
    return bool(re.match(r'^[ACDEFGHIKLMNPQRSTVWY*acdefghiklmnpqrstvwy\s]+$', seq))

def clean_sequence(seq: str) -> str:
    return re.sub(r'\s+', '', seq).upper()

def write_fasta(sequences: list[dict], filepath: str) -> None:
    with open(filepath, "w") as f:
        for seq in sequences:
            f.write(f">{seq['accession']} {seq.get('title', '')}\n")
            s = seq["sequence"]
            for i in range(0, len(s), 80):
                f.write(s[i:i+80] + "\n")
```

**Step 2: Create services/blast.py**

```python
import subprocess
import tempfile
import os
from pathlib import Path
from Bio.Blast import NCBIXML
from app.config import settings
from app.utils.sequence import write_fasta, clean_sequence
from app.schemas import BlastHit

def _blast_cmd(program: str) -> str:
    if settings.blast_bin_dir:
        return str(Path(settings.blast_bin_dir) / program)
    return program

def _dbtype_for_program(program: str) -> str:
    if program in ("blastp", "tblastn"):
        return "prot"
    return "nucl"

async def run_blast(
    query_sequence: str,
    subject_sequences: list[dict],
    program: str = "blastn",
    max_results: int = 50,
) -> dict:
    query_seq = clean_sequence(query_sequence)
    tmp_dir = tempfile.mkdtemp(dir=settings.blast_tmp_dir if os.path.exists(settings.blast_tmp_dir) else None)

    try:
        query_path = os.path.join(tmp_dir, "query.fasta")
        with open(query_path, "w") as f:
            f.write(f">query\n{query_seq}\n")

        db_fasta = os.path.join(tmp_dir, "subjects.fasta")
        write_fasta(subject_sequences, db_fasta)

        db_name = os.path.join(tmp_dir, "blastdb")
        dbtype = _dbtype_for_program(program)

        subprocess.run(
            [_blast_cmd("makeblastdb"), "-in", db_fasta, "-dbtype", dbtype, "-out", db_name, "-parse_seqids"],
            check=True, capture_output=True, text=True,
        )

        result_path = os.path.join(tmp_dir, "results.xml")
        subprocess.run(
            [
                _blast_cmd(program),
                "-query", query_path,
                "-db", db_name,
                "-out", result_path,
                "-outfmt", "5",
                "-evalue", "1e-5",
                "-max_target_seqs", str(max_results),
            ],
            check=True, capture_output=True, text=True,
        )

        with open(result_path) as f:
            blast_record = NCBIXML.read(f)

        hits = []
        for alignment in blast_record.alignments:
            hsp = alignment.hsps[0]
            hits.append(BlastHit(
                accession=alignment.accession,
                title=alignment.hit_def,
                score=hsp.score,
                evalue=hsp.expect,
                identity_pct=round(100 * hsp.identities / hsp.align_length, 2) if hsp.align_length else 0,
                coverage=round(hsp.align_length / blast_record.query_length, 4) if blast_record.query_length else 0,
                query_start=hsp.query_start,
                query_end=hsp.query_end,
                hit_start=hsp.sbjct_start,
                hit_end=hsp.sbjct_end,
                query_aligned=hsp.query,
                match_line=hsp.match,
                hit_aligned=hsp.sbjct,
            ))

        return {
            "query_length": blast_record.query_length,
            "hits": hits,
            "total_hits": len(hits),
        }

    finally:
        import shutil
        shutil.rmtree(tmp_dir, ignore_errors=True)
```

**Step 3: Commit**

```bash
git add backend/app/services/blast.py backend/app/utils/sequence.py
git commit -m "feat: BLAST+ local runner service and sequence utilities"
```

---

### Task 6: Phylogeny service (dendrograms)

**Files:**
- Create: `backend/app/services/phylogeny.py`

**Step 1: Create services/phylogeny.py**

```python
import numpy as np
from scipy.cluster.hierarchy import linkage, to_tree
from scipy.spatial.distance import squareform
from Bio import AlignIO, SeqIO
from Bio.Seq import Seq
from Bio.SeqRecord import SeqRecord
import subprocess
import tempfile
import os

def _p_distance(seq1: str, seq2: str) -> float:
    diffs = sum(1 for a, b in zip(seq1, seq2) if a != b and a != "-" and b != "-")
    compared = sum(1 for a, b in zip(seq1, seq2) if a != "-" and b != "-")
    return diffs / compared if compared > 0 else 1.0

def _to_newick(node, labels: list[str]) -> str:
    if node.is_leaf():
        return f"{labels[node.id]}:{node.dist:.6f}"
    left = _to_newick(node.get_left(), labels)
    right = _to_newick(node.get_right(), labels)
    return f"({left},{right}):{node.dist:.6f}"

async def build_tree(
    sequences: list[dict],
    query_sequence: str | None = None,
    query_label: str = "query",
    mode: str = "all_vs_all",
) -> dict:
    records = []
    labels = []

    if mode == "query_vs_all" and query_sequence:
        records.append(SeqRecord(Seq(query_sequence), id=query_label, description=""))
        labels.append(query_label)

    for seq in sequences:
        acc = seq["accession"]
        records.append(SeqRecord(Seq(seq["sequence"]), id=acc, description=""))
        labels.append(acc)

    if len(records) < 2:
        return {"newick": "", "labels": labels, "distance_matrix": []}

    tmp_dir = tempfile.mkdtemp()
    try:
        input_path = os.path.join(tmp_dir, "input.fasta")
        aligned_path = os.path.join(tmp_dir, "aligned.fasta")

        SeqIO.write(records, input_path, "fasta")

        try:
            subprocess.run(
                ["muscle", "-align", input_path, "-output", aligned_path],
                check=True, capture_output=True, text=True, timeout=300,
            )
        except FileNotFoundError:
            subprocess.run(
                ["mafft", "--auto", input_path],
                stdout=open(aligned_path, "w"),
                check=True, capture_output=False, timeout=300,
            )

        alignment = AlignIO.read(aligned_path, "fasta")
        n = len(alignment)

        aligned_labels = [rec.id for rec in alignment]

        dist_matrix = np.zeros((n, n))
        for i in range(n):
            for j in range(i + 1, n):
                d = _p_distance(str(alignment[i].seq), str(alignment[j].seq))
                dist_matrix[i][j] = d
                dist_matrix[j][i] = d

        condensed = squareform(dist_matrix)
        Z = linkage(condensed, method="average")

        tree_root = to_tree(Z)
        newick = _to_newick(tree_root, aligned_labels) + ";"

        return {
            "newick": newick,
            "labels": aligned_labels,
            "distance_matrix": dist_matrix.tolist(),
        }

    finally:
        import shutil
        shutil.rmtree(tmp_dir, ignore_errors=True)
```

**Step 2: Commit**

```bash
git add backend/app/services/phylogeny.py
git commit -m "feat: phylogeny service with MSA and UPGMA dendrograms"
```

---

### Task 7: API routers — species

**Files:**
- Create: `backend/app/routers/species.py`
- Modify: `backend/app/main.py`

**Step 1: Create routers/species.py**

```python
from fastapi import APIRouter, Query
from app.services.ncbi import search_species
from app.schemas import SpeciesSearchResult

router = APIRouter(prefix="/api/species", tags=["species"])

@router.get("/search", response_model=list[SpeciesSearchResult])
async def search(q: str = Query(..., min_length=2), limit: int = Query(default=20, ge=1, le=100)):
    results = await search_species(q, max_results=limit)
    return results
```

**Step 2: Register router in main.py**

Add to `main.py`:
```python
from app.routers import species
app.include_router(species.router)
```

**Step 3: Test endpoint**

Run: `curl "http://localhost:8000/api/species/search?q=Escherichia"`
Expected: JSON array with species data.

**Step 4: Commit**

```bash
git add backend/app/routers/species.py backend/app/main.py
git commit -m "feat: species search endpoint"
```

---

### Task 8: API routers — sequences

**Files:**
- Create: `backend/app/routers/sequences.py`
- Modify: `backend/app/main.py`

**Step 1: Create routers/sequences.py**

```python
from fastapi import APIRouter, Query, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models import Species, Sequence, SeqType, SeqSource
from app.services.ncbi import fetch_sequences
from app.schemas import SequenceListResponse, SequenceOut, SpeciesOut

router = APIRouter(prefix="/api/sequences", tags=["sequences"])

@router.get("/{taxon_id}", response_model=SequenceListResponse)
async def get_sequences(
    taxon_id: int,
    type: SeqType = Query(default=SeqType.dna),
    limit: int = Query(default=50, ge=10, le=500),
    db: AsyncSession = Depends(get_db),
):
    # Check cache
    stmt = select(Species).where(Species.taxon_id == taxon_id)
    result = await db.execute(stmt)
    species = result.scalar_one_or_none()

    if species:
        seq_stmt = (
            select(Sequence)
            .where(Sequence.species_id == species.id, Sequence.seq_type == type)
            .limit(limit)
        )
        seq_result = await db.execute(seq_stmt)
        cached_seqs = seq_result.scalars().all()

        if cached_seqs:
            return SequenceListResponse(
                species=SpeciesOut.model_validate(species),
                sequences=[SequenceOut.model_validate(s) for s in cached_seqs],
                total=len(cached_seqs),
                from_cache=True,
            )

    # Fetch from NCBI
    raw_seqs = await fetch_sequences(taxon_id, type, max_results=limit)

    if not species:
        from app.services.ncbi import search_species
        sp_data = await search_species(str(taxon_id))
        sp_info = next((s for s in sp_data if s["taxon_id"] == taxon_id), None)
        if sp_info:
            species = Species(
                taxon_id=sp_info["taxon_id"],
                name=sp_info["name"],
                rank=sp_info["rank"],
                lineage=sp_info.get("lineage"),
            )
            db.add(species)
            await db.flush()

    if not species:
        from fastapi import HTTPException
        raise HTTPException(404, "Species not found on NCBI")

    db_sequences = []
    for seq_data in raw_seqs:
        seq = Sequence(
            species_id=species.id,
            accession=seq_data["accession"],
            seq_type=type,
            title=seq_data["title"],
            sequence=seq_data["sequence"],
            length=seq_data["length"],
            source=SeqSource.ncbi,
        )
        db.add(seq)
        db_sequences.append(seq)

    await db.commit()
    for s in db_sequences:
        await db.refresh(s)
    await db.refresh(species)

    return SequenceListResponse(
        species=SpeciesOut.model_validate(species),
        sequences=[SequenceOut.model_validate(s) for s in db_sequences],
        total=len(db_sequences),
        from_cache=False,
    )
```

**Step 2: Register router in main.py**

```python
from app.routers import sequences
app.include_router(sequences.router)
```

**Step 3: Commit**

```bash
git add backend/app/routers/sequences.py backend/app/main.py
git commit -m "feat: sequences endpoint with NCBI fetch and PostgreSQL cache"
```

---

### Task 9: API routers — analysis (BLAST + tree)

**Files:**
- Create: `backend/app/routers/analysis.py`
- Modify: `backend/app/main.py`

**Step 1: Create routers/analysis.py**

```python
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models import Species, Sequence, AnalysisResult
from app.schemas import BlastRequest, BlastResponse, TreeRequest, TreeResponse
from app.services.blast import run_blast
from app.services.phylogeny import build_tree

router = APIRouter(prefix="/api/analysis", tags=["analysis"])

@router.post("/blast", response_model=BlastResponse)
async def blast_analysis(req: BlastRequest, db: AsyncSession = Depends(get_db)):
    stmt = select(Species).where(Species.taxon_id == req.species_taxon_id)
    result = await db.execute(stmt)
    species = result.scalar_one_or_none()

    if not species:
        raise HTTPException(404, "Species not found. Fetch sequences first.")

    seq_stmt = (
        select(Sequence)
        .where(Sequence.species_id == species.id, Sequence.seq_type == req.seq_type)
        .limit(req.max_results)
    )
    seq_result = await db.execute(seq_stmt)
    sequences = seq_result.scalars().all()

    if not sequences:
        raise HTTPException(404, "No cached sequences found. Fetch sequences first.")

    subject_data = [
        {"accession": s.accession, "title": s.title, "sequence": s.sequence}
        for s in sequences
    ]

    blast_result = await run_blast(
        query_sequence=req.query_sequence,
        subject_sequences=subject_data,
        program=req.program,
        max_results=req.max_results,
    )

    analysis = AnalysisResult(
        query_seq=req.query_sequence,
        seq_type=req.seq_type,
        species_id=species.id,
        program=req.program,
        blast_results={
            "query_length": blast_result["query_length"],
            "hits": [h.model_dump() for h in blast_result["hits"]],
            "total_hits": blast_result["total_hits"],
        },
        max_results=req.max_results,
    )
    db.add(analysis)
    await db.commit()
    await db.refresh(analysis)

    return BlastResponse(
        id=analysis.id,
        query_length=blast_result["query_length"],
        hits=blast_result["hits"],
        total_hits=blast_result["total_hits"],
    )

@router.post("/tree", response_model=TreeResponse)
async def tree_analysis(req: TreeRequest, db: AsyncSession = Depends(get_db)):
    stmt = select(AnalysisResult).where(AnalysisResult.id == req.analysis_id)
    result = await db.execute(stmt)
    analysis = result.scalar_one_or_none()

    if not analysis:
        raise HTTPException(404, "Analysis not found")

    if not analysis.blast_results or not analysis.blast_results.get("hits"):
        raise HTTPException(400, "No BLAST hits to build tree from")

    hit_accessions = [h["accession"] for h in analysis.blast_results["hits"]]
    seq_stmt = select(Sequence).where(Sequence.accession.in_(hit_accessions))
    seq_result = await db.execute(seq_stmt)
    sequences = seq_result.scalars().all()

    seq_data = [
        {"accession": s.accession, "sequence": s.sequence}
        for s in sequences
    ]

    tree_result = await build_tree(
        sequences=seq_data,
        query_sequence=analysis.query_seq if req.mode.value == "query_vs_all" else None,
        mode=req.mode.value,
    )

    analysis.tree_data = tree_result
    await db.commit()

    return TreeResponse(**tree_result)

@router.get("/{analysis_id}")
async def get_analysis(analysis_id: UUID, db: AsyncSession = Depends(get_db)):
    stmt = select(AnalysisResult).where(AnalysisResult.id == analysis_id)
    result = await db.execute(stmt)
    analysis = result.scalar_one_or_none()

    if not analysis:
        raise HTTPException(404, "Analysis not found")

    return {
        "id": analysis.id,
        "seq_type": analysis.seq_type,
        "program": analysis.program,
        "blast_results": analysis.blast_results,
        "tree_data": analysis.tree_data,
        "max_results": analysis.max_results,
        "created_at": analysis.created_at,
    }
```

**Step 2: Register router in main.py**

```python
from app.routers import analysis
app.include_router(analysis.router)
```

**Step 3: Commit**

```bash
git add backend/app/routers/analysis.py backend/app/main.py
git commit -m "feat: analysis endpoints for BLAST and phylogenetic tree"
```

---

### Task 10: Final main.py wiring + lifespan

**Files:**
- Modify: `backend/app/main.py`

**Step 1: Update main.py with complete wiring**

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base
from app.routers import species, sequences, analysis

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()

app = FastAPI(
    title="Gene Pattern Finder",
    description="TimeLabs - Genetic Sequence Analysis Platform",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(species.router)
app.include_router(sequences.router)
app.include_router(analysis.router)

@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "gene-pattern-finder"}
```

**Step 2: Full integration test**

```bash
# Start everything
docker compose up -d db
cd backend
uvicorn app.main:app --reload --port 8000

# Test health
curl http://localhost:8000/api/health

# Test species search
curl "http://localhost:8000/api/species/search?q=Saccharomyces"

# Test docs
curl http://localhost:8000/docs
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: complete backend wiring with all routers and lifespan"
```

---

### Task 11: Ngrok exposure for testing

**Step 1: Start ngrok**

```bash
ngrok http 8000
```

**Step 2: Note the public URL for frontend testing**

Expected: `https://xxxx.ngrok-free.app` forwarding to `localhost:8000`.

**Step 3: Verify remote access**

```bash
curl https://xxxx.ngrok-free.app/api/health
```
Expected: `{"status":"ok","service":"gene-pattern-finder"}`
