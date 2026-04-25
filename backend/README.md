# Foldex Backend

Simple FastAPI scaffold for the hackathon backend.

The backend intentionally has:

- one main server file with all endpoints: `app/main.py`
- one startup file: `main.py`
- one module per pipeline task
- no database
- no Redis queue
- no router/model/service nesting

Jobs are stored in an in-memory dictionary in `app/jobs.py`, so they reset when the server restarts. That is enough for a demo where the frontend submits a variant and polls for progress.

## Files

- `main.py`: starts the Uvicorn FastAPI server
- `app/main.py`: FastAPI app, CORS, `/health`, `/api/analyze`, `/api/jobs/{job_id}`, and pipeline orchestration
- `app/annotator.py`: VEP, AlphaMissense, ClinVar, gnomAD, UniProt task
- `app/similarity.py`: known similar variant search and scoring task
- `app/structures.py`: AlphaFold/wild-type/mutant structure artifact task
- `app/reporter.py`: Claude report generation task
- `app/jobs.py`: in-memory job state
- `app/schemas.py`: small request/response schemas

## Local Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
python main.py
```

API docs will be available at `http://127.0.0.1:8000/docs`.

## API

Analyze a text variant:

```bash
curl -X POST http://127.0.0.1:8000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"text":"BRCA1 c.5096G>A p.Arg1699Gln"}'
```

Poll a job:

```bash
curl http://127.0.0.1:8000/api/jobs/<job_id>
```

This project is for research support and hackathon demonstration only. It must not present outputs as medical diagnosis or treatment guidance.
