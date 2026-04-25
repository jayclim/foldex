# Foldex

Foldex is a hackathon web app for research-support analysis of gene variants from lab-report text or direct HGVS-style input.

The goal is to help researchers explore an unknown variant by combining structured annotations, pathogenicity predictions, population frequency, protein structure context, similar known variants, and a generated report. Outputs must be presented as research support only, not as medical diagnosis or treatment guidance.

## Project Structure

```text
backend/
  main.py                 # run `python main.py` to start FastAPI
  app/
    main.py               # endpoints and pipeline orchestration
    parser.py             # input parsing stub
    normalizer.py         # HGVS normalization stub
    annotator.py          # external annotation stub
    structures.py         # structure artifact stub
    features.py           # structure feature extraction stub
    similarity.py         # similar variant ranking stub
    reporter.py           # report generation stub
    jobs.py               # in-memory job state
    schemas.py            # request/response schemas

frontend/
  src/
    App.tsx               # lightweight pathname router
    layouts/              # shared app shell, sidebar, headers, FABs
    components/           # shared primitives and page panels
    pages/                # Dashboard, Analysis, Reports pages
    utils/                # static mock UI data

docs/
  ARCHITECTURE.md
  design/                 # visual design references
```

## Backend

The backend is intentionally flat and simple for delegation. It has no database, no Redis queue, and no deep router/service/model nesting.

```bash
cd backend
pip install -r requirements.txt
python main.py
```

API docs are available at `http://127.0.0.1:8000/docs`.

Current endpoints:

- `GET /health`
- `POST /api/analyze`
- `GET /api/jobs/{job_id}`

## Frontend

The frontend is Vite + React + TypeScript with Bun. It implements three static design-driven pages using clean routes:

- `/`
- `/analysis`
- `/reports`

```bash
cd frontend
bun install
bun run dev
```

Verification:

```bash
cd frontend
bun run build
bun run lint
```

## Current Status

The frontend has static/mock implementations of the dashboard, analysis, and reports screens based on `docs/design`.

The backend is a scaffold with pipeline modules ready for contributors to implement parsing, normalization, annotation, structure handling, feature extraction, similarity search, and report generation.
