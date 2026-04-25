async def annotate_variant(normalized_variant: dict) -> dict:
    """Fetch variant annotations from external genomics sources.

    Contributor task:
    - Ensembl VEP with AlphaMissense enabled.
    - ClinVar assertions.
    - gnomAD population frequency.
    - UniProt wild-type sequence, domains, and metadata.
    """
    return {
        "vep": None,
        "alpha_missense": None,
        "clinvar": None,
        "gnomad": None,
        "uniprot": None,
        "warnings": ["Annotation APIs not implemented yet."],
    }
