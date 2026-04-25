import json
import logging
import os
from pathlib import Path
from typing import Any

import httpx

logger = logging.getLogger(__name__)


async def generate_report(
    variant: dict[str, Any],
    annotations: dict[str, Any],
    similar_variants: list[dict[str, Any]],
    structures: dict[str, Any],
) -> dict[str, Any]:
    """Generate final report content.

    Contributor task:
    - Use Claude with strict instructions to only use structured evidence.
    - Return markdown plus structured JSON for frontend rendering.
    """
    evidence = _structured_evidence(variant, annotations, similar_variants)
    ai_markdown = await _claude_report(evidence) or await _groq_report(evidence)
    markdown = ai_markdown or _fallback_markdown(evidence, structures)

    patient_summary = (
        await _claude_patient_summary(markdown, evidence)
        or await _groq_patient_summary(markdown, evidence)
        or _fallback_patient_summary(evidence)
    )

    return {
        "markdown": markdown,
        "patient_summary": patient_summary,
        "json": {
            "status": "complete",
            "variant": evidence["variant"],
            "classification_summary": evidence["classification_summary"],
            "wild_type": evidence["wild_type"],
            "unknown_variant": evidence["unknown_variant"],
            "similar_variants": evidence["similar_variants"],
            "structures": structures,
            "warnings": evidence["warnings"],
            "disclaimer": (
                "Research support only. This is not medical advice, diagnosis, or treatment guidance."
            ),
        },
    }


def _structured_evidence(
    variant: dict[str, Any],
    annotations: dict[str, Any],
    similar_variants: list[dict[str, Any]],
) -> dict[str, Any]:
    parsed_variant = annotations.get("variant") or variant
    features = annotations.get("features") or {}
    alpha = annotations.get("alpha_missense") or {}
    clinvar_records = annotations.get("clinvar", {}).get("records") or []
    warnings = []
    warnings.extend(annotations.get("warnings") or [])
    warnings.extend(features.get("warnings") or [])

    return {
        "variant": parsed_variant,
        "classification_summary": {
            "alpha_missense": alpha,
            "clinvar": clinvar_records[:5],
            "gnomad": annotations.get("gnomad"),
            "overall_interpretation": _overall_interpretation(alpha, clinvar_records),
        },
        "wild_type": {
            "gene": parsed_variant.get("gene"),
            "protein": annotations.get("uniprot", {}).get("protein_name"),
            "uniprot": annotations.get("uniprot"),
            "sequence_length": annotations.get("uniprot", {}).get("length"),
            "description": _wild_type_description(annotations),
        },
        "unknown_variant": {
            "display_name": parsed_variant.get("display_name"),
            "mutation": parsed_variant.get("mutation"),
            "features": features,
            "description": _unknown_variant_description(parsed_variant, features),
        },
        "similar_variants": [
            {
                "name": item.get("name"),
                "source": item.get("source"),
                "similarity_score": item.get("similarity_score"),
                "similarity_reasons": item.get("similarity_reasons"),
                "clinical_significance": item.get("clinical_significance"),
                "description": item.get("description"),
            }
            for item in similar_variants
        ],
        "warnings": warnings,
    }


async def _claude_report(evidence: dict[str, Any]) -> str | None:
    api_key = _env_value("ANTHROPIC_API_KEY")
    if not api_key:
        return None
    try:
        import anthropic

        print(">>> Calling Claude API for report generation...", flush=True)
        client = anthropic.AsyncAnthropic(api_key=api_key)
        message = await client.messages.create(
            model=os.getenv("FOLDEX_CLAUDE_MODEL", "claude-sonnet-4-20250514"),
            max_tokens=1800,
            temperature=0,
            messages=[
                {
                    "role": "user",
                    "content": (
                        "Generate a concise variant research report in markdown using only the "
                        "structured evidence below. Do not invent symptoms, diagnoses, population "
                        "frequencies, pathogenicity, papers, or structures. If evidence is missing, "
                        "say it is missing. Include sections for classification, wild type, unknown "
                        "variant features, similar variants, likely behavior/expression based only on "
                        "similar known variants, 3D structures, and research-only disclaimer.\n\n"
                        f"{json.dumps({k: v for k, v in evidence.items() if k != 'structures'}, indent=2)}"
                    ),
                }
            ],
        )
        return "".join(block.text for block in message.content if hasattr(block, "text"))
    except Exception as e:
        print(f">>> Claude API failed: {e}", flush=True)
        return None


_PATIENT_SUMMARY_INSTRUCTIONS = (
    "Rewrite the variant report below as a short plain-language explanation for the patient. "
    "Use only facts already present in the report — do not introduce new findings, statistics, "
    "citations, or recommendations. Audience is a non-scientist adult with no genetics background.\n\n"
    "Requirements:\n"
    "- 120-180 words, in markdown.\n"
    "- Start with a one-sentence plain-language description of what the variant is.\n"
    "- Use 3 short sections with these exact headings:\n"
    "  **What we found**, **What this means**, **What to do next**.\n"
    "- Translate jargon (e.g. 'missense', 'pathogenic', 'allele frequency'). No abbreviations "
    "without an inline definition. No raw scores or p-values.\n"
    "- Preserve uncertainty honestly: if the report says evidence is missing, conflicting, or "
    "uncertain, say so plainly. Do not reassure beyond the evidence.\n"
    "- Under 'What to do next', the only recommendation is to discuss the report with their "
    "clinician or genetic counselor. Do not suggest treatments, lifestyle changes, or tests.\n"
    "- End with this exact line on its own:\n"
    "  *This summary is for research support only and is not medical advice. Please review it "
    "with a qualified clinician or genetic counselor.*\n"
)


def _patient_summary_prompt(report_markdown: str, evidence: dict[str, Any]) -> str:
    variant = evidence.get("variant") or {}
    context = {
        "display_name": variant.get("display_name"),
        "gene": variant.get("gene"),
        "overall_interpretation": (evidence.get("classification_summary") or {}).get(
            "overall_interpretation"
        ),
    }
    return (
        f"{_PATIENT_SUMMARY_INSTRUCTIONS}\n"
        f"Variant context (for grounding only, do not quote verbatim):\n"
        f"{json.dumps(context, indent=2)}\n\n"
        f"Full report markdown:\n---\n{report_markdown}\n---"
    )


async def _claude_patient_summary(
    report_markdown: str, evidence: dict[str, Any]
) -> str | None:
    api_key = _env_value("ANTHROPIC_API_KEY")
    if not api_key or not report_markdown:
        return None
    try:
        import anthropic

        print(">>> Calling Claude API for patient summary...", flush=True)
        client = anthropic.AsyncAnthropic(api_key=api_key)
        message = await client.messages.create(
            model=os.getenv("FOLDEX_CLAUDE_MODEL", "claude-sonnet-4-20250514"),
            max_tokens=600,
            temperature=0,
            messages=[
                {
                    "role": "user",
                    "content": _patient_summary_prompt(report_markdown, evidence),
                }
            ],
        )
        text = "".join(block.text for block in message.content if hasattr(block, "text"))
        return text.strip() or None
    except Exception as e:
        print(f">>> Claude patient summary failed: {e}", flush=True)
        return None


async def _groq_patient_summary(
    report_markdown: str, evidence: dict[str, Any]
) -> str | None:
    api_key = _env_value("GROQ_API_KEY")
    if not api_key or not report_markdown:
        return None

    url = _env_value("FOLDEX_GROQ_URL") or "https://api.groq.com/openai/v1/chat/completions"
    model = _env_value("FOLDEX_GROQ_MODEL") or "llama-3.3-70b-versatile"
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                url,
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": model,
                    "messages": [
                        {
                            "role": "user",
                            "content": _patient_summary_prompt(report_markdown, evidence),
                        }
                    ],
                    "temperature": 0,
                },
            )
            response.raise_for_status()
            data = response.json()
            choices = data.get("choices") or []
            if not choices:
                return None
            text = choices[0].get("message", {}).get("content") or ""
            return text.strip() or None
    except Exception as e:
        print(f">>> Groq patient summary failed: {e}", flush=True)
        return None


def _fallback_patient_summary(evidence: dict[str, Any]) -> str:
    variant = evidence.get("variant") or {}
    summary = evidence.get("classification_summary") or {}
    name = variant.get("display_name") or variant.get("gene") or "this variant"
    interpretation = summary.get("overall_interpretation") or (
        "The available evidence is limited, so the effect of this change is uncertain."
    )
    return (
        "**What we found**\n\n"
        f"Your test identified a change in your DNA called {name}. A 'variant' simply means a "
        "spelling difference in a gene compared with the typical reference.\n\n"
        "**What this means**\n\n"
        f"{interpretation} In plain terms, scientists do not yet have enough information to say "
        "with confidence whether this change affects your health.\n\n"
        "**What to do next**\n\n"
        "Please share this report with your clinician or a genetic counselor. They can put it in "
        "the context of your personal and family history and help you decide on next steps.\n\n"
        "*This summary is for research support only and is not medical advice. Please review it "
        "with a qualified clinician or genetic counselor.*"
    )


async def _groq_report(evidence: dict[str, Any]) -> str | None:
    api_key = _env_value("GROQ_API_KEY")
    if not api_key:
        return None

    url = _env_value("FOLDEX_GROQ_URL") or "https://api.groq.com/openai/v1/chat/completions"
    model = _env_value("FOLDEX_GROQ_MODEL") or "llama-3.3-70b-versatile"
    groq_evidence = {key: value for key, value in evidence.items() if key != "structures"}
    prompt = (
        "Generate a concise variant research report in markdown using only the structured "
        "evidence below. Do not invent symptoms, diagnoses, population frequencies, "
        "pathogenicity, papers, or structures. If evidence is missing, say it is missing. "
        "Include sections for classification, wild type, unknown variant features, similar "
        "variants, likely behavior/expression based only on similar known variants, 3D "
        "structures, and research-only disclaimer.\n\n"
        f"{json.dumps(groq_evidence, indent=2)}"
    )
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                url,
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0,
                },
            )
            response.raise_for_status()
            data = response.json()
            choices = data.get("choices") or []
            if not choices:
                return None
            return choices[0].get("message", {}).get("content")
    except Exception as e:
        print(f">>> Groq API failed: {e}", flush=True)
        return None


def _env_value(name: str) -> str | None:
    value = os.getenv(name)
    if value:
        return value

    env_path = Path(__file__).resolve().parents[1] / ".env"
    if not env_path.exists():
        return None

    for line in env_path.read_text().splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, raw_value = stripped.split("=", 1)
        if key.strip() == name:
            return raw_value.strip().strip('"').strip("'")
    return None


def _fallback_markdown(evidence: dict[str, Any], structures: dict[str, Any]) -> str:
    variant = evidence["variant"]
    summary = evidence["classification_summary"]
    unknown = evidence["unknown_variant"]
    wild_type = evidence["wild_type"]
    similar = evidence["similar_variants"]
    warnings = evidence["warnings"]

    lines = [
        "# Variant Research Report",
        "",
        f"## Variant",
        f"- Input: {variant.get('input_text')}",
        f"- Parsed variant: {variant.get('display_name')}",
        f"- Gene: {variant.get('gene') or 'unknown'}",
        "",
        "## Benign / Pathogenic Evidence",
        f"- Overall interpretation: {summary['overall_interpretation']}",
        f"- AlphaMissense status: {summary.get('alpha_missense', {}).get('status')}",
        f"- ClinVar records found: {len(summary.get('clinvar') or [])}",
        f"- Population frequency: {summary.get('gnomad', {}).get('population_frequency')}",
        "",
        "## Wild Type",
        f"- Protein: {wild_type.get('protein') or 'unknown'}",
        f"- Sequence length: {wild_type.get('sequence_length') or 'unknown'}",
        f"- Description: {wild_type.get('description')}",
        "",
        "## Unknown Variant Features",
        f"- Description: {unknown.get('description')}",
        f"- Mutation features: {json.dumps(unknown.get('features', {}).get('mutation'), default=str)}",
        "",
        "## Similar Known Variants",
    ]
    if similar:
        for item in similar:
            lines.append(
                f"- {item.get('name')}: score {item.get('similarity_score')} "
                f"({'; '.join(item.get('similarity_reasons') or [])}). "
                f"{item.get('description')}"
            )
    else:
        lines.append("- No similar variants were found from the available evidence.")

    lines.extend(
        [
            "",
            "## Likely Behavior / Expression",
            _behavior_summary(similar),
            "",
            "## 3D Structures",
            f"- Wild type model available: {structures.get('wild_type', {}).get('viewer', {}).get('available')}",
            f"- Unknown variant model available: {structures.get('unknown_variant', {}).get('viewer', {}).get('available')}",
            f"- Similar variant models: {len(structures.get('similar_variants') or [])}",
            "",
            "## Warnings",
        ]
    )
    lines.extend([f"- {warning}" for warning in warnings] or ["- None"])
    lines.extend(
        [
            "",
            "Research support only. This is not medical advice, diagnosis, or treatment guidance.",
        ]
    )
    return "\n".join(lines)


def _overall_interpretation(alpha: dict[str, Any], clinvar_records: list[dict[str, Any]]) -> str:
    clinvar_labels = " ".join(
        (record.get("clinical_significance") or "").lower() for record in clinvar_records
    )
    if "pathogenic" in clinvar_labels and "benign" not in clinvar_labels:
        return "Known ClinVar evidence includes pathogenic assertions."
    if "benign" in clinvar_labels and "pathogenic" not in clinvar_labels:
        return "Known ClinVar evidence includes benign assertions."
    predictions = alpha.get("predictions") or []
    if predictions:
        return "AlphaMissense predictions are available and should be reviewed with ClinVar and frequency evidence."
    return "Insufficient evidence for benign/pathogenic classification."


def _wild_type_description(annotations: dict[str, Any]) -> str:
    uniprot = annotations.get("uniprot") or {}
    functions = uniprot.get("function") or []
    if functions:
        return functions[0]
    return "Wild-type function was not available from the current evidence."


def _unknown_variant_description(variant: dict[str, Any], features: dict[str, Any]) -> str:
    mutation = variant.get("mutation") or {}
    feature_mutation = features.get("mutation") or {}
    pieces = [
        f"Substitution {mutation.get('protein_hgvs')}" if mutation.get("protein_hgvs") else None,
        f"at protein position {mutation.get('protein_position')}"
        if mutation.get("protein_position")
        else None,
        f"changes amino-acid class: {feature_mutation.get('class_change')}"
        if feature_mutation.get("class_change") is not None
        else None,
        f"hydropathy delta {feature_mutation.get('hydropathy_delta')}"
        if feature_mutation.get("hydropathy_delta") is not None
        else None,
    ]
    return "; ".join(piece for piece in pieces if piece) or "Variant features are incomplete."


def _behavior_summary(similar_variants: list[dict[str, Any]]) -> str:
    known = [item for item in similar_variants if item.get("source") == "ClinVar"]
    if not known:
        return (
            "No known similar variants with clinical assertions were available, so behavior or "
            "expression should not be inferred beyond the measured features."
        )
    labels = ", ".join(item.get("clinical_significance") or "unknown" for item in known[:5])
    return f"Closest known variant assertions include: {labels}. Interpret cautiously with the ranked evidence."
