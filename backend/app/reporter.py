async def generate_report(
    normalized_variant: dict,
    annotations: dict,
    similar_variants: list[dict],
    structures: dict,
) -> dict:
    """Generate final report content.

    Contributor task:
    - Use Claude with strict instructions to only use structured evidence.
    - Return markdown plus structured JSON for frontend rendering.
    """
    return {
        "markdown": "\n".join(
            [
                "# Variant Research Report",
                "",
                "Report generation is not implemented yet.",
                "",
                "This is research support only and is not medical advice, diagnosis, or treatment guidance.",
            ]
        ),
        "json": {
            "variant": normalized_variant,
            "annotations_present": list(annotations.keys()),
            "similar_variant_count": len(similar_variants),
            "structure_sections": list(structures.keys()),
            "status": "report_pending",
        },
    }
