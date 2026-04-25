# Foldex

Hackathon web app for research-support analysis of gene variants from lab-report text or direct HGVS input.

The backend scaffold lives in `backend/` and is organized so contributors can independently own:

- variant parsing and normalization
- VEP/AlphaMissense, ClinVar, gnomAD, and UniProt annotations
- similar-variant ranking
- AlphaFold/structure artifacts
- Claude-backed report generation

See `backend/README.md` for setup and module ownership.
