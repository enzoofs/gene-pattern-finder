# Gene Pattern Finder v2 — Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor from BLAST-based single-query analysis to multi-species comparative analysis using MAFFT (alignment) + IQ-TREE (phylogeny) with async job processing via Celery + Redis.

**Architecture:** Keep existing species/sequences/NCBI infrastructure. Remove BLAST analysis layer. Add collections (multi-species groups), async job pipeline (Celery + Redis), MAFFT/FastTree/IQ-TREE services, WebSocket progress, and conserved region detection. Refactor frontend from single-species BLAST flow to multi-species collection + async results.

**Tech Stack:** FastAPI, SQLAlchemy (async), Celery, Redis, MAFFT, FastTree, IQ-TREE, Biopython, D3.js, WebSocket

**What stays:** species router, sequences router, ncbi.py service, database.py, config.py, all ORM for Species/Sequence
**What goes:** blast.py, phylogeny.py, analysis router, AnalysisResult model, all BLAST-related schemas, frontend BLAST components
**What's new:** collections router, jobs router, mafft.py, iqtree.py, conservation.py, celery worker, WebSocket endpoint, frontend collection UI + progress + new visualizations

---

### Task 1: Infrastructure — Redis + Celery in Docker Compose

**Files:**
- Modify: `docker-compose.yml`
- Modify: `backend/requirements.txt`
- Create: `backend/app/worker/celery_app.py`
- Create: `backend/app/worker/__init__.py`
- Modify: `backend/app/config.py`

**Step 1: Update docker-compose.yml — add Redis**

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

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  pgdata:
```

**Step 2: Update requirements.txt — add Celery + WebSocket deps**

Add to `backend/requirements.txt`:
```
celery[redis]==5.4.0
redis==5.2.1
websockets==14.1
```

**Step 3: Update config.py — add redis and tool paths**

Add to Settings class in `backend/app/config.py`:
```python
redis_url: str = "redis://localhost:6379/0"
mafft_bin: str = "mafft"
fasttree_bin: str = "FastTree"
iqtree_bin: str = "iqtree2"
work_dir: str = "/tmp/gpf_work"
```

**Step 4: Create Celery app**

Create `backend/app/worker/__init__.py` (empty file).

Create `backend/app/worker/celery_app.py`:
```python
from celery import Celery
from app.config import settings

celery_app = Celery(
    "gene_pattern_finder",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    worker_prefetch_multiplier=1,
    task_acks_late=True,
)
```

**Step 5: Install deps and start Redis**

Run:
```bash
cd backend && pip install celery[redis] redis websockets
docker compose up -d redis
```

**Step 6: Commit**

```bash
git add docker-compose.yml backend/requirements.txt backend/app/config.py backend/app/worker/
git commit -m "feat: add Redis + Celery infrastructure for async job processing"
```

---

### Task 2: Database — New models (Collection, CollectionSpecies, AnalysisJob)

**Files:**
- Modify: `backend/app/models.py`

**Step 1: Add new models, keep existing Species/Sequence, remove AnalysisResult**

Add to `backend/app/models.py` — new enum and models:

```python
class JobStatus(str, enum.Enum):
    queued = "queued"
    aligning = "aligning"
    preview_tree = "preview_tree"
    full_tree = "full_tree"
    conservation = "conservation"
    done = "done"
    failed = "failed"

class Collection(Base):
    __tablename__ = "collections"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255))
    seq_type: Mapped[SeqType] = mapped_column(SAEnum(SeqType), default=SeqType.dna)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    species_links: Mapped[list["CollectionSpecies"]] = relationship(back_populates="collection", cascade="all, delete-orphan")
    jobs: Mapped[list["AnalysisJob"]] = relationship(back_populates="collection", cascade="all, delete-orphan")

class CollectionSpecies(Base):
    __tablename__ = "collection_species"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    collection_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("collections.id"))
    species_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("species.id"))
    sequence_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("sequences.id"))

    collection: Mapped["Collection"] = relationship(back_populates="species_links")
    species: Mapped["Species"] = relationship()
    sequence: Mapped["Sequence"] = relationship()

class AnalysisJob(Base):
    __tablename__ = "analysis_jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    collection_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("collections.id"))
    status: Mapped[JobStatus] = mapped_column(SAEnum(JobStatus), default=JobStatus.queued)
    progress_pct: Mapped[int] = mapped_column(Integer, default=0)
    progress_msg: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_msg: Mapped[str | None] = mapped_column(Text, nullable=True)
    alignment: Mapped[str | None] = mapped_column(Text, nullable=True)
    preview_tree: Mapped[str | None] = mapped_column(Text, nullable=True)
    tree: Mapped[str | None] = mapped_column(Text, nullable=True)
    tree_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    bootstrap_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    conservation: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    collection: Mapped["Collection"] = relationship(back_populates="jobs")
```

Remove the `AnalysisResult` class and `TreeMode` enum from models.py entirely.

**Step 2: Verify app starts**

Run: `python -c "from app.models import Collection, AnalysisJob, CollectionSpecies; print('Models OK')"`

**Step 3: Commit**

```bash
git add backend/app/models.py
git commit -m "feat: add Collection, CollectionSpecies, AnalysisJob models; remove AnalysisResult"
```

---

### Task 3: Schemas — New Pydantic schemas for collections and jobs

**Files:**
- Modify: `backend/app/schemas.py`

**Step 1: Replace BLAST schemas with collection/job schemas**

Keep: `SpeciesSearchResult`, `SpeciesOut`, `SequenceOut`, `SequenceListResponse`

Remove: `BlastRequest`, `BlastHit`, `BlastResponse`, `TreeRequest`, `TreeResponse`

Add new schemas:

```python
from app.models import SeqType, SeqSource, JobStatus

# --- Collections ---
class CollectionCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    seq_type: SeqType = SeqType.dna

class CollectionSpeciesAdd(BaseModel):
    species_taxon_id: int
    sequence_id: UUID

class CollectionSpeciesOut(BaseModel):
    species: SpeciesOut
    sequence: SequenceOut
    model_config = {"from_attributes": True}

class CollectionOut(BaseModel):
    id: UUID
    name: str
    seq_type: SeqType
    species_count: int
    created_at: datetime
    model_config = {"from_attributes": True}

class CollectionDetailOut(BaseModel):
    id: UUID
    name: str
    seq_type: SeqType
    created_at: datetime
    entries: list[CollectionSpeciesOut]

# --- Jobs ---
class JobCreate(BaseModel):
    collection_id: UUID

class JobStatusOut(BaseModel):
    id: UUID
    collection_id: UUID
    status: JobStatus
    progress_pct: int
    progress_msg: str | None
    error_msg: str | None
    created_at: datetime
    finished_at: datetime | None
    model_config = {"from_attributes": True}

class ConservedRegion(BaseModel):
    start: int
    end: int
    length: int
    avg_identity: float

class JobResultsOut(BaseModel):
    id: UUID
    status: JobStatus
    alignment: str | None
    preview_tree: str | None
    tree: str | None
    tree_model: str | None
    bootstrap_data: dict | None
    conservation: dict | None
```

**Step 2: Commit**

```bash
git add backend/app/schemas.py
git commit -m "feat: add collection and job schemas; remove BLAST schemas"
```

---

### Task 4: Router — Collections CRUD

**Files:**
- Create: `backend/app/routers/collections.py`

**Step 1: Implement collections router**

```python
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from app.database import get_db
from app.models import Collection, CollectionSpecies, Species, Sequence
from app.schemas import (
    CollectionCreate, CollectionOut, CollectionDetailOut,
    CollectionSpeciesAdd, CollectionSpeciesOut, SpeciesOut, SequenceOut,
)

router = APIRouter(prefix="/api/collections", tags=["collections"])

@router.post("", response_model=CollectionOut)
async def create_collection(data: CollectionCreate, db: AsyncSession = Depends(get_db)):
    collection = Collection(name=data.name, seq_type=data.seq_type)
    db.add(collection)
    await db.commit()
    await db.refresh(collection)
    return CollectionOut(
        id=collection.id, name=collection.name, seq_type=collection.seq_type,
        species_count=0, created_at=collection.created_at,
    )

@router.get("/{collection_id}", response_model=CollectionDetailOut)
async def get_collection(collection_id: UUID, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(Collection)
        .where(Collection.id == collection_id)
        .options(
            selectinload(Collection.species_links)
            .selectinload(CollectionSpecies.species),
            selectinload(Collection.species_links)
            .selectinload(CollectionSpecies.sequence),
        )
    )
    result = await db.execute(stmt)
    collection = result.scalar_one_or_none()
    if not collection:
        raise HTTPException(404, "Collection not found")

    entries = [
        CollectionSpeciesOut(
            species=SpeciesOut.model_validate(link.species),
            sequence=SequenceOut.model_validate(link.sequence),
        )
        for link in collection.species_links
    ]
    return CollectionDetailOut(
        id=collection.id, name=collection.name, seq_type=collection.seq_type,
        created_at=collection.created_at, entries=entries,
    )

@router.post("/{collection_id}/species", response_model=CollectionSpeciesOut)
async def add_species_to_collection(
    collection_id: UUID, data: CollectionSpeciesAdd, db: AsyncSession = Depends(get_db),
):
    collection = await db.get(Collection, collection_id)
    if not collection:
        raise HTTPException(404, "Collection not found")

    species_stmt = select(Species).where(Species.taxon_id == data.species_taxon_id)
    species = (await db.execute(species_stmt)).scalar_one_or_none()
    if not species:
        raise HTTPException(404, "Species not found. Fetch sequences first.")

    sequence = await db.get(Sequence, data.sequence_id)
    if not sequence:
        raise HTTPException(404, "Sequence not found")

    # Check duplicate
    dup_stmt = select(CollectionSpecies).where(
        CollectionSpecies.collection_id == collection_id,
        CollectionSpecies.sequence_id == data.sequence_id,
    )
    if (await db.execute(dup_stmt)).scalar_one_or_none():
        raise HTTPException(409, "Sequence already in collection")

    link = CollectionSpecies(
        collection_id=collection_id,
        species_id=species.id,
        sequence_id=data.sequence_id,
    )
    db.add(link)
    await db.commit()
    await db.refresh(link)
    await db.refresh(species)
    await db.refresh(sequence)

    return CollectionSpeciesOut(
        species=SpeciesOut.model_validate(species),
        sequence=SequenceOut.model_validate(sequence),
    )

@router.delete("/{collection_id}/species/{sequence_id}")
async def remove_species_from_collection(
    collection_id: UUID, sequence_id: UUID, db: AsyncSession = Depends(get_db),
):
    stmt = select(CollectionSpecies).where(
        CollectionSpecies.collection_id == collection_id,
        CollectionSpecies.sequence_id == sequence_id,
    )
    link = (await db.execute(stmt)).scalar_one_or_none()
    if not link:
        raise HTTPException(404, "Entry not found in collection")

    await db.delete(link)
    await db.commit()
    return {"status": "removed"}
```

**Step 2: Commit**

```bash
git add backend/app/routers/collections.py
git commit -m "feat: collections CRUD router"
```

---

### Task 5: Services — MAFFT runner

**Files:**
- Create: `backend/app/services/mafft.py`

**Step 1: Implement MAFFT service**

```python
import logging
import os
import subprocess
import tempfile
from pathlib import Path
from app.config import settings

logger = logging.getLogger(__name__)

SUBPROCESS_TIMEOUT = 600  # 10 min for large alignments


def run_mafft(input_fasta: str, output_path: str | None = None) -> str:
    """Run MAFFT alignment on a FASTA file. Returns path to aligned FASTA."""
    if output_path is None:
        fd, output_path = tempfile.mkstemp(suffix=".fasta")
        os.close(fd)

    cmd = [settings.mafft_bin, "--auto", "--thread", "-1", input_fasta]
    logger.info("Running MAFFT: %s", " ".join(cmd))

    with open(output_path, "w") as out_file:
        result = subprocess.run(
            cmd, stdout=out_file, stderr=subprocess.PIPE,
            text=True, timeout=SUBPROCESS_TIMEOUT,
        )

    if result.returncode != 0:
        logger.error("MAFFT failed: %s", result.stderr)
        raise RuntimeError(f"MAFFT failed: {result.stderr[:500]}")

    logger.info("MAFFT completed: %s", output_path)
    return output_path
```

**Step 2: Commit**

```bash
git add backend/app/services/mafft.py
git commit -m "feat: MAFFT alignment service"
```

---

### Task 6: Services — IQ-TREE + FastTree runner

**Files:**
- Create: `backend/app/services/iqtree.py`

**Step 1: Implement IQ-TREE and FastTree services**

```python
import logging
import os
import subprocess
import tempfile
from pathlib import Path
from app.config import settings

logger = logging.getLogger(__name__)

SUBPROCESS_TIMEOUT_FAST = 120   # 2 min for FastTree
SUBPROCESS_TIMEOUT_IQ = 3600    # 60 min for IQ-TREE


def run_fasttree(aligned_fasta: str, is_nucleotide: bool = True) -> str:
    """Run FastTree for a quick preview tree. Returns Newick string."""
    cmd = [settings.fasttree_bin]
    if is_nucleotide:
        cmd.append("-nt")
    cmd.append(aligned_fasta)

    logger.info("Running FastTree: %s", " ".join(cmd))
    result = subprocess.run(
        cmd, capture_output=True, text=True, timeout=SUBPROCESS_TIMEOUT_FAST,
    )

    if result.returncode != 0:
        logger.error("FastTree failed: %s", result.stderr)
        raise RuntimeError(f"FastTree failed: {result.stderr[:500]}")

    newick = result.stdout.strip()
    logger.info("FastTree completed, tree length: %d chars", len(newick))
    return newick


def run_iqtree(aligned_fasta: str, is_nucleotide: bool = True) -> dict:
    """Run IQ-TREE with ModelFinder + ultrafast bootstrap. Returns dict with newick, model, bootstrap."""
    work_dir = tempfile.mkdtemp(prefix="iqtree_")
    prefix = os.path.join(work_dir, "analysis")

    cmd = [
        settings.iqtree_bin,
        "-s", aligned_fasta,
        "-m", "MFP",           # ModelFinder Plus
        "-bb", "1000",          # ultrafast bootstrap
        "-nt", "AUTO",
        "-pre", prefix,
        "--quiet",
    ]

    logger.info("Running IQ-TREE: %s", " ".join(cmd))
    result = subprocess.run(
        cmd, capture_output=True, text=True, timeout=SUBPROCESS_TIMEOUT_IQ,
    )

    if result.returncode != 0:
        logger.error("IQ-TREE failed: %s", result.stderr)
        raise RuntimeError(f"IQ-TREE failed: {result.stderr[:500]}")

    # Read tree file
    treefile = f"{prefix}.treefile"
    if not os.path.exists(treefile):
        raise RuntimeError("IQ-TREE did not produce a tree file")

    with open(treefile) as f:
        newick = f.read().strip()

    # Read model from log
    model = "unknown"
    log_file = f"{prefix}.log"
    if os.path.exists(log_file):
        with open(log_file) as f:
            for line in f:
                if "Best-fit model:" in line:
                    model = line.split("Best-fit model:")[1].split()[0].strip()
                    break

    logger.info("IQ-TREE completed, model=%s", model)

    return {
        "newick": newick,
        "model": model,
    }
```

**Step 2: Commit**

```bash
git add backend/app/services/iqtree.py
git commit -m "feat: IQ-TREE and FastTree phylogeny services"
```

---

### Task 7: Services — Conservation detection

**Files:**
- Create: `backend/app/services/conservation.py`

**Step 1: Implement conservation analysis**

```python
import logging
from Bio import AlignIO
from io import StringIO

logger = logging.getLogger(__name__)


def detect_conserved_regions(
    aligned_fasta: str,
    threshold: float = 0.9,
    min_length: int = 5,
) -> dict:
    """Detect conserved regions from a MAFFT alignment.

    Args:
        aligned_fasta: Path to aligned FASTA file
        threshold: Minimum identity fraction to consider a position conserved (0.0-1.0)
        min_length: Minimum consecutive positions to form a region

    Returns:
        dict with: positions (per-position identity), regions (conserved stretches), summary stats
    """
    alignment = AlignIO.read(aligned_fasta, "fasta")
    n_seqs = len(alignment)
    n_pos = alignment.get_alignment_length()

    logger.info("Conservation analysis: %d sequences, %d positions, threshold=%.2f", n_seqs, n_pos, threshold)

    # Calculate per-position identity
    position_identity = []
    for i in range(n_pos):
        column = alignment[:, i]
        # Skip gap-only columns
        non_gap = [c for c in column if c != "-"]
        if not non_gap:
            position_identity.append(0.0)
            continue
        # Most common residue frequency
        from collections import Counter
        counts = Counter(non_gap)
        most_common_count = counts.most_common(1)[0][1]
        identity = most_common_count / len(non_gap)
        position_identity.append(round(identity, 4))

    # Find conserved regions (consecutive positions above threshold)
    regions = []
    start = None
    for i, ident in enumerate(position_identity):
        if ident >= threshold:
            if start is None:
                start = i
        else:
            if start is not None and (i - start) >= min_length:
                region_identities = position_identity[start:i]
                regions.append({
                    "start": start,
                    "end": i - 1,
                    "length": i - start,
                    "avg_identity": round(sum(region_identities) / len(region_identities), 4),
                })
            start = None

    # Handle region extending to end
    if start is not None and (n_pos - start) >= min_length:
        region_identities = position_identity[start:]
        regions.append({
            "start": start,
            "end": n_pos - 1,
            "length": n_pos - start,
            "avg_identity": round(sum(region_identities) / len(region_identities), 4),
        })

    total_conserved = sum(r["length"] for r in regions)

    return {
        "position_identity": position_identity,
        "regions": regions,
        "total_positions": n_pos,
        "total_conserved": total_conserved,
        "conservation_pct": round(100 * total_conserved / n_pos, 2) if n_pos > 0 else 0,
        "threshold": threshold,
        "n_sequences": n_seqs,
    }
```

**Step 2: Commit**

```bash
git add backend/app/services/conservation.py
git commit -m "feat: conserved region detection from MAFFT alignments"
```

---

### Task 8: Celery task — Analysis pipeline

**Files:**
- Create: `backend/app/worker/tasks.py`
- Modify: `backend/app/worker/celery_app.py`

**Step 1: Implement the analysis pipeline task**

Create `backend/app/worker/tasks.py`:

```python
import logging
import os
import tempfile
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings
from app.models import AnalysisJob, CollectionSpecies, Sequence, JobStatus, SeqType
from app.services.mafft import run_mafft
from app.services.iqtree import run_fasttree, run_iqtree
from app.services.conservation import detect_conserved_regions
from app.worker.celery_app import celery_app

logger = logging.getLogger(__name__)

# Sync DB session for Celery workers (can't use async in Celery)
sync_engine = create_engine(settings.database_url_sync)
SyncSession = sessionmaker(sync_engine)


def _update_job(db: Session, job_id: UUID, **kwargs):
    """Update job fields and commit."""
    job = db.get(AnalysisJob, job_id)
    if job:
        for k, v in kwargs.items():
            setattr(job, k, v)
        db.commit()


def _publish_progress(job_id: UUID, pct: int, msg: str):
    """Publish progress to Redis for WebSocket consumers."""
    import redis
    r = redis.from_url(settings.redis_url)
    import json
    r.publish(f"job:{job_id}", json.dumps({"pct": pct, "msg": msg}))


@celery_app.task(bind=True, name="run_analysis")
def run_analysis(self, job_id: str):
    job_uuid = UUID(job_id)

    with SyncSession() as db:
        job = db.get(AnalysisJob, job_uuid)
        if not job:
            logger.error("Job %s not found", job_id)
            return

        # Get sequences from collection
        stmt = (
            select(CollectionSpecies)
            .where(CollectionSpecies.collection_id == job.collection_id)
        )
        links = db.execute(stmt).scalars().all()

        if len(links) < 3:
            _update_job(db, job_uuid, status=JobStatus.failed, error_msg="Need at least 3 sequences")
            return

        # Determine if nucleotide
        seq_ids = [link.sequence_id for link in links]
        sequences = []
        for sid in seq_ids:
            seq = db.get(Sequence, sid)
            if seq:
                sequences.append(seq)

        is_nucleotide = sequences[0].seq_type in (SeqType.dna, SeqType.rna) if sequences else True

        work_dir = tempfile.mkdtemp(prefix="gpf_analysis_")

        try:
            # --- STEP 1: Prepare FASTA (0-5%) ---
            _update_job(db, job_uuid, status=JobStatus.aligning, progress_pct=0, progress_msg="Preparing sequences...")
            _publish_progress(job_uuid, 0, "Preparing sequences...")

            input_fasta = os.path.join(work_dir, "input.fasta")
            with open(input_fasta, "w") as f:
                for seq in sequences:
                    label = f"{seq.accession}|{seq.species.name.replace(' ', '_')}" if seq.species else seq.accession
                    f.write(f">{label}\n{seq.sequence}\n")

            _update_job(db, job_uuid, progress_pct=5, progress_msg=f"Aligning {len(sequences)} sequences with MAFFT...")
            _publish_progress(job_uuid, 5, f"Aligning {len(sequences)} sequences with MAFFT...")

            # --- STEP 2: MAFFT alignment (5-40%) ---
            aligned_fasta = os.path.join(work_dir, "aligned.fasta")
            run_mafft(input_fasta, aligned_fasta)

            with open(aligned_fasta) as f:
                alignment_text = f.read()

            _update_job(db, job_uuid, progress_pct=40, progress_msg="Alignment complete. Building preview tree...", alignment=alignment_text)
            _publish_progress(job_uuid, 40, "Building preview tree with FastTree...")

            # --- STEP 3: FastTree preview (40-50%) ---
            _update_job(db, job_uuid, status=JobStatus.preview_tree)
            try:
                preview_newick = run_fasttree(aligned_fasta, is_nucleotide=is_nucleotide)
                _update_job(db, job_uuid, progress_pct=50, preview_tree=preview_newick, progress_msg="Preview tree ready. Running full analysis...")
                _publish_progress(job_uuid, 50, "Preview tree ready. Running IQ-TREE...")
            except Exception as e:
                logger.warning("FastTree failed (non-fatal): %s", e)
                _update_job(db, job_uuid, progress_pct=50, progress_msg="FastTree skipped. Running IQ-TREE...")
                _publish_progress(job_uuid, 50, "Running IQ-TREE...")

            # --- STEP 4: IQ-TREE (50-90%) ---
            _update_job(db, job_uuid, status=JobStatus.full_tree)
            iq_result = run_iqtree(aligned_fasta, is_nucleotide=is_nucleotide)

            _update_job(
                db, job_uuid,
                progress_pct=90,
                tree=iq_result["newick"],
                tree_model=iq_result["model"],
                progress_msg="Tree complete. Detecting conserved regions...",
            )
            _publish_progress(job_uuid, 90, "Detecting conserved regions...")

            # --- STEP 5: Conservation (90-100%) ---
            _update_job(db, job_uuid, status=JobStatus.conservation)
            conservation_data = detect_conserved_regions(aligned_fasta, threshold=0.9)

            _update_job(
                db, job_uuid,
                status=JobStatus.done,
                progress_pct=100,
                progress_msg="Analysis complete",
                conservation=conservation_data,
                finished_at=datetime.now(timezone.utc),
            )
            _publish_progress(job_uuid, 100, "Analysis complete")

        except Exception as e:
            logger.exception("Analysis failed for job %s", job_id)
            _update_job(
                db, job_uuid,
                status=JobStatus.failed,
                error_msg=str(e)[:1000],
                finished_at=datetime.now(timezone.utc),
            )
            _publish_progress(job_uuid, -1, f"Failed: {str(e)[:200]}")
```

**Step 2: Register tasks in celery_app.py**

Add to `backend/app/worker/celery_app.py`:
```python
celery_app.autodiscover_tasks(["app.worker"])
```

**Step 3: Commit**

```bash
git add backend/app/worker/
git commit -m "feat: Celery analysis pipeline — MAFFT → FastTree → IQ-TREE → conservation"
```

---

### Task 9: Router — Jobs + WebSocket

**Files:**
- Create: `backend/app/routers/jobs.py`
- Modify: `backend/app/main.py`

**Step 1: Implement jobs router with WebSocket**

Create `backend/app/routers/jobs.py`:

```python
import asyncio
import json
import logging
from uuid import UUID

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.database import get_db
from app.models import AnalysisJob, Collection, JobStatus
from app.schemas import JobCreate, JobStatusOut, JobResultsOut
from app.worker.tasks import run_analysis

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.post("", response_model=JobStatusOut)
async def create_job(data: JobCreate, db: AsyncSession = Depends(get_db)):
    collection = await db.get(Collection, data.collection_id)
    if not collection:
        raise HTTPException(404, "Collection not found")

    job = AnalysisJob(collection_id=data.collection_id)
    db.add(job)
    await db.commit()
    await db.refresh(job)

    # Dispatch Celery task
    run_analysis.delay(str(job.id))

    return JobStatusOut.model_validate(job)


@router.get("/{job_id}", response_model=JobStatusOut)
async def get_job_status(job_id: UUID, db: AsyncSession = Depends(get_db)):
    job = await db.get(AnalysisJob, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return JobStatusOut.model_validate(job)


@router.get("/{job_id}/results", response_model=JobResultsOut)
async def get_job_results(job_id: UUID, db: AsyncSession = Depends(get_db)):
    job = await db.get(AnalysisJob, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if job.status not in (JobStatus.done, JobStatus.preview_tree, JobStatus.full_tree, JobStatus.conservation):
        raise HTTPException(400, f"Job not ready: {job.status.value}")

    return JobResultsOut(
        id=job.id, status=job.status,
        alignment=job.alignment, preview_tree=job.preview_tree,
        tree=job.tree, tree_model=job.tree_model,
        bootstrap_data=job.bootstrap_data, conservation=job.conservation,
    )


# --- WebSocket for real-time progress ---
ws_router = APIRouter()

@ws_router.websocket("/ws/jobs/{job_id}")
async def job_progress_ws(websocket: WebSocket, job_id: UUID):
    await websocket.accept()
    r = aioredis.from_url(settings.redis_url)
    pubsub = r.pubsub()
    await pubsub.subscribe(f"job:{job_id}")

    try:
        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message and message["type"] == "message":
                data = json.loads(message["data"])
                await websocket.send_json(data)
                if data.get("pct", 0) >= 100 or data.get("pct", 0) < 0:
                    break
            await asyncio.sleep(0.1)
    except WebSocketDisconnect:
        pass
    finally:
        await pubsub.unsubscribe(f"job:{job_id}")
        await r.close()
```

**Step 2: Update main.py — remove analysis router, add collections + jobs + websocket**

Replace router registrations in `backend/app/main.py`:

```python
from app.routers import species, sequences, collections, jobs

# ... in app setup, replace:
# app.include_router(analysis.router)
# with:
app.include_router(collections.router)
app.include_router(jobs.router)
app.include_router(jobs.ws_router)
```

**Step 3: Commit**

```bash
git add backend/app/routers/jobs.py backend/app/main.py
git commit -m "feat: jobs router with WebSocket progress + wire up new routers"
```

---

### Task 10: Cleanup — Remove BLAST/old analysis code

**Files:**
- Delete: `backend/app/services/blast.py`
- Delete: `backend/app/services/phylogeny.py`
- Delete: `backend/app/routers/analysis.py`

**Step 1: Remove old files**

```bash
rm backend/app/services/blast.py
rm backend/app/services/phylogeny.py
rm backend/app/routers/analysis.py
```

**Step 2: Verify app starts**

```bash
cd backend && python -c "from app.main import app; print('App OK')"
```

**Step 3: Commit**

```bash
git add -A backend/app/services/blast.py backend/app/services/phylogeny.py backend/app/routers/analysis.py
git commit -m "refactor: remove BLAST and old phylogeny services"
```

---

### Task 11: Frontend — Update API client + types

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/api.ts`

**Step 1: Replace types**

Remove all BLAST-related types. Add collection and job types:

```ts
// Remove: BlastProgram, BlastRequest, BlastHit, BlastResponse, TreeRequest, TreeResponse, TreeMode

// Add:
export type JobStatus = 'queued' | 'aligning' | 'preview_tree' | 'full_tree' | 'conservation' | 'done' | 'failed'

export interface CollectionOut {
  id: string; name: string; seq_type: SeqType; species_count: number; created_at: string
}
export interface CollectionSpeciesOut {
  species: SpeciesOut; sequence: SequenceOut
}
export interface CollectionDetailOut {
  id: string; name: string; seq_type: SeqType; created_at: string; entries: CollectionSpeciesOut[]
}
export interface JobStatusOut {
  id: string; collection_id: string; status: JobStatus; progress_pct: number
  progress_msg: string | null; error_msg: string | null; created_at: string; finished_at: string | null
}
export interface ConservedRegion {
  start: number; end: number; length: number; avg_identity: number
}
export interface ConservationData {
  position_identity: number[]; regions: ConservedRegion[]; total_positions: number
  total_conserved: number; conservation_pct: number; threshold: number; n_sequences: number
}
export interface JobResultsOut {
  id: string; status: JobStatus; alignment: string | null; preview_tree: string | null
  tree: string | null; tree_model: string | null; bootstrap_data: Record<string, unknown> | null
  conservation: ConservationData | null
}
```

**Step 2: Update API client**

Replace BLAST methods with collection/job methods:

```ts
export const api = {
  // Keep: searchSpecies, getSequences

  createCollection(name: string, seq_type: SeqType) {
    return request<CollectionOut>('/collections', {
      method: 'POST', body: JSON.stringify({ name, seq_type }),
    })
  },
  getCollection(id: string) {
    return request<CollectionDetailOut>(`/collections/${id}`)
  },
  addToCollection(collectionId: string, speciesTaxonId: number, sequenceId: string) {
    return request<CollectionSpeciesOut>(`/collections/${collectionId}/species`, {
      method: 'POST', body: JSON.stringify({ species_taxon_id: speciesTaxonId, sequence_id: sequenceId }),
    })
  },
  removeFromCollection(collectionId: string, sequenceId: string) {
    return request(`/collections/${collectionId}/species/${sequenceId}`, { method: 'DELETE' })
  },
  createJob(collectionId: string) {
    return request<JobStatusOut>('/jobs', {
      method: 'POST', body: JSON.stringify({ collection_id: collectionId }),
    })
  },
  getJobStatus(jobId: string) {
    return request<JobStatusOut>(`/jobs/${jobId}`)
  },
  getJobResults(jobId: string) {
    return request<JobResultsOut>(`/jobs/${jobId}/results`)
  },
}

// WebSocket helper
export function connectJobProgress(jobId: string, onMessage: (data: { pct: number; msg: string }) => void): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const ws = new WebSocket(`${protocol}//${window.location.host}/ws/jobs/${jobId}`)
  ws.onmessage = (e) => onMessage(JSON.parse(e.data))
  return ws
}
```

**Step 3: Build to check for errors**

```bash
cd frontend && npm run build
```

**Step 4: Commit**

```bash
git add frontend/src/lib/
git commit -m "feat: update frontend types and API client for collections + jobs"
```

---

### Task 12: Frontend — Collection builder UI

**Files:**
- Create: `frontend/src/components/workspace/CollectionBuilder.tsx`
- Modify: `frontend/src/components/workspace/SpeciesSearch.tsx` (add "Add" button)
- Delete: `frontend/src/components/workspace/QueryInput.tsx`

**Step 1: Create CollectionBuilder**

Main left-panel component that:
- Integrates SpeciesSearch with an "Add to collection" flow
- Shows current collection as a list with remove buttons
- Species count badge
- Sequence type selector (DNA/RNA/Protein)
- "INICIAR ANÁLISE" button (enabled when collection ≥ 3 species)
- Creates collection via API on first add, then adds species to it
- Shows sequence selection for each species (pick which sequence to use)

**Step 2: Delete QueryInput (no longer needed)**

**Step 3: Build and commit**

```bash
cd frontend && npm run build
git add frontend/src/
git commit -m "feat: collection builder UI replacing BLAST query input"
```

---

### Task 13: Frontend — Job progress tracker

**Files:**
- Create: `frontend/src/components/workspace/JobProgress.tsx`
- Create: `frontend/src/hooks/useJobProgress.ts`

**Step 1: Create useJobProgress hook**

Custom hook that:
- Connects to WebSocket `/ws/jobs/{jobId}`
- Falls back to polling `GET /api/jobs/{jobId}` every 3s
- Returns: `{ status, progressPct, progressMsg, error, isComplete }`

**Step 2: Create JobProgress component**

Visual progress tracker:
- Named pipeline steps: Aligning → Preview Tree → Full Tree → Conservation → Done
- Progress bar with percentage
- Current step highlighted in cyan
- Completed steps in green with checkmark
- Error state in red
- Animated scanning line during active processing

**Step 3: Build and commit**

```bash
cd frontend && npm run build
git add frontend/src/
git commit -m "feat: job progress tracker with WebSocket support"
```

---

### Task 14: Frontend — Phylogenetic tree (update Dendrogram)

**Files:**
- Modify: `frontend/src/components/results/Dendrogram.tsx`

**Step 1: Update Dendrogram for new data format**

- Accept `newick: string` prop directly (instead of TreeResponse)
- Remove mode toggle (tree mode is determined by backend now)
- Add `treeModel?: string` prop to show which model was used
- Add preview vs final indicator
- Keep: D3 rendering, zoom/pan, Newick parser, animated drawing

**Step 2: Build and commit**

```bash
cd frontend && npm run build
git add frontend/src/
git commit -m "feat: update dendrogram for IQ-TREE Newick format"
```

---

### Task 15: Frontend — Conservation heatmap

**Files:**
- Create: `frontend/src/components/results/ConservationMap.tsx`

**Step 1: Create conservation visualization**

D3 or Canvas-based heatmap showing:
- Horizontal bar (one pixel/unit per alignment position)
- Color gradient: red (0% identity) → yellow (50%) → green/cyan (100%)
- Threshold slider that highlights regions above threshold
- List of conserved regions below with start, end, length, avg_identity
- Summary stats: total positions, % conserved, N sequences
- Click on a region to zoom into it
- Export regions as text

**Step 2: Build and commit**

```bash
cd frontend && npm run build
git add frontend/src/
git commit -m "feat: conservation heatmap visualization"
```

---

### Task 16: Frontend — Rewire AnalysisWorkspace

**Files:**
- Rewrite: `frontend/src/components/workspace/AnalysisWorkspace.tsx`
- Modify: `frontend/src/App.tsx`
- Delete: `frontend/src/components/results/BlastResults.tsx`
- Delete: `frontend/src/components/results/AlignmentView.tsx`
- Delete: `frontend/src/components/results/ScoreBar.tsx`

**Step 1: Rewrite AnalysisWorkspace**

New flow:
- Left panel: CollectionBuilder (search + add species + start analysis)
- Right panel: initially empty → JobProgress → Results tabs (Tree + Conservation)
- State: collection, job, jobResults
- Two result tabs: "Árvore Filogenética" and "Regiões Conservadas"
- Show preview tree as soon as available (from job progress)
- Replace with full tree when job completes

**Step 2: Delete old BLAST components**

```bash
rm frontend/src/components/results/BlastResults.tsx
rm frontend/src/components/results/AlignmentView.tsx
rm frontend/src/components/results/ScoreBar.tsx
```

**Step 3: Build and commit**

```bash
cd frontend && npm run build
git add -A frontend/src/
git commit -m "feat: rewire workspace for collection → analysis → results flow"
```

---

### Task 17: Install external tools + end-to-end test

**Step 1: Install MAFFT, FastTree, IQ-TREE**

On Windows, download binaries and add to PATH or set paths in `.env`:
- MAFFT: https://mafft.cbrc.jp/alignment/software/
- FastTree: http://www.microbesonline.org/fasttree/
- IQ-TREE: http://www.iqtree.org/

**Step 2: Start all services**

```bash
docker compose up -d          # PostgreSQL + Redis
cd backend && celery -A app.worker.celery_app worker --loglevel=info &  # Worker
cd backend && python -m uvicorn app.main:app --port 8000 --reload &     # API
cd frontend && npm run dev &   # Frontend
```

**Step 3: Test end-to-end**

1. Open http://localhost:5173
2. Search "Escherichia coli" → add to collection
3. Search "Salmonella enterica" → add to collection
4. Search "Klebsiella pneumoniae" → add to collection
5. Click "INICIAR ANÁLISE"
6. Watch progress bar advance through steps
7. View phylogenetic tree
8. View conservation map

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete v2 — multi-species comparative analysis platform"
```
