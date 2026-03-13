import asyncio
import json
import logging
from uuid import UUID

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

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

    # Passa outgroup se fornecido
    run_analysis.delay(str(job.id), outgroup=data.outgroup_accession)

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
    if job.status not in (
        JobStatus.done, JobStatus.preview_tree, JobStatus.full_tree,
        JobStatus.conservation, JobStatus.motifs, JobStatus.clustering,
        JobStatus.network, JobStatus.insights,
    ):
        raise HTTPException(400, f"Job not ready: {job.status.value}")

    return JobResultsOut(
        id=job.id, status=job.status,
        alignment=job.alignment, preview_tree=job.preview_tree,
        tree=job.tree, tree_model=job.tree_model,
        bootstrap_data=job.bootstrap_data, conservation=job.conservation,
        motifs=job.motifs, clustering=job.clustering, network=job.network,
        insights=job.insights,
    )


# WebSocket router (separate to avoid prefix)
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
