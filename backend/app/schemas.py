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
