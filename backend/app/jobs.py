from typing import Any

from pydantic import BaseModel

from app.schemas import JobStatus


class Job(BaseModel):
    job_id: str
    status: JobStatus
    result: dict[str, Any] | None = None
    error: str | None = None


# No database for the hackathon scaffold. Jobs reset when the server restarts.
jobs: dict[str, Job] = {}
