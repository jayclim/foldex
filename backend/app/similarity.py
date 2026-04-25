async def find_similar_variants(normalized_variant: dict, annotations: dict) -> list[dict]:
    """Find and rank biologically similar known variants.

    Contributor task:
    - Gather candidates from ClinVar, UniProt, nearby residues, same domains, and literature.
    - Compute similarity score in code.
    - Let Claude explain ranked candidates only after code selects them.
    """
    del normalized_variant, annotations
    return []
