import os
import re
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx


SIMILAR_AA = {
    "A": ["V", "G", "S"],
    "R": ["K", "H", "Q"],
    "N": ["D", "Q", "S"],
    "D": ["E", "N", "G"],
    "C": ["S", "A", "G"],
    "Q": ["N", "E", "R"],
    "E": ["D", "Q", "K"],
    "G": ["A", "S", "D"],
    "H": ["R", "K", "Q"],
    "I": ["L", "V", "M"],
    "L": ["I", "V", "M"],
    "K": ["R", "H", "E"],
    "M": ["L", "I", "V"],
    "F": ["Y", "W", "L"],
    "P": ["A", "S", "T"],
    "S": ["T", "A", "N"],
    "T": ["S", "A", "V"],
    "W": ["F", "Y", "L"],
    "Y": ["F", "W", "H"],
    "V": ["I", "L", "A"],
}

AA_THREE_TO_ONE = {
    "Ala": "A",
    "Arg": "R",
    "Asn": "N",
    "Asp": "D",
    "Cys": "C",
    "Gln": "Q",
    "Glu": "E",
    "Gly": "G",
    "His": "H",
    "Ile": "I",
    "Leu": "L",
    "Lys": "K",
    "Met": "M",
    "Phe": "F",
    "Pro": "P",
    "Ser": "S",
    "Thr": "T",
    "Trp": "W",
    "Tyr": "Y",
    "Val": "V",
    "Ter": "*",
}

VARIANT_PATTERN = re.compile(
    r"\bp\.([A-Z][a-z]{2}|[A-Z])(\d{1,5})([A-Z][a-z]{2}|Ter|\*|[A-Z])\b"
)


async def find_similar_variants(variant: dict[str, Any], annotations: dict[str, Any]) -> list[dict[str, Any]]:
    """Find and rank biologically similar known variants.

    Contributor task:
    - Gather known variant candidates from ClinVar, NCBI, research, etc.
    - Compute similarity scores based on the features of our variant in annotations
    and each of the known gathered variant candidates which should have descriptions of their
    respective 3D protein structures. (TBD exact metrics, could be a
    weighted combination of multiple features)
    - Let Claude explain ranked candidates only after code selects them in above,
    don't let Claude guess. Return a list of the top 5-10 most similar variants with their scores and
    descriptions from the papers and whatever.
    """
    parsed_variant = annotations.get("variant") or variant
    candidates = []
    candidates.extend(_exact_clinvar_candidates(parsed_variant, annotations))

    if _live_apis_enabled():
        literature_records = await _search_literature(parsed_variant)
        candidates.extend(_literature_candidates(parsed_variant, literature_records))
        candidates.extend(await _gene_clinvar_candidates(parsed_variant))

    scored = [_score_candidate(candidate, parsed_variant, annotations) for candidate in candidates]
    deduped = _dedupe_candidates(scored)
    deduped.sort(key=lambda item: item["similarity_score"], reverse=True)
    return deduped[:10]


def _exact_clinvar_candidates(
    parsed_variant: dict[str, Any], annotations: dict[str, Any]
) -> list[dict[str, Any]]:
    candidates = []
    for record in annotations.get("clinvar", {}).get("records") or []:
        candidates.append(
            {
                "name": record.get("title") or f"{parsed_variant.get('gene')} known ClinVar variant",
                "gene": parsed_variant.get("gene"),
                "source": "ClinVar exact/near query",
                "clinical_significance": record.get("clinical_significance"),
                "review_status": record.get("review_status"),
                "description": _clinvar_description(record),
                "mutation": parsed_variant.get("mutation") or {},
                "protein_position": (parsed_variant.get("mutation") or {}).get("protein_position"),
                "alternate_aa": (parsed_variant.get("mutation") or {}).get("alternate_aa"),
                "mutant_sequence": parsed_variant.get("mutant_sequence"),
                "evidence": record,
            }
        )
    return candidates


async def _gene_clinvar_candidates(parsed_variant: dict[str, Any]) -> list[dict[str, Any]]:
    gene = parsed_variant.get("gene")
    if not gene:
        return []

    query = f"{gene}[Gene Name] AND missense"
    try:
        search = await _get_json(
            "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi",
            params={"db": "clinvar", "term": query, "retmode": "json", "retmax": 25},
        )
        ids = search.get("esearchresult", {}).get("idlist", [])
        if not ids:
            return []
        summary = await _get_json(
            "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi",
            params={"db": "clinvar", "id": ",".join(ids), "retmode": "json"},
        )
    except Exception:  # noqa: BLE001 - similarity can continue with other sources.
        return []

    candidates = []
    for record_id in ids:
        record = summary.get("result", {}).get(record_id)
        if not record:
            continue
        title = record.get("title") or ""
        variant_mentions = _extract_variant_mentions(title)
        mutation = variant_mentions[0] if variant_mentions else {}
        candidates.append(
            {
                "name": title or f"{gene} ClinVar variant",
                "gene": gene,
                "source": "ClinVar gene search",
                "clinical_significance": record.get("clinical_significance", {}).get("description"),
                "review_status": record.get("clinical_significance", {}).get("review_status"),
                "description": _clinvar_description(
                    {
                        "title": title,
                        "clinical_significance": record.get("clinical_significance", {}).get("description"),
                        "review_status": record.get("clinical_significance", {}).get("review_status"),
                    }
                ),
                "mutation": mutation,
                "protein_position": mutation.get("protein_position"),
                "alternate_aa": mutation.get("alternate_aa"),
                "evidence": {
                    "uid": record.get("uid"),
                    "variation_id": record.get("variation_id"),
                    "title": title,
                    "source_url": f"https://www.ncbi.nlm.nih.gov/clinvar/variation/{record.get('variation_id')}/"
                    if record.get("variation_id")
                    else None,
                },
            }
        )
    return candidates


async def _search_literature(parsed_variant: dict[str, Any]) -> list[dict[str, Any]]:
    records = []
    records.extend(await _search_pubmed(parsed_variant))
    records.extend(await _search_preprints(parsed_variant, "biorxiv"))
    records.extend(await _search_preprints(parsed_variant, "medrxiv"))
    return records


async def _search_pubmed(parsed_variant: dict[str, Any]) -> list[dict[str, Any]]:
    gene = parsed_variant.get("gene")
    if not gene:
        return []
    query = f'({gene}[Title/Abstract]) AND (variant OR mutation OR missense OR pathogenic)'
    try:
        search = await _get_json(
            "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi",
            params={
                "db": "pubmed",
                "term": query,
                "retmode": "json",
                "retmax": 25,
                "sort": "pub date",
            },
        )
        ids = search.get("esearchresult", {}).get("idlist", [])
        if not ids:
            return []
        summary = await _get_json(
            "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi",
            params={"db": "pubmed", "id": ",".join(ids), "retmode": "json"},
        )
    except Exception:  # noqa: BLE001
        return []

    records = []
    for pubmed_id in ids:
        record = summary.get("result", {}).get(pubmed_id)
        if not record:
            continue
        title = record.get("title") or ""
        records.append(
            {
                "source": "PubMed",
                "title": title,
                "abstract": "",
                "date": record.get("pubdate"),
                "journal": record.get("fulljournalname"),
                "authors": [author.get("name") for author in record.get("authors", [])[:6]],
                "url": f"https://pubmed.ncbi.nlm.nih.gov/{pubmed_id}/",
                "id": pubmed_id,
            }
        )
    return records


async def _search_preprints(parsed_variant: dict[str, Any], server: str) -> list[dict[str, Any]]:
    gene = parsed_variant.get("gene")
    if not gene:
        return []

    end = datetime.now(UTC).date()
    start = end - timedelta(days=int(os.getenv("FOLDEX_PREPRINT_LOOKBACK_DAYS", "730")))
    url = f"https://api.biorxiv.org/details/{server}/{start.isoformat()}/{end.isoformat()}/0/json"
    try:
        data = await _get_json(url)
    except Exception:  # noqa: BLE001
        return []

    records = []
    for item in data.get("collection") or []:
        text = f"{item.get('title') or ''} {item.get('abstract') or ''}"
        if gene.lower() not in text.lower():
            continue
        records.append(
            {
                "source": server,
                "title": item.get("title"),
                "abstract": item.get("abstract") or "",
                "date": item.get("date"),
                "journal": server,
                "authors": item.get("authors"),
                "url": f"https://doi.org/{item.get('doi')}" if item.get("doi") else None,
                "id": item.get("doi"),
            }
        )
        if len(records) >= 15:
            break
    return records


def _literature_candidates(
    parsed_variant: dict[str, Any], records: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    gene = parsed_variant.get("gene")
    candidates = []
    for record in records:
        text = f"{record.get('title') or ''} {record.get('abstract') or ''}"
        mentions = _extract_variant_mentions(text)
        if not mentions:
            candidates.append(
                {
                    "name": f"{gene} literature candidate",
                    "gene": gene,
                    "source": record.get("source"),
                    "description": _literature_description(record),
                    "clinical_significance": None,
                    "review_status": "literature",
                    "mutation": {},
                    "protein_position": None,
                    "alternate_aa": None,
                    "evidence": record,
                }
            )
            continue
        for mention in mentions[:3]:
            candidates.append(
                {
                    "name": f"{gene} {mention.get('protein_hgvs')}",
                    "gene": gene,
                    "source": record.get("source"),
                    "description": _literature_description(record),
                    "clinical_significance": None,
                    "review_status": "literature",
                    "mutation": mention,
                    "protein_position": mention.get("protein_position"),
                    "alternate_aa": mention.get("alternate_aa"),
                    "evidence": record,
                }
            )
    return candidates


def _score_candidate(
    candidate: dict[str, Any],
    parsed_variant: dict[str, Any],
    annotations: dict[str, Any],
) -> dict[str, Any]:
    mutation = parsed_variant.get("mutation") or {}
    feature_mutation = annotations.get("features", {}).get("mutation", {})
    input_position = mutation.get("protein_position")
    candidate_position = candidate.get("protein_position")

    score = 0.0
    reasons = []
    if candidate.get("gene") and candidate.get("gene") == parsed_variant.get("gene"):
        score += 0.2
        reasons.append("same gene")
    if input_position and candidate_position:
        distance = abs(input_position - candidate_position)
        residue_score = max(0.0, 1.0 - min(distance, 200) / 200)
        score += 0.25 * residue_score
        reasons.append(f"protein positions differ by {distance} residues")
    elif candidate.get("source") in {"PubMed", "biorxiv", "medrxiv"}:
        score += 0.08
        reasons.append("same-gene literature record without extractable protein position")
    if candidate.get("alternate_aa") == mutation.get("alternate_aa"):
        score += 0.12
        reasons.append("same alternate amino acid")
    elif candidate.get("alternate_aa") in SIMILAR_AA.get(mutation.get("alternate_aa"), []):
        score += 0.1
        reasons.append("chemically similar alternate amino acid")
    if "ClinVar" in str(candidate.get("source")):
        score += 0.18
        reasons.append("known ClinVar record")
    if candidate.get("source") == "PubMed":
        score += 0.15
        reasons.append("candidate found in NCBI PubMed literature")
    if candidate.get("source") in {"biorxiv", "medrxiv"}:
        score += 0.12
        reasons.append("candidate found in recent preprint literature")
    if feature_mutation.get("class_change"):
        score += 0.04
        reasons.append("input mutation changes amino-acid class")

    candidate["similarity_score"] = round(min(score, 1.0), 3)
    candidate["similarity_reasons"] = reasons
    return candidate


def _extract_variant_mentions(text: str) -> list[dict[str, Any]]:
    mentions = []
    for match in VARIANT_PATTERN.finditer(text or ""):
        ref, position, alt = match.groups()
        ref_aa = AA_THREE_TO_ONE.get(ref, ref if len(ref) == 1 else None)
        alt_aa = AA_THREE_TO_ONE.get(alt, alt if len(alt) == 1 else None)
        mentions.append(
            {
                "protein_hgvs": f"p.{ref}{position}{alt}",
                "reference_aa": ref_aa,
                "alternate_aa": alt_aa,
                "protein_position": int(position),
            }
        )
    return mentions


def _dedupe_candidates(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped = {}
    for candidate in candidates:
        mutation = candidate.get("mutation") or {}
        key = (
            candidate.get("gene"),
            mutation.get("protein_hgvs") or candidate.get("name"),
            candidate.get("source"),
        )
        existing = deduped.get(key)
        if not existing or candidate.get("similarity_score", 0) > existing.get("similarity_score", 0):
            deduped[key] = candidate
    return list(deduped.values())


async def _get_json(url: str, **kwargs: Any) -> Any:
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(url, **kwargs)
        response.raise_for_status()
        return response.json()


def _clinvar_description(record: dict[str, Any]) -> str:
    pieces = [
        record.get("title"),
        f"Clinical significance: {record.get('clinical_significance')}"
        if record.get("clinical_significance")
        else None,
        f"Review status: {record.get('review_status')}" if record.get("review_status") else None,
    ]
    return ". ".join(piece for piece in pieces if piece)


def _literature_description(record: dict[str, Any]) -> str:
    pieces = [
        record.get("title"),
        f"Source: {record.get('source')}",
        f"Date: {record.get('date')}" if record.get("date") else None,
        f"URL: {record.get('url')}" if record.get("url") else None,
    ]
    return ". ".join(piece for piece in pieces if piece)


def _live_apis_enabled() -> bool:
    return os.getenv("FOLDEX_DISABLE_LIVE_APIS", "").lower() not in {"1", "true", "yes"}
