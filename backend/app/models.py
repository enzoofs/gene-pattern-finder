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

class JobStatus(str, enum.Enum):
    queued = "queued"
    aligning = "aligning"
    preview_tree = "preview_tree"
    full_tree = "full_tree"
    conservation = "conservation"
    done = "done"
    failed = "failed"

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
