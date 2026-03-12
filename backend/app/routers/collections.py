from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
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
