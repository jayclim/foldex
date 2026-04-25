# Current Implementation Snapshot

This document contains the original product and backend pipeline notes below. The repository currently implements a simpler hackathon scaffold.

## Runtime Shape

```text
Frontend (Vite + React + TS)
  /
  /analysis
  /reports
        |
        v
Backend (FastAPI)
  GET  /health
  POST /api/analyze
  GET  /api/jobs/{job_id}
        |
        v
In-memory job state only
```

There is no database, no Redis queue, and no deep backend service hierarchy. The backend is intentionally flat so contributors can claim one task file at a time.

## Backend Structure

```text
backend/
  main.py
  requirements.txt
  app/
    main.py
    parser.py
    normalizer.py
    annotator.py
    structures.py
    features.py
    similarity.py
    reporter.py
    jobs.py
    schemas.py
```

Pipeline in `backend/app/main.py`:

```text
parse_variant_input
  -> normalize_variant
  -> annotate_variant
  -> find_similar_variants
  -> prepare_structures
  -> generate_report
```

`jobs.py` stores job status in memory. Jobs reset when the server restarts.

## Frontend Structure

```text
frontend/src/
  App.tsx
  layouts/
  components/
  pages/
  utils/
```

Routes:

- `/`: dashboard view
- `/analysis`: analysis view
- `/reports`: reports view

The frontend uses shared layout components for the app shell/sidebar and shared primitives such as `Button` and `MaterialIcon`. Static mock data currently lives in `src/utils`.

## Design Source Mapping

- `docs/design/dashboard_view` -> `frontend/src/pages/DashboardPage.tsx`
- `docs/design/analysis_view` -> `frontend/src/pages/AnalysisPage.tsx`
- `docs/design/reports_view` -> `frontend/src/pages/ReportsPage.tsx`

---

AI DESCRIPTION PROMPT
This is a web app that should take in gene data with some unknown mutation or variant from a lab report or just text of the gene variant. Then, the backend will analyze this unknown gene mutation and give a report if the gene’s benign or pathogenic, its differences to the wild type, and potential symptoms or behavior based on comparison to known variants that are similar. The report should also contain 3D models of the wild type, unknown mutation, and known variants of that gene. The unknown mutation 3D model can be generated through ESMFold API. Descriptions of each gene variant can be added too. The main goal and purpose is to help identify unknown gene variants and help guide clinical and medical research to better assess individuals’ susceptibility to different diseases and diagnose through comparing to known variants of that gene as well as other information listed below.
Now, I will lay out the design of how this analysis will be done on the backend. First, the backend receives a pdf lab report or some gene + mutation text input. It should parse the gene into a standard format preferably just using Claude API. Then, this gene will be sent to different APIs/tools to receive data about it.

1. The gene needs to go through AlphaMissense to get a report of how benign or pathogenic it may be.
2. The gene needs to go through some GnomeDB or other source to get its population frequency or other characteristics.
3. The gene’s wild type needs to be known.
4. The mutation needs to go through ESMFold to determine its 3D structure, then some other resource or API like biopython needs to be able to extract features about the 3D structure and the protein itself. The features of the protein should encapsulate everything learned and the data received so far except the 3D model including wild type, population frequency, protein structure etc.
5. Claude should then take these features and start performing some major analysis. It should first try to find known variants that are similar through some methods that still need to be decided. It could search known databases (like NCBI), web scrape, or search through research papers with proteins, genes, and features that are similar to the 3D structure that we got from step 4. The top 5-10 of these variants should be returned using the information of the mutation from step 4 gathered.
6. Claude should generate descriptions for the wild type gene, mutant gene, 5-10 most similar known variants, the 3D structures for each of those to display by ESMFold, a summary report on the benign/pathogenic, information about similar known variants, the information gathered from above, and likely behavior/expression based on the similar known variants (this is the important part). This should be sent to the frontend.
   The main pipeline should be getting the gene and variant from frontend, giving it to annotator.py which calls structures.py and features.py, then feed that annotator.py data to similarity.py, which gives you the top 5-10 similar variants, then send those to structures.py which gives you the structures of those, then send everything the annotations and all that to reporter.py which sends it all to the frontend which is used to display everything like the structures of stuff.

Recommended backend flow
Frontend
↓
Upload PDF or text: "BRCA1 c.5096G>A p.Arg1699Gln"
↓
API Gateway / Backend
↓

1. Variant parser
2. Variant normalizer
3. Annotation pipeline
4. Similar-variant search
5. Structure pipeline
6. Claude report generator
   ↓
   Report JSON + 3D structure files

APIs / data sources to use

1. Parse and normalize the input
   Use Claude for messy lab-report parsing, but validate using bioinformatics tools.
   Good output format:
   {
   "gene": "BRCA1",
   "transcript": "NM_007294.4",
   "hgvs_c": "c.5096G>A",
   "hgvs_p": "p.Arg1699Gln",
   "genome_build": "GRCh38",
   "chrom": "17",
   "pos": 43071077,
   "ref": "G",
   "alt": "A"
   }

Use:
Mutalyzer or VariantValidator for HGVS validation.
Ensembl VEP REST API for variant consequence, transcript mapping, protein position, SIFT/PolyPhen, and AlphaMissense annotations.
ClinVar for known clinical assertions. ClinVar is a public archive of human variants and disease/drug-response classifications, and supports programmatic access. (NCBI) 2. Pathogenicity / benign prediction
Use Ensembl VEP with AlphaMissense enabled.
Ensembl says AlphaMissense scores are integrated into VEP and can be enabled in REST calls with AlphaMissense=1. (Ensembl Blog)
Call:
POST https://rest.ensembl.org/vep/human/hgvs

with options including:
{
"hgvs_notations": ["BRCA1:c.5096G>A"],
"AlphaMissense": 1,
"canonical": 1,
"protein": 1,
"domains": 1,
"uniprot": 1
}

3. Population frequency
   Use gnomAD.
   For hackathon speed:
   Query gnomAD GraphQL API by variant ID.
   Store allele frequency, population-specific frequency, homozygote count, allele number, filters.
   gnomAD has a public GraphQL API, and its browser changelog confirms the public GraphQL API is maintained. (gnomAD)
   Variant ID format usually looks like:
   17-43071077-G-A

4. Wild-type protein sequence and metadata
   Use:
   UniProt REST API: canonical protein sequence, domains, function, disease annotations, isoforms.
   Ensembl: transcript → protein mapping.
   Optional: InterPro / Pfam for domains.
5. 3D structure
   Important: AlphaFold DB gives predicted structures for existing proteins, usually wild-type UniProt proteins. It does not simply take any arbitrary mutation and instantly return a new mutant AlphaFold model.
   Use:
   AlphaFold DB / EBI API for wild-type structure.
   For mutant and similar variants:
   hackathon option: use ColabFold batch or ESMFold to generate mutant structures from altered protein sequences.
   faster demo option: show wild-type AlphaFold structure and highlight the mutated residue.
   more realistic option: generate mutant PDB asynchronously in a worker.
   AlphaFold DB provides open access to structures and is introducing API schema changes, with legacy API retirement planned for June 2026, so build behind your own adapter layer.
   All of the information from 1-5 needs to be in some standard object or format encapsulating all of the features learned about the mutation so far. This will be fed to Claude for variant search and analysis afterward.
   Backend services
   /api/analyze
   accepts PDF/text
   returns job_id

/jobs/{job_id}
returns status + partial/final report

/services/parser
Claude extraction from PDF/text

/services/normalizer
HGVS validation, transcript mapping

/services/annotator
VEP, AlphaMissense, ClinVar, gnomAD, UniProt

/services/similar-variants
searches known variants and ranks top 5-10

/services/structure
fetches AlphaFold WT structure
creates/highlights mutant structures

/services/report
Claude generates structured final report

Use a queue:
FastAPI / Node backend
↓
Redis Queue / BullMQ / Celery
↓
Workers:

- annotation worker
- structure worker
- literature search worker
- report worker

For a hackathon, I’d use:
Frontend: Vite + React + TS
Backend: FastAPI
3D viewer: Mol\* or 3Dmol.js
LLM: Claude

Similar variant search strategy
Do not let Claude freely “guess similar variants.” Make it rank candidates from structured sources.
Candidate sources
Search:
Same gene, same protein domain.
Same amino-acid position.
Nearby residues, for example ±10 amino acids.
Same substitution class, for example Arg→Gln, charged→polar.
Same domain/function region.
Variants with ClinVar pathogenic/benign labels.
Variants with similar AlphaMissense, SIFT, PolyPhen, CADD/REVEL if available.
Literature mentions.
Useful APIs/sources:
ClinVar
Ensembl VEP
gnomAD
UniProt variants/features
LitVar / PubMed
OpenTargets Genetics, optional
LOVD, optional
MaveDB, optional for experimentally measured variant effects

Claude prompt for similar variant analysis
Use this as the main analysis prompt:
You are a genomics research assistant. You are not making a clinical diagnosis.

Given the unknown variant and the structured annotations below, identify known variants that are biologically similar and useful for research comparison.

Unknown variant:
{variant_json}

Available annotations:
{annotation_json}

Candidate known variants:
{candidate_variants_json}

Instructions:

1. Do not invent variants, papers, symptoms, or classifications.
2. Only use evidence present in the provided JSON.
3. Rank the top 5-10 similar variants.
4. For each variant, explain why it is similar using:
   - same gene
   - same protein domain
   - distance from mutated residue
   - amino-acid property change
   - AlphaMissense or other pathogenicity score similarity
   - ClinVar classification
   - population frequency
   - known phenotype/disease association, if present
5. Clearly separate:
   - established evidence
   - computational prediction
   - uncertain hypothesis
6. If evidence is weak or conflicting, say so.
7. Return strict JSON in this schema:

{
"top_similar_variants": [
{
"variant": "",
"gene": "",
"hgvs_p": "",
"similarity_score": 0,
"known_classification": "",
"why_similar": [],
"evidence": [],
"limitations": []
}
],
"summary": "",
"confidence": "low | medium | high",
"clinical_disclaimer": ""
}

Final report generation prompt
You are generating a research-support variant report. This is not medical advice or diagnosis.

Use only the structured evidence below.

Input:
{full_pipeline_json}

Write a report with these sections:

1. Variant identity
2. Wild-type gene/protein summary
3. Mutant variant summary
4. Predicted pathogenicity
5. Population frequency
6. Structural interpretation
7. Similar known variants
8. Possible disease or phenotype associations
9. Evidence strength and limitations
10. Recommended next research steps

Rules:

- Do not overstate computational predictions.
- Distinguish ClinVar/literature evidence from AlphaMissense/AlphaFold predictions.
- Mention when no reliable evidence was found.
- Avoid giving treatment or diagnosis recommendations.
- Output both human-readable markdown and structured JSON.

MVP scope I recommend
For hackathon demo, build this:
Input:
gene + HGVS text, not full PDF first

Backend:
Claude parser
Ensembl VEP + AlphaMissense
ClinVar lookup
gnomAD frequency
UniProt wild-type protein
AlphaFold wild-type structure
Similar variants from ClinVar + same-domain/nearby residue search

Frontend:
report page
pathogenicity badge
population frequency card
3D Mol\* viewer with mutated residue highlighted
table of similar variants
