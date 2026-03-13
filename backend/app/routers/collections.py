import logging
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.exc import IntegrityError
from app.database import get_db
from app.models import Collection, CollectionSpecies, Species, Sequence, SeqType, SeqSource
from app.schemas import (
    CollectionCreate, CollectionOut, CollectionDetailOut,
    CollectionSpeciesAdd, CollectionSpeciesOut, SpeciesOut, SequenceOut,
    AutoAddSpecies,
)
from app.gene_targets import GENE_TARGETS, GENE_TARGETS_BY_ID
from app.services.ncbi import search_species, fetch_sequences
from app.routers.species import _check_ncbi_rate_limit

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/collections", tags=["collections"])

@router.get("/gene-targets")
async def get_gene_targets():
    """Retorna lista de genes-alvo disponiveis para selecao automatica."""
    return JSONResponse(
        content=[
            {
                "id": g.id,
                "gene_query": g.gene_query,
                "label": g.label,
                "description": g.description,
                "seq_type": g.seq_type,
            }
            for g in GENE_TARGETS
        ],
        headers={"Cache-Control": "public, max-age=86400"},
    )

@router.post("", response_model=CollectionOut)
async def create_collection(data: CollectionCreate, db: AsyncSession = Depends(get_db)):
    collection = Collection(name=data.name, seq_type=data.seq_type, gene_target=data.gene_target)
    db.add(collection)
    await db.commit()
    await db.refresh(collection)
    return CollectionOut(
        id=collection.id, name=collection.name, seq_type=collection.seq_type,
        gene_target=collection.gene_target,
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
        gene_target=collection.gene_target,
        created_at=collection.created_at, entries=entries,
    )

@router.post("/{collection_id}/auto-add", response_model=CollectionSpeciesOut)
async def auto_add_species(
    collection_id: UUID, data: AutoAddSpecies, db: AsyncSession = Depends(get_db),
):
    """Busca especie pelo nome e seleciona automaticamente a melhor sequencia do gene-alvo."""
    # Rate limiting — protege contra bloqueio do NCBI
    _check_ncbi_rate_limit()

    collection = await db.get(Collection, collection_id)
    if not collection:
        raise HTTPException(404, "Collection not found")

    if not collection.gene_target:
        raise HTTPException(400, "Collection nao tem gene-alvo definido. Use o fluxo manual.")

    gene_info = GENE_TARGETS_BY_ID.get(collection.gene_target)
    if not gene_info:
        raise HTTPException(400, f"Gene-alvo '{collection.gene_target}' nao reconhecido")

    # 1. Busca especie no NCBI
    species_results = await search_species(data.species_name)
    if not species_results:
        raise HTTPException(404, f"Especie '{data.species_name}' nao encontrada no NCBI")

    sp_info = species_results[0]

    # 2. Busca/cria Species no banco
    sp_stmt = select(Species).where(Species.taxon_id == sp_info["taxon_id"])
    species = (await db.execute(sp_stmt)).scalar_one_or_none()
    if not species:
        species = Species(
            taxon_id=sp_info["taxon_id"],
            name=sp_info["name"],
            rank=sp_info["rank"],
            lineage=sp_info.get("lineage"),
        )
        db.add(species)
        await db.flush()

    # 3. Busca sequencias com o gene-alvo (max_results=5 — so precisa da melhor)
    seq_type = SeqType(gene_info.seq_type)
    try:
        raw_seqs = await fetch_sequences(sp_info["taxon_id"], seq_type, max_results=5, gene=gene_info.gene_query)
    except Exception as e:
        logger.error("NCBI fetch failed for %s: %s", sp_info['name'], e)
        raise HTTPException(502, f"NCBI indisponivel para {sp_info['name']}: {e}")

    if not raw_seqs:
        raise HTTPException(404, f"Nenhuma sequencia de '{gene_info.label}' encontrada para {sp_info['name']}")

    # 4. Scoring para selecionar a melhor sequencia
    def score_seq(s: dict) -> int:
        score = 0
        title_lower = s["title"].lower()
        gene_lower = gene_info.gene_query.lower()
        # Titulo contem o nome do gene
        if gene_lower in title_lower:
            score += 10
        # Tamanho medio (nem muito curto, nem genoma completo)
        length = s["length"]
        if 500 <= length <= 5000:
            score += 5
        elif length < 500:
            score += 2
        # Penaliza genomas completos
        if "complete genome" in title_lower or "chromosome" in title_lower:
            score -= 10
        return score

    raw_seqs.sort(key=score_seq, reverse=True)
    best = raw_seqs[0]

    # 5. Salva Sequence no banco (ou busca se ja existe)
    existing_seq_stmt = select(Sequence).where(Sequence.accession == best["accession"])
    sequence = (await db.execute(existing_seq_stmt)).scalar_one_or_none()
    if not sequence:
        sequence = Sequence(
            species_id=species.id,
            accession=best["accession"],
            seq_type=seq_type,
            title=best["title"],
            sequence=best["sequence"],
            length=best["length"],
            source=SeqSource.ncbi,
        )
        db.add(sequence)
        await db.flush()

    # 6. Verifica duplicata na colecao
    dup_stmt = select(CollectionSpecies).where(
        CollectionSpecies.collection_id == collection_id,
        CollectionSpecies.species_id == species.id,
    )
    if (await db.execute(dup_stmt)).scalar_one_or_none():
        raise HTTPException(409, f"{sp_info['name']} ja esta na colecao")

    # 7. Adiciona a colecao
    link = CollectionSpecies(
        collection_id=collection_id,
        species_id=species.id,
        sequence_id=sequence.id,
    )
    db.add(link)

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "Especie ou sequencia ja existe na colecao")

    await db.refresh(link)
    await db.refresh(species)
    await db.refresh(sequence)

    return CollectionSpeciesOut(
        species=SpeciesOut.model_validate(species),
        sequence=SequenceOut.model_validate(sequence),
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
