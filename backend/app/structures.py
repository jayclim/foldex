async def prepare_structures(
    normalized_variant: dict,
    similar_variants: list[dict],
    annotations: dict,
) -> dict:
    """Prepare 3D structure artifacts for the frontend viewer.

    Contributor task:
    - Fetch wild-type AlphaFold DB structure by UniProt ID.
    - For MVP, highlight the mutated residue on wild type.
    - Later, add async mutant/similar-variant model generation.
    """
    del normalized_variant, similar_variants

    uniprot = annotations.get("uniprot") or {}
    uniprot_id = uniprot.get("id") if isinstance(uniprot, dict) else None

    return {
        "wild_type": {
            "source": "AlphaFold DB",
            "uniprot_id": uniprot_id,
            "structure_url": None,
            "notes": ["Structure fetch not implemented yet."],
        },
        "mutant": None,
        "similar_variants": [],
    }
