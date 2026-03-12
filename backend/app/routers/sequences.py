from fastapi import APIRouter, Query, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models import Species, Sequence, SeqType, SeqSource
from app.services.ncbi import fetch_sequences, search_species
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
