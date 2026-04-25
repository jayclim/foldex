from uuid import uuid4

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.annotator import annotate_variant
from app.jobs import Job, JobStatus, jobs
from app.normalizer import normalize_variant
from app.parser import parse_variant_input
from app.reporter import generate_report
from app.schemas import AnalyzeRequest, AnalyzeResponse, JobResponse
from app.similarity import find_similar_variants
from app.structures import prepare_structures

app = FastAPI(
    title="Foldex API",
    version="0.1.0",
    description="Simple hackathon backend for variant analysis research support.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze(request: AnalyzeRequest, background_tasks: BackgroundTasks) -> AnalyzeResponse:
    job_id = str(uuid4())
    jobs[job_id] = Job(job_id=job_id, status=JobStatus.queued)

    background_tasks.add_task(run_analysis_job, job_id, request.text)
    return AnalyzeResponse(job_id=job_id, status=JobStatus.queued)


@app.get("/api/jobs/{job_id}", response_model=JobResponse)
async def get_job(job_id: str) -> JobResponse:
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobResponse(**job.model_dump())


async def run_analysis_job(job_id: str, text: str) -> None:
    job = jobs[job_id]
    job.status = JobStatus.running

    try:
        parsed_variant = await parse_variant_input(text)
        normalized_variant = await normalize_variant(parsed_variant)
        annotations = await annotate_variant(normalized_variant)
        similar_variants = await find_similar_variants(normalized_variant, annotations)
        structures = await prepare_structures(normalized_variant, similar_variants, annotations)
        report = await generate_report(
            normalized_variant=normalized_variant,
            annotations=annotations,
            similar_variants=similar_variants,
            structures=structures,
        )

        job.result = {
            "variant": normalized_variant,
            "annotations": annotations,
            "similar_variants": similar_variants,
            "structures": structures,
            "report": report,
        }
        job.status = JobStatus.completed
    except Exception as exc:  # noqa: BLE001 - expose errors during hackathon development.
        job.status = JobStatus.failed
        job.error = str(exc)
