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
