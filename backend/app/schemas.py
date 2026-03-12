from pydantic import BaseModel, Field
from datetime import datetime
from uuid import UUID
from app.models import SeqType, SeqSource, JobStatus

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
