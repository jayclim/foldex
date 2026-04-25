import os
import re
from typing import Any

import httpx

from app.features import variant_features
from app.structures import mutate_sequence, structure


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


async def annotate_variant(variant: dict[str, Any]) -> dict[str, Any]:
    """Fetch variant annotations from external genomics sources and the protein features
    determined from the generated 3D structure by calling structures.py and features.py.

    Contributor task:
    - Ensembl VEP with AlphaMissense enabled.
    - ClinVar assertions on if it's already a known variant
    - gnomAD population frequency.
    - features using structures.py and features.py
    - UniProt wild-type sequence, domains, and metadata.
    """
    gene = str(variant.get("gene") or "").strip().upper()
    mutation_text = str(variant.get("mutation") or "").strip()
    warnings = []
    variant_record = _build_variant_record(gene, mutation_text)

    uniprot = await _fetch_uniprot(variant_record)
    warnings.extend(uniprot.pop("warnings", []))

    mutation = variant_record.get("mutation") or {}
    wild_type_sequence = uniprot.get("sequence") or ""
    mutant_sequence, mutation_warnings = mutate_sequence(wild_type_sequence, mutation)
    warnings.extend(mutation_warnings)

    variant_record["wild_type_sequence"] = wild_type_sequence
    variant_record["mutant_sequence"] = mutant_sequence
    variant_record["sequence"] = mutant_sequence or wild_type_sequence

    unknown_structure = await structure(
        {
            **variant_record,
            "label": variant_record.get("display_name"),
            "sequence": variant_record["sequence"],
            "mutation": mutation,
        }
    )
    features = await variant_features(unknown_structure)

    vep = await _fetch_vep(variant_record)
    clinvar = await _fetch_clinvar(variant_record)
    gnomad = await _fetch_gnomad(variant_record, vep)
    alpha_missense = _alpha_missense_from_vep(vep)

    for block in (vep, clinvar, gnomad):
        warnings.extend(block.get("warnings", []))

    return {
        "variant": variant_record,
        "vep": vep,
        "alpha_missense": alpha_missense,
        "clinvar": clinvar,
        "gnomad": gnomad,
        "uniprot": uniprot,
        "features": features,
        "structures": {
            "unknown_variant": unknown_structure,
        },
        "warnings": warnings,
    }


def _build_variant_record(gene: str, mutation_text: str) -> dict[str, Any]:
    mutation = _mutation_metadata(mutation_text)
    cdna_hgvs = mutation.get("cdna_hgvs")
    protein_hgvs = mutation.get("protein_hgvs")
    display_name = " ".join(part for part in [gene, mutation_text] if part)

    return {
        "gene": gene,
        "mutation_text": mutation_text,
        "input_text": display_name,
        "display_name": display_name,
        "query_terms": [term for term in [gene, mutation_text, cdna_hgvs, protein_hgvs] if term],
        "mutation": mutation,
        "source": "frontend",
    }


def _mutation_metadata(mutation_text: str) -> dict[str, Any]:
    metadata: dict[str, Any] = {"submitted": mutation_text}
    cdna_match = re.search(r"\bc\.([0-9]+[ACGT]>[ACGT])\b", mutation_text, flags=re.IGNORECASE)
    protein_match = re.search(
        r"\bp\.([A-Z][a-z]{2})(\d+)([A-Z][a-z]{2}|Ter|\*)\b",
        mutation_text,
    )

    if cdna_match:
        metadata["cdna_hgvs"] = f"c.{cdna_match.group(1)}"
    if protein_match:
        ref_three, position, alt_three = protein_match.groups()
        metadata.update(
            {
                "protein_hgvs": f"p.{ref_three}{position}{alt_three}",
                "reference_aa": AA_THREE_TO_ONE.get(ref_three),
                "alternate_aa": AA_THREE_TO_ONE.get(alt_three),
                "protein_position": int(position),
            }
        )
    return metadata


async def _fetch_uniprot(variant_record: dict[str, Any]) -> dict[str, Any]:
    gene = variant_record.get("gene")
    if not gene:
        return {"status": "missing_gene", "warnings": ["No gene symbol was extracted for UniProt lookup."]}
    if not _live_apis_enabled():
        return {
            "status": "live_api_disabled",
            "gene": gene,
            "sequence": None,
            "warnings": ["Live APIs are disabled by FOLDEX_DISABLE_LIVE_APIS=1."],
        }

    query = f"gene_exact:{gene} AND organism_id:9606 AND reviewed:true"
    url = "https://rest.uniprot.org/uniprotkb/search"
    params = {
        "query": query,
        "fields": "accession,id,protein_name,gene_names,sequence,ft_domain,cc_function",
        "format": "json",
        "size": 1,
    }
    try:
        data = await _get_json(url, params=params)
        results = data.get("results") or []
        if not results:
            return {"status": "not_found", "gene": gene, "sequence": None, "warnings": []}
        entry = results[0]
        comments = entry.get("comments") or []
        return {
            "status": "ok",
            "gene": gene,
            "accession": entry.get("primaryAccession"),
            "entry_name": entry.get("uniProtkbId"),
            "protein_name": _recommended_protein_name(entry),
            "sequence": entry.get("sequence", {}).get("value"),
            "length": entry.get("sequence", {}).get("length"),
            "domains": _uniprot_features(entry, "Domain"),
            "function": _function_comments(comments),
            "warnings": [],
        }
    except Exception as exc:  # noqa: BLE001
        return {"status": "error", "gene": gene, "sequence": None, "warnings": [f"UniProt failed: {exc}"]}


async def _fetch_vep(variant_record: dict[str, Any]) -> dict[str, Any]:
    hgvs = _hgvs_query(variant_record)
    if not hgvs:
        return {"status": "missing_hgvs", "records": [], "warnings": ["No HGVS query was available for VEP."]}
    if not _live_apis_enabled():
        return {
            "status": "live_api_disabled",
            "query": hgvs,
            "records": [],
            "warnings": ["Live APIs are disabled by FOLDEX_DISABLE_LIVE_APIS=1."],
        }
    url = f"https://rest.ensembl.org/vep/human/hgvs/{hgvs}"
    try:
        data = await _get_json(url, params={"AlphaMissense": "1"}, headers={"Content-Type": "application/json"})
        return {"status": "ok", "query": hgvs, "records": data, "warnings": []}
    except Exception as exc:  # noqa: BLE001
        return {"status": "error", "query": hgvs, "records": [], "warnings": [f"VEP failed: {exc}"]}


async def _fetch_clinvar(variant_record: dict[str, Any]) -> dict[str, Any]:
    terms = variant_record.get("query_terms") or []
    if not terms:
        return {"status": "missing_terms", "records": [], "warnings": ["No query terms were available for ClinVar."]}
    if not _live_apis_enabled():
        return {
            "status": "live_api_disabled",
            "records": [],
            "warnings": ["Live APIs are disabled by FOLDEX_DISABLE_LIVE_APIS=1."],
        }
    query = " ".join(terms)
    try:
        search = await _get_json(
            "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi",
            params={"db": "clinvar", "term": query, "retmode": "json", "retmax": 10},
        )
        ids = search.get("esearchresult", {}).get("idlist", [])
        if not ids:
            return {"status": "not_found", "query": query, "records": [], "warnings": []}
        summary = await _get_json(
            "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi",
            params={"db": "clinvar", "id": ",".join(ids), "retmode": "json"},
        )
        records = [
            _clinvar_record(summary["result"][record_id])
            for record_id in ids
            if record_id in summary.get("result", {})
        ]
        return {"status": "ok", "query": query, "records": records, "warnings": []}
    except Exception as exc:  # noqa: BLE001
        return {"status": "error", "query": query, "records": [], "warnings": [f"ClinVar failed: {exc}"]}


async def _fetch_gnomad(variant_record: dict[str, Any], vep: dict[str, Any]) -> dict[str, Any]:
    frequencies = _population_frequencies_from_vep(vep)
    if frequencies:
        return {
            "status": "from_vep_colocated_variants",
            "source": "Ensembl VEP colocated variants",
            "population_frequency": frequencies[0],
            "all_frequencies": frequencies,
            "warnings": [],
        }

    return {
        "status": "not_implemented",
        "source": "gnomAD",
        "population_frequency": None,
        "warnings": [
            "gnomAD lookup needs genomic coordinates or rsID; current MVP records the placeholder explicitly."
        ],
    }


def _population_frequencies_from_vep(vep: dict[str, Any]) -> list[dict[str, Any]]:
    frequencies = []
    frequency_keys = {
        "gnomad_af",
        "gnomade_af",
        "gnomadg_af",
        "af",
        "afr_af",
        "amr_af",
        "eas_af",
        "eur_af",
        "sas_af",
    }
    for record in vep.get("records") or []:
        for colocated in record.get("colocated_variants") or []:
            found = {
                key: colocated.get(key)
                for key in frequency_keys
                if colocated.get(key) is not None
            }
            if found:
                frequencies.append(
                    {
                        "variant_id": colocated.get("id"),
                        "source": "VEP colocated variant",
                        "frequencies": found,
                    }
                )
    return frequencies


def _alpha_missense_from_vep(vep: dict[str, Any]) -> dict[str, Any]:
    predictions = []
    for record in vep.get("records") or []:
        for transcript in record.get("transcript_consequences") or []:
            if "alphamissense_score" in transcript or "alphamissense_prediction" in transcript:
                predictions.append(
                    {
                        "score": transcript.get("alphamissense_score"),
                        "prediction": transcript.get("alphamissense_prediction"),
                        "transcript_id": transcript.get("transcript_id"),
                    }
                )
    return {
        "status": "ok" if predictions else vep.get("status", "missing"),
        "predictions": predictions,
    }


async def _get_json(url: str, **kwargs: Any) -> Any:
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(url, **kwargs)
        response.raise_for_status()
        return response.json()


def _hgvs_query(variant_record: dict[str, Any]) -> str | None:
    gene = variant_record.get("gene")
    mutation = variant_record.get("mutation") or {}
    for key in ("cdna_hgvs", "protein_hgvs"):
        if gene and mutation.get(key):
            return f"{gene}:{mutation[key]}"
    return None


def _recommended_protein_name(entry: dict[str, Any]) -> str | None:
    protein = entry.get("proteinDescription", {})
    recommended = protein.get("recommendedName", {})
    full_name = recommended.get("fullName", {})
    return full_name.get("value")


def _uniprot_features(entry: dict[str, Any], feature_type: str) -> list[dict[str, Any]]:
    features = []
    for feature in entry.get("features") or []:
        if feature.get("type") != feature_type:
            continue
        location = feature.get("location", {})
        features.append(
            {
                "description": feature.get("description"),
                "start": location.get("start", {}).get("value"),
                "end": location.get("end", {}).get("value"),
            }
        )
    return features


def _function_comments(comments: list[dict[str, Any]]) -> list[str]:
    functions = []
    for comment in comments:
        if comment.get("commentType") != "FUNCTION":
            continue
        for text in comment.get("texts") or []:
            if text.get("value"):
                functions.append(text["value"])
    return functions


def _clinvar_record(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "uid": record.get("uid"),
        "title": record.get("title"),
        "variation_id": record.get("variation_id"),
        "clinical_significance": record.get("clinical_significance", {}).get("description"),
        "review_status": record.get("clinical_significance", {}).get("review_status"),
        "trait_set": record.get("trait_set"),
        "genes": record.get("genes"),
    }


def _live_apis_enabled() -> bool:
    return os.getenv("FOLDEX_DISABLE_LIVE_APIS", "").lower() not in {"1", "true", "yes"}
