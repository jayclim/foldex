from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    text: str = Field(..., examples=["BRCA1 c.5096G>A p.Arg1699Gln"])


class JobStatus(str, Enum):
    queued = "queued"
    running = "running"
    completed = "completed"
    failed = "failed"


class AnalyzeResponse(BaseModel):
    job_id: str
    status: JobStatus


class JobResponse(BaseModel):
    job_id: str
    status: JobStatus
    result: dict[str, Any] | None = None
    error: str | None = None
