async def parse_variant_input(text: str) -> dict:
    """Parse raw user input into a rough variant object.

    Contributor task:
    - Use Claude for messy lab-report text.
    - Add PDF extraction later if needed.
    - Return structured fields like gene, transcript, hgvs_c, hgvs_p, build, chrom, pos, ref, alt.
    """
    return {
        "raw_text": text,
        "gene": None,
        "transcript": None,
        "hgvs_c": None,
        "hgvs_p": None,
        "genome_build": "GRCh38",
        "chrom": None,
        "pos": None,
        "ref": None,
        "alt": None,
        "notes": ["Parser not implemented yet."],
    }
