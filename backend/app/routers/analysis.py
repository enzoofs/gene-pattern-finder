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
