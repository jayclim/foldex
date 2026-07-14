# FoldEx

FoldEx is a Next.js demo that turns a genetic variant into an evidence packet for human review. It parses a gene mutation, organizes population and clinical evidence, compares similar known variants, shows structure context, and produces a research-only report with a plain-language patient summary.

Finalist, Cornell Claude Builder Club Social Impact Hackathon, Spring 2026 Biology & Physical Health track.

> FoldEx is not a diagnostic device. It is a research-support prototype. Outputs must be reviewed by a qualified clinician, genetic counselor, or geneticist.

## Why It Exists

A variant of uncertain significance can leave patients and clinicians stuck between raw genetic data and a useful interpretation. A specialist normally has to check databases like ClinVar, gnomAD, UniProt, AlphaMissense/VEP, literature, and protein-structure tools by hand.

FoldEx demonstrates how that workflow can be compressed into one reviewer-friendly interface:

- Parse a gene variant from text, PDF, or VCF-like input.
- Collect or simulate evidence from clinical, population, sequence, and structure sources.
- Rank similar variants so reviewers can compare known evidence.
- Generate a structured report plus a patient-facing summary.
- Keep uncertainty visible instead of pretending the model made a diagnosis.

## Current Version

This repo is the converted Next.js version of the original Vite + FastAPI hackathon build. The old split frontend/backend layout has been collapsed into:

- `app/` - Next.js App Router pages and API routes.
- `pages-client/`, `components/`, `layouts/` - client UI.
- `server/` - Node-based analysis pipeline used by API routes.
- `utils/` - parsing, report export, and demo data helpers.
- `tests/` - parser tests and fixtures.

The app builds successfully with `next build` and is ready to deploy to Vercel as a Next.js project.

## Demo Mode

For a public resume link, use demo mode. It returns a realistic, clearly labeled fixture result immediately, without requiring Redis, QStash, Anthropic, Groq, Ensembl, ClinVar, gnomAD, UniProt, or ESMFold to be live during a recruiter screen.

Demo mode is enabled when:

- `FOLDEX_DEMO_MODE=1`, or
- the app is running on Vercel without `KV_REST_API_URL` and `QSTASH_TOKEN`.

This is intentional. The demo proves the product flow, UI, architecture, and report shape. The live pipeline remains in the code for deeper technical review.

## Live Pipeline

To run the real async pipeline, configure:

```env
KV_REST_API_URL=
KV_REST_API_TOKEN=
QSTASH_TOKEN=
QSTASH_CURRENT_SIGNING_KEY=
QSTASH_NEXT_SIGNING_KEY=
ANTHROPIC_API_KEY=
GROQ_API_KEY=
FOLDEX_DEMO_MODE=0
```

The production live path uses Vercel Functions, Upstash-compatible job storage, and QStash callbacks to run stages without holding one request open.

## Vercel Fit

This project fits the Vercel Hobby plan for a resume demo:

- Static app pages plus three small API routes.
- No large uploaded static assets in the deployed source.
- Demo mode avoids long-running ESMFold and LLM calls.
- Live mode caps work into stages and currently models only one similar structure.

For live public usage, keep QStash/Redis and AI/external API quotas in mind. Those are the real limit before the Next.js app itself.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Run checks:

```bash
npm test
npm run build
```

## Deploy

1. Import the repo into Vercel as a Next.js project.
2. Use the default build command: `npm run build`.
3. For the resume demo, set:

```env
FOLDEX_DEMO_MODE=1
```

4. Deploy.

The Vercel CLI installed on this machine is outdated. Upgrade before CLI deploys:

```bash
npm i -g vercel@latest
```

## Tech Stack

- Next.js App Router
- React 19
- TypeScript
- Vercel Functions
- 3Dmol.js
- jsPDF
- Vitest
- Optional: Upstash QStash, Redis-compatible KV, Anthropic, Groq, Ensembl VEP, ClinVar, gnomAD, UniProt, ESMFold

## Design Notes

- Product judgment: demo mode keeps the public link reliable while the live architecture remains visible.
- Backend design: staged jobs separate slow scientific calls from the user-facing request.
- AI safety: report prompts and fallback output explicitly avoid diagnosis, treatment advice, and invented evidence.
- UX: the first screen explains the purpose without assuming genetics expertise.
- Engineering hygiene: TypeScript, tests for parsing, production build passing, and a deploy path that matches Vercel.

## Useful Inputs

Try:

```text
BRCA1 p.Arg1699Gln
TP53 p.Arg175His
KRAS p.Gly12Asp
```

## License

Hackathon prototype. Add a license before broader public reuse.
