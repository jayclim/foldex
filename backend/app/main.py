from dotenv import load_dotenv
load_dotenv()

from uuid import uuid4

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.annotator import annotate_variant
from app.jobs import Job, JobStatus, jobs
from app.reporter import generate_report
from app.schemas import AnalysisResult, AnalyzeRequest, AnalyzeResponse, JobResponse
from app.similarity import find_similar_variants
from app.structures import structures_for_report

app = FastAPI(
    title="Foldex API",
    version="0.1.0",
    description="Simple hackathon backend for variant analysis research support.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "https://foldex-three.vercel.app",
    ],
    allow_origin_regex=r"https://.*\.(vercel\.app|onrender\.com)$",
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

    background_tasks.add_task(run_analysis_job, job_id, request.gene, request.mutation)
    return AnalyzeResponse(job_id=job_id, status=JobStatus.queued)


@app.get("/api/jobs/{job_id}", response_model=JobResponse)
async def get_job(job_id: str) -> JobResponse:
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobResponse(**job.model_dump())


async def run_analysis_job(job_id: str, gene: str, mutation: str) -> None:
    job = jobs[job_id]
    job.status = JobStatus.running

    try:
        variant = {"gene": gene, "mutation": mutation}
        annotations = await annotate_variant(variant)
        variant_record = annotations.get("variant", variant)
        similar_variants = await find_similar_variants(variant_record, annotations)
        structures = await structures_for_report(variant_record, similar_variants, annotations)
        report = await generate_report(
            variant=variant_record,
            annotations=annotations,
            similar_variants=similar_variants,
            structures=structures,
        )

        job.result = AnalysisResult.model_validate(
            {
                "variant": variant_record,
                "annotations": annotations,
                "similar_variants": similar_variants,
                "structures": structures,
                "report": report,
            }
        )
        job.status = JobStatus.completed
    except Exception as exc:  # noqa: BLE001 - expose errors during hackathon development.
        job.status = JobStatus.failed
        job.error = str(exc)
