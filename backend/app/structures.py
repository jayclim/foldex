import os
from typing import Any

import httpx


ESMFOLD_URL = "https://api.esmatlas.com/foldSequence/v1/pdb/"


async def structure(variant: dict[str, Any]) -> dict[str, Any]:
    """Takes in a variant and returns 3D structure data for that variant

    Contributor task:
    - Generate a 3D structure for the variant using ESMFold API
    """
    sequence = (
        variant.get("mutant_sequence")
        or variant.get("sequence")
        or variant.get("wild_type_sequence")
        or ""
    )
    mutation = variant.get("mutation") or variant
    label = variant.get("label") or variant.get("name") or mutation.get("protein_hgvs") or "variant"
    warnings = []

    if not sequence:
        warnings.append("No amino acid sequence was available for ESMFold.")
        return {
            "label": label,
            "source": "none",
            "sequence": sequence,
            "mutation": mutation,
            "pdb": None,
            "viewer": _viewer_payload(None),
            "warnings": warnings,
        }

    pdb_text = None
    source = "esmfold"
    if _live_apis_enabled():
        try:
            pdb_text = await _fold_with_esmfold(sequence)
            source = "esmfold"
        except Exception as exc:  # noqa: BLE001 - keep analysis jobs resilient.
            warnings.append(f"ESMFold request failed: {exc}")
            source = "esmfold_error"
    else:
        source = "esmfold_disabled"
        warnings.append("Live APIs are disabled by FOLDEX_DISABLE_LIVE_APIS=1.")

    return {
        "label": label,
        "source": source,
        "sequence": sequence,
        "sequence_length": len(sequence),
        "mutation": mutation,
        "pdb": pdb_text,
        "viewer": _viewer_payload(pdb_text),
        "warnings": warnings,
    }


async def structures_for_report(
    unknown_variant: dict[str, Any],
    similar_variants: list[dict[str, Any]],
    annotations: dict[str, Any],
) -> dict[str, Any]:
    wild_type_sequence = annotations.get("uniprot", {}).get("sequence")
    unknown_structure = annotations.get("structures", {}).get("unknown_variant")
    wild_type_structure = await structure(
        {
            "label": f"{unknown_variant.get('gene') or 'Gene'} wild type",
            "sequence": wild_type_sequence,
            "mutation": {"kind": "wild_type"},
        }
    )
    similar_structures = []

    for similar_variant in similar_variants[:10]:
        similar_structures.append(
            {
                "variant": similar_variant,
                "structure": await structure(
                    {
                        "label": similar_variant.get("name"),
                        "sequence": similar_variant.get("mutant_sequence") or wild_type_sequence,
                        "mutation": similar_variant,
                    }
                ),
            }
        )

    return {
        "wild_type": wild_type_structure,
        "unknown_variant": unknown_structure,
        "similar_variants": similar_structures,
    }


def mutate_sequence(sequence: str, mutation: dict[str, Any]) -> tuple[str, list[str]]:
    warnings = []
    if not sequence:
        return "", ["Cannot create mutant sequence because wild-type sequence is missing."]

    position = mutation.get("protein_position")
    reference_aa = mutation.get("reference_aa")
    alternate_aa = mutation.get("alternate_aa")

    if not isinstance(position, int) or not reference_aa or not alternate_aa:
        return sequence, ["Protein substitution was not specific enough to mutate the sequence."]

    index = position - 1
    if index < 0 or index >= len(sequence):
        return sequence, [f"Protein position {position} is outside the available sequence."]

    observed = sequence[index]
    if observed != reference_aa:
        warnings.append(
            f"Wild-type sequence has {observed} at protein position {position}, not {reference_aa}."
        )

    return f"{sequence[:index]}{alternate_aa}{sequence[index + 1:]}", warnings


async def _fold_with_esmfold(sequence: str) -> str:
    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.post(ESMFOLD_URL, content=sequence)
        response.raise_for_status()
        return response.text


def _live_apis_enabled() -> bool:
    return os.getenv("FOLDEX_DISABLE_LIVE_APIS", "").lower() not in {"1", "true", "yes"}


def _viewer_payload(pdb_text: str | None) -> dict[str, Any]:
    return {
        "format": "pdb",
        "data": pdb_text,
        "recommended_viewer": "3Dmol.js",
        "available": bool(pdb_text),
    }
