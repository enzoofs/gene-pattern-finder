import logging

from fastapi import APIRouter, Query, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from app.database import get_db
from app.models import Species, Sequence, SeqType, SeqSource
from app.services.ncbi import fetch_sequences, search_species
from app.schemas import SequenceListResponse, SequenceOut, SpeciesOut

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/sequences", tags=["sequences"])


@router.get("/{taxon_id}", response_model=SequenceListResponse)
async def get_sequences(
    taxon_id: int,
    type: SeqType = Query(default=SeqType.dna),
    limit: int = Query(default=50, ge=10, le=500),
    gene: str = Query(default="", description="Filtro por gene ou titulo (ex: COX1, 16S)"),
    db: AsyncSession = Depends(get_db),
):
    # Check cache (so usa cache se nao tem filtro de gene)
    if not gene:
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
    else:
        stmt = select(Species).where(Species.taxon_id == taxon_id)
        result = await db.execute(stmt)
        species = result.scalar_one_or_none()

    # Fetch from NCBI
    raw_seqs = await fetch_sequences(taxon_id, type, max_results=limit, gene=gene)

    if not species:
        sp_data = await search_species(str(taxon_id))
        # Accept any returned species (NCBI may redirect merged taxon IDs)
        sp_info = next(iter(sp_data), None)
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
        raise HTTPException(404, "Species not found on NCBI")

    # Get existing accessions to avoid duplicate inserts
    existing_accs_stmt = select(Sequence.accession).where(
        Sequence.accession.in_([s["accession"] for s in raw_seqs])
    )
    existing_result = await db.execute(existing_accs_stmt)
    existing_accs = {row[0] for row in existing_result}

    db_sequences = []
    for seq_data in raw_seqs:
        if seq_data["accession"] in existing_accs:
            continue
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

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        logger.warning("IntegrityError during sequence insert for taxon %s, fetching from cache", taxon_id)
        seq_stmt = (
            select(Sequence)
            .where(Sequence.species_id == species.id, Sequence.seq_type == type)
            .limit(limit)
        )
        seq_result = await db.execute(seq_stmt)
        db_sequences = list(seq_result.scalars().all())

    for s in db_sequences:
        await db.refresh(s)
    await db.refresh(species)

    return SequenceListResponse(
        species=SpeciesOut.model_validate(species),
        sequences=[SequenceOut.model_validate(s) for s in db_sequences],
        total=len(db_sequences),
        from_cache=False,
    )
