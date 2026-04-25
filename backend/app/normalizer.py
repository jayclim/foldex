async def normalize_variant(parsed_variant: dict) -> dict:
    """Validate and normalize the parsed variant.

    Contributor task:
    - Call Mutalyzer or VariantValidator.
    - Resolve transcript and genome coordinates.
    - Keep this module focused on format validation, not interpretation.
    """
    normalized = parsed_variant.copy()
    normalized["normalization_status"] = "pending"
    return normalized
