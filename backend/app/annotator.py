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

AA_ONE_TO_THREE = {value: key for key, value in AA_THREE_TO_ONE.items() if value != "*"}

CODON_TABLE = {
    "TTT": "F",
    "TTC": "F",
    "TTA": "L",
    "TTG": "L",
    "TCT": "S",
    "TCC": "S",
    "TCA": "S",
    "TCG": "S",
    "TAT": "Y",
    "TAC": "Y",
    "TAA": "*",
    "TAG": "*",
    "TGT": "C",
    "TGC": "C",
    "TGA": "*",
    "TGG": "W",
    "CTT": "L",
    "CTC": "L",
    "CTA": "L",
    "CTG": "L",
    "CCT": "P",
    "CCC": "P",
    "CCA": "P",
    "CCG": "P",
    "CAT": "H",
    "CAC": "H",
    "CAA": "Q",
    "CAG": "Q",
    "CGT": "R",
    "CGC": "R",
    "CGA": "R",
    "CGG": "R",
    "ATT": "I",
    "ATC": "I",
    "ATA": "I",
    "ATG": "M",
    "ACT": "T",
    "ACC": "T",
    "ACA": "T",
    "ACG": "T",
    "AAT": "N",
    "AAC": "N",
    "AAA": "K",
    "AAG": "K",
    "AGT": "S",
    "AGC": "S",
    "AGA": "R",
    "AGG": "R",
    "GTT": "V",
    "GTC": "V",
    "GTA": "V",
    "GTG": "V",
    "GCT": "A",
    "GCC": "A",
    "GCA": "A",
    "GCG": "A",
    "GAT": "D",
    "GAC": "D",
    "GAA": "E",
    "GAG": "E",
    "GGT": "G",
    "GGC": "G",
    "GGA": "G",
    "GGG": "G",
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

    # Attempt to use AI to clean up the input if it looks like raw text
    if gene and not mutation_text or len(gene + mutation_text) > 30:
        ai_parsed = await _parse_variant_with_ai(gene + " " + mutation_text)
        if ai_parsed.get("gene"):
            gene = ai_parsed["gene"]
            mutation_text = ai_parsed.get("mutation", mutation_text)

    variant_record = _build_variant_record(gene, mutation_text)

    # Find the canonical transcript to make VEP/gnomAD/AlphaMissense calls much more reliable
    transcript_id = await _fetch_ensembl_transcript(gene)
    if transcript_id:
        variant_record["ensembl_transcript"] = transcript_id
    else:
        warnings.append(f"Could not find a canonical Ensembl transcript for gene {gene}.")

    uniprot = await _fetch_uniprot(variant_record)
    warnings.extend(uniprot.pop("warnings", []))

    mutation = variant_record.get("mutation") or {}
    wild_type_sequence = uniprot.get("sequence") or ""
    reference_warnings = _normalize_protein_reference(mutation, wild_type_sequence)
    warnings.extend(reference_warnings)
    variant_record["query_terms"] = _variant_query_terms(variant_record)
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
    vep = await _fetch_vep(variant_record)
    vep_warnings = _enrich_variant_from_vep(variant_record, vep)
    warnings.extend(vep_warnings)
    clinvar = await _fetch_clinvar(variant_record)
    gnomad = await _fetch_gnomad(variant_record, vep)
    alpha_missense = _alpha_missense_from_vep(vep)

    # Calculate features using both the 3D structure and the gathered genomic evidence
    features = await variant_features(unknown_structure, {
        "vep": vep,
        "clinvar": clinvar,
        "gnomad": gnomad,
        "uniprot": uniprot,
        "alpha_missense": alpha_missense
    })

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
    parts = []
    if gene:
        parts.append(gene)
    if mutation_text and mutation_text.upper() != gene.upper():
        parts.append(mutation_text)
    display_name = " ".join(parts) if parts else ""

    return {
        "gene": gene,
        "mutation_text": mutation_text,
        "input_text": display_name,
        "display_name": display_name,
        "query_terms": [term for term in [gene, mutation_text, cdna_hgvs, protein_hgvs] if term],
        "mutation": mutation,
        "source": "frontend",
    }


_ONE_LETTER_AAS = set("ACDEFGHIKLMNPQRSTVWY")
_STOP_TOKENS = {"*", "X", "TER"}

_CDNA_RE = re.compile(
    r"\bc\.[0-9*+\-_]+(?:[ACGT]>[ACGT]|del[ACGT]*|dup[ACGT]*|ins[ACGT]+|delins[ACGT]+)",
    re.IGNORECASE,
)
_PROTEIN_RE = re.compile(
    r"(?:p\.)?(?P<ref>[A-Za-z]{3}|[A-Za-z])(?P<pos>\d+)(?P<alt>Ter|TER|[A-Za-z]{3}|[A-Za-z*X])(?![A-Za-z0-9])"
)


def _mutation_metadata(mutation_text: str) -> dict[str, Any]:
    metadata: dict[str, Any] = {"submitted": mutation_text}
    if not mutation_text:
        return metadata

    cdna_match = _CDNA_RE.search(mutation_text)
    if cdna_match:
        metadata["cdna_hgvs"] = "c." + cdna_match.group(0)[2:]

    protein_match = _PROTEIN_RE.search(mutation_text)
    if protein_match:
        ref_aa = _normalize_aa(protein_match.group("ref"))
        alt_aa = _normalize_aa(protein_match.group("alt"))
        position = int(protein_match.group("pos"))
        if ref_aa and alt_aa:
            metadata.update(
                {
                    "protein_hgvs": f"p.{_canonical_aa_token(ref_aa)}{position}{_canonical_aa_token(alt_aa)}",
                    "reference_aa": ref_aa,
                    "alternate_aa": alt_aa,
                    "protein_position": position,
                }
            )
    return metadata


def _normalize_protein_reference(mutation: dict[str, Any], wild_type_sequence: str) -> list[str]:
    position = mutation.get("protein_position")
    submitted_reference = mutation.get("reference_aa")
    alternate = mutation.get("alternate_aa")
    if not wild_type_sequence or not isinstance(position, int) or not submitted_reference or not alternate:
        return []

    index = position - 1
    if index < 0 or index >= len(wild_type_sequence):
        return []

    observed_reference = wild_type_sequence[index]
    if observed_reference == submitted_reference:
        return []

    submitted_hgvs = mutation.get("protein_hgvs")
    normalized_hgvs = _protein_hgvs(observed_reference, position, alternate)
    mutation["submitted_reference_aa"] = submitted_reference
    mutation["observed_reference_aa"] = observed_reference
    mutation["submitted_protein_hgvs"] = submitted_hgvs
    mutation["normalized_protein_hgvs"] = normalized_hgvs
    mutation["protein_hgvs"] = normalized_hgvs
    mutation["reference_aa"] = observed_reference
    return [
        (
            f"Submitted protein reference {submitted_reference} at position {position} does not "
            f"match the wild-type sequence ({observed_reference}); using {normalized_hgvs} "
            "to build and annotate the mutant protein."
        )
    ]


def _protein_hgvs(reference_aa: str, position: int, alternate_aa: str) -> str:
    reference = AA_ONE_TO_THREE.get(reference_aa, reference_aa)
    alternate = AA_ONE_TO_THREE.get(alternate_aa, alternate_aa)
    return f"p.{reference}{position}{alternate}"


def _variant_query_terms(variant_record: dict[str, Any]) -> list[str]:
    mutation = variant_record.get("mutation") or {}
    terms = [
        variant_record.get("gene"),
        variant_record.get("mutation_text"),
        mutation.get("submitted_protein_hgvs"),
        mutation.get("normalized_protein_hgvs"),
        mutation.get("cdna_hgvs"),
        mutation.get("protein_hgvs"),
    ]
    deduped = []
    for term in terms:
        if term and term not in deduped:
            deduped.append(term)
    return deduped


def _enrich_variant_from_vep(variant_record: dict[str, Any], vep: dict[str, Any]) -> list[str]:
    mutation = variant_record.get("mutation") or {}
    if mutation.get("cdna_hgvs"):
        return []

    cdna_hgvs = _coding_hgvs_from_vep(vep)
    if not cdna_hgvs:
        return []

    mutation["cdna_hgvs"] = cdna_hgvs
    variant_record["query_terms"] = _variant_query_terms(variant_record)
    return [f"Derived coding HGVS {cdna_hgvs} from VEP for exact ClinVar search."]


def _coding_hgvs_from_vep(vep: dict[str, Any]) -> str | None:
    target = _target_transcript_consequence(vep)
    if not target:
        return None

    cds_start = target.get("cds_start")
    codons = target.get("codons") or ""
    if not isinstance(cds_start, int) or "/" not in codons:
        return None

    reference_codon, alternate_codon = [part.upper() for part in codons.split("/", 1)]
    if len(reference_codon) != len(alternate_codon):
        return None

    differences = [
        index
        for index, (reference_base, alternate_base) in enumerate(zip(reference_codon, alternate_codon))
        if reference_base != alternate_base
    ]
    if len(differences) != 1:
        return None

    offset = differences[0]
    return f"c.{cds_start}{reference_codon[offset]}>{alternate_codon[offset]}"


def _target_transcript_consequence(vep: dict[str, Any]) -> dict[str, Any] | None:
    consequences = []
    for record in vep.get("records") or []:
        consequences.extend(record.get("transcript_consequences") or [])
    if not consequences:
        return None

    for consequence in consequences:
        if consequence.get("alphamissense") and consequence.get("cds_start"):
            return consequence
    for consequence in consequences:
        if consequence.get("biotype") == "protein_coding" and consequence.get("cds_start"):
            return consequence
    return None


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

    warnings = []
    attempted_queries = [hgvs]
    data, error = await _fetch_vep_hgvs(hgvs)
    if data is not None:
        return {"status": "ok", "query": hgvs, "records": data, "warnings": []}

    warnings.append(f"VEP failed for {hgvs}: {error}")
    if (variant_record.get("mutation") or {}).get("protein_hgvs") and not (
        variant_record.get("mutation") or {}
    ).get("cdna_hgvs"):
        candidates, candidate_warnings = await _protein_hgvs_cdna_candidates(variant_record)
        warnings.extend(candidate_warnings)
        for candidate in candidates:
            query = candidate["query"]
            attempted_queries.append(query)
            data, error = await _fetch_vep_hgvs(query)
            if data is not None:
                return {
                    "status": "ok",
                    "query": query,
                    "records": data,
                    "resolved_from": hgvs,
                    "resolution": candidate,
                    "attempted_queries": attempted_queries,
                    "warnings": warnings,
                }
            warnings.append(f"VEP failed for derived query {query}: {error}")

    return {
        "status": "error",
        "query": hgvs,
        "attempted_queries": attempted_queries,
        "records": [],
        "warnings": warnings,
    }


async def _fetch_vep_hgvs(hgvs: str) -> tuple[Any | None, str | None]:
    url = f"https://rest.ensembl.org/vep/human/hgvs/{hgvs}"
    try:
        data = await _get_json(url, params={"AlphaMissense": "1"}, headers={"Content-Type": "application/json"})
        return data, None
    except Exception as exc:  # noqa: BLE001
        return None, str(exc)


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
        records.sort(key=lambda record: _clinvar_record_rank(record, variant_record), reverse=True)
        return {"status": "ok", "query": query, "records": records, "warnings": []}
    except Exception as exc:  # noqa: BLE001
        return {"status": "error", "query": query, "records": [], "warnings": [f"ClinVar failed: {exc}"]}


async def _fetch_gnomad(variant_record: dict[str, Any], vep: dict[str, Any]) -> dict[str, Any]:
    gnomad_variant_id = _gnomad_variant_id_from_vep(vep)
    if gnomad_variant_id and _live_apis_enabled():
        direct = await _fetch_gnomad_variant(gnomad_variant_id)
        if direct.get("status") == "ok":
            vep_frequencies = _population_frequencies_from_vep(vep)
            if vep_frequencies:
                direct["vep_colocated_frequencies"] = vep_frequencies
            return direct
        if direct.get("status") == "not_found":
            frequencies = _population_frequencies_from_vep(vep)
            if frequencies:
                frequency = _preferred_vep_frequency(frequencies)
                return {
                    "status": "from_vep_colocated_variants",
                    "source": "Ensembl VEP colocated variants",
                    "queried_gnomad_variant_id": gnomad_variant_id,
                    "population_frequency": frequency.get("allele_frequency"),
                    "population_frequency_source": frequency.get("source"),
                    "population_frequencies": frequency.get("population_frequencies"),
                    "all_frequencies": frequencies,
                    "warnings": direct.get("warnings") or [],
                }
            return direct

    frequencies = _population_frequencies_from_vep(vep)
    if frequencies:
        frequency = _preferred_vep_frequency(frequencies)
        return {
            "status": "ok",
            "source": "Ensembl VEP colocated variants",
            "population_frequency": frequency.get("allele_frequency"),
            "population_frequency_source": frequency.get("source"),
            "population_frequencies": frequency.get("population_frequencies"),
            "all_frequencies": frequencies,
            "warnings": [],
        }

    return {
        "status": "missing_coordinates",
        "source": "gnomAD",
        "population_frequency": None,
        "warnings": [
            "gnomAD lookup needs genomic coordinates and alleles from VEP; none were available."
        ],
    }


def _population_frequencies_from_vep(vep: dict[str, Any]) -> list[dict[str, Any]]:
    frequencies = []
    frequency_keys = {
        "gnomad_af",
        "gnomade_af",
        "gnomadg_af",
        "gnomad",
        "gnomade",
        "gnomadg",
        "af",
        "afr_af",
        "amr_af",
        "eas_af",
        "eur_af",
        "sas_af",
    }
    for record in vep.get("records") or []:
        for colocated in record.get("colocated_variants") or []:
            nested_frequencies = colocated.get("frequencies") or {}
            for allele, allele_frequencies in nested_frequencies.items():
                if allele_frequencies:
                    frequencies.append(
                        {
                            "variant_id": colocated.get("id"),
                            "source": "VEP colocated variant",
                            "allele": allele,
                            "frequencies": allele_frequencies,
                        }
                    )

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
            alpha = transcript.get("alphamissense") or {}
            if alpha:
                predictions.append(
                    {
                        "score": alpha.get("am_pathogenicity"),
                        "prediction": alpha.get("am_class"),
                        "transcript_id": transcript.get("transcript_id"),
                        "protein_position": transcript.get("protein_start"),
                        "amino_acids": transcript.get("amino_acids"),
                    }
                )
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


async def _fetch_gnomad_variant(variant_id: str) -> dict[str, Any]:
    query = """
    query Variant($variantId: String!, $dataset: DatasetId!) {
      variant(variantId: $variantId, dataset: $dataset) {
        variantId
        reference_genome
        chrom
        pos
        ref
        alt
        flags
        genome {
          ac
          an
          af
          homozygote_count
        }
        exome {
          ac
          an
          af
          homozygote_count
        }
      }
    }
    """
    dataset = os.getenv("FOLDEX_GNOMAD_DATASET", "gnomad_r4")
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                "https://gnomad.broadinstitute.org/api",
                json={"query": query, "variables": {"variantId": variant_id, "dataset": dataset}},
            )
            response.raise_for_status()
            payload = response.json()
    except Exception as exc:  # noqa: BLE001
        return {
            "status": "error",
            "source": "gnomAD GraphQL",
            "variant_id": variant_id,
            "population_frequency": None,
            "warnings": [f"gnomAD GraphQL failed: {exc}"],
        }

    variant = (payload.get("data") or {}).get("variant")
    if not variant:
        errors = payload.get("errors") or []
        return {
            "status": "not_found",
            "source": "gnomAD GraphQL",
            "dataset": dataset,
            "variant_id": variant_id,
            "population_frequency": 0,
            "population_frequency_source": "gnomAD not observed",
            "population_frequencies": {
                "exome": None,
                "genome": None,
            },
            "warnings": [error.get("message") for error in errors if error.get("message")],
        }

    exome = variant.get("exome") or {}
    genome = variant.get("genome") or {}
    exome_frequency = _gnomad_frequency_block(exome)
    genome_frequency = _gnomad_frequency_block(genome)
    preferred = _preferred_gnomad_frequency(
        {"exome": exome_frequency, "genome": genome_frequency}
    )
    return {
        "status": "ok",
        "source": "gnomAD GraphQL",
        "dataset": dataset,
        "variant_id": variant.get("variantId") or variant_id,
        "population_frequency": preferred.get("allele_frequency"),
        "population_frequency_source": preferred.get("source"),
        "population_frequencies": {
            "exome": exome_frequency,
            "genome": genome_frequency,
        },
        "flags": variant.get("flags") or [],
        "raw": variant,
        "warnings": [],
    }


def _gnomad_frequency_block(block: dict[str, Any]) -> dict[str, Any] | None:
    if not block:
        return None
    return {
        "allele_count": block.get("ac"),
        "allele_number": block.get("an"),
        "allele_frequency": block.get("af"),
        "homozygote_count": block.get("homozygote_count"),
    }


def _preferred_gnomad_frequency(
    frequencies: dict[str, dict[str, Any] | None]
) -> dict[str, Any]:
    observed = [
        (source, block.get("allele_frequency"))
        for source, block in frequencies.items()
        if block and block.get("allele_frequency") is not None
    ]
    if not observed:
        return {"allele_frequency": None, "source": None}

    source, allele_frequency = max(observed, key=lambda item: item[1])
    return {"allele_frequency": allele_frequency, "source": source}


def _preferred_vep_frequency(frequencies: list[dict[str, Any]]) -> dict[str, Any]:
    flattened = {}
    for item in frequencies:
        for key, value in (item.get("frequencies") or {}).items():
            if isinstance(value, (int, float)):
                flattened[key] = value

    preferred_keys = (
        "gnomade",
        "gnomadg",
        "gnomade_af",
        "gnomadg_af",
        "gnomad_af",
        "af",
    )
    for key in preferred_keys:
        if flattened.get(key) is not None:
            return {
                "allele_frequency": flattened[key],
                "source": key,
                "population_frequencies": flattened,
            }

    numeric_items = [(key, value) for key, value in flattened.items() if value is not None]
    if not numeric_items:
        return {
            "allele_frequency": None,
            "source": None,
            "population_frequencies": flattened,
        }

    key, value = max(numeric_items, key=lambda item: item[1])
    return {
        "allele_frequency": value,
        "source": key,
        "population_frequencies": flattened,
    }


def _gnomad_variant_id_from_vep(vep: dict[str, Any]) -> str | None:
    for record in vep.get("records") or []:
        chrom = record.get("seq_region_name")
        pos = record.get("start")
        allele_string = record.get("allele_string") or ""
        alleles = allele_string.split("/")
        if not chrom or not pos or len(alleles) < 2:
            continue

        ref = alleles[0]
        alt = alleles[1]
        if len(ref) == 1 and len(alt) == 1 and record.get("strand") == -1:
            ref = _reverse_complement(ref)
            alt = _reverse_complement(alt)
        return f"{chrom}-{pos}-{ref}-{alt}"
    return None


def _reverse_complement(allele: str) -> str:
    complement = str.maketrans("ACGTacgt", "TGCAtgca")
    return allele.translate(complement)[::-1].upper()


async def _protein_hgvs_cdna_candidates(
    variant_record: dict[str, Any]
) -> tuple[list[dict[str, Any]], list[str]]:
    gene = variant_record.get("gene")
    mutation = variant_record.get("mutation") or {}
    position = mutation.get("protein_position")
    reference_aa = mutation.get("reference_aa")
    alternate_aa = mutation.get("alternate_aa")
    protein_hgvs = mutation.get("protein_hgvs")
    if not gene or not isinstance(position, int) or not reference_aa or not alternate_aa:
        return [], ["Protein-only VEP fallback needs gene, protein position, reference AA, and alternate AA."]

    transcript, transcript_warnings = await _canonical_transcript_for_gene(gene)
    if not transcript:
        return [], transcript_warnings

    cds_sequence, sequence_warning = await _fetch_cds_sequence(transcript["id"])
    if not cds_sequence:
        return [], transcript_warnings + [sequence_warning]

    candidates, candidate_warning = _cdna_candidates_from_cds(
        gene=gene,
        protein_hgvs=protein_hgvs,
        cds_sequence=cds_sequence,
        protein_position=position,
        reference_aa=reference_aa,
        alternate_aa=alternate_aa,
        transcript_id=transcript["id"],
    )
    warnings = transcript_warnings
    if candidate_warning:
        warnings.append(candidate_warning)
    return candidates, warnings


async def _canonical_transcript_for_gene(gene: str) -> tuple[dict[str, Any] | None, list[str]]:
    url = f"https://rest.ensembl.org/lookup/symbol/homo_sapiens/{gene}"
    try:
        data = await _get_json(url, params={"expand": "1"}, headers={"Content-Type": "application/json"})
    except Exception as exc:  # noqa: BLE001
        return None, [f"Could not resolve canonical Ensembl transcript for {gene}: {exc}"]

    transcripts = [
        transcript
        for transcript in data.get("Transcript") or []
        if transcript.get("biotype") == "protein_coding" and transcript.get("Translation")
    ]
    if not transcripts:
        return None, [f"No protein-coding Ensembl transcript was available for {gene}."]

    canonical = next((item for item in transcripts if item.get("is_canonical") == 1), None)
    primary = next((item for item in transcripts if item.get("gencode_primary") == 1), None)
    transcript = canonical or primary or max(
        transcripts,
        key=lambda item: (item.get("Translation") or {}).get("length") or 0,
    )
    return {
        "id": transcript.get("id"),
        "display_name": transcript.get("display_name"),
        "translation_id": (transcript.get("Translation") or {}).get("id"),
        "translation_length": (transcript.get("Translation") or {}).get("length"),
    }, []


async def _fetch_cds_sequence(transcript_id: str) -> tuple[str | None, str | None]:
    url = f"https://rest.ensembl.org/sequence/id/{transcript_id}"
    try:
        return await _get_text(url, params={"type": "cds"}, headers={"Content-Type": "text/plain"}), None
    except Exception as exc:  # noqa: BLE001
        return None, f"Could not fetch CDS sequence for {transcript_id}: {exc}"


def _cdna_candidates_from_cds(
    gene: str,
    protein_hgvs: str | None,
    cds_sequence: str,
    protein_position: int,
    reference_aa: str,
    alternate_aa: str,
    transcript_id: str,
) -> tuple[list[dict[str, Any]], str | None]:
    codon_start = (protein_position - 1) * 3
    codon = cds_sequence[codon_start : codon_start + 3].upper()
    if len(codon) != 3:
        return [], f"{protein_hgvs} is outside the CDS sequence for {transcript_id}."

    observed_aa = CODON_TABLE.get(codon)
    if observed_aa != reference_aa:
        return [], (
            f"{protein_hgvs} reference amino acid mismatch: {transcript_id} has "
            f"{observed_aa or 'unknown'} at protein position {protein_position}, not {reference_aa}."
        )

    candidates = []
    for offset, ref_base in enumerate(codon):
        for alt_base in "ACGT":
            if alt_base == ref_base:
                continue
            mutated_codon = f"{codon[:offset]}{alt_base}{codon[offset + 1:]}"
            if CODON_TABLE.get(mutated_codon) != alternate_aa:
                continue
            cdna_position = codon_start + offset + 1
            cdna_hgvs = f"c.{cdna_position}{ref_base}>{alt_base}"
            candidates.append(
                {
                    "query": f"{gene}:{cdna_hgvs}",
                    "transcript_query": f"{transcript_id}:{cdna_hgvs}",
                    "cdna_hgvs": cdna_hgvs,
                    "protein_hgvs": protein_hgvs,
                    "transcript_id": transcript_id,
                    "reference_codon": codon,
                    "alternate_codon": mutated_codon,
                    "protein_position": protein_position,
                }
            )

    if not candidates:
        return [], f"No single-nucleotide CDS change converts {codon} from {reference_aa} to {alternate_aa}."
    return candidates, None


async def _get_json(url: str, **kwargs: Any) -> Any:
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(url, **kwargs)
        response.raise_for_status()
        return response.json()


async def _get_text(url: str, **kwargs: Any) -> str:
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(url, **kwargs)
        response.raise_for_status()
        return response.text.strip()


def _hgvs_query(variant_record: dict[str, Any]) -> str | None:
    gene = variant_record.get("gene")
    transcript = variant_record.get("ensembl_transcript")
    mutation = variant_record.get("mutation") or {}
    
    # Prioritize Transcript ID for more reliable VEP/AlphaMissense results
    target = transcript or gene
    if not target:
        return None

    for key in ("cdna_hgvs", "protein_hgvs"):
        if mutation.get(key):
            return f"{target}:{mutation[key]}"
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
    classification = _clinvar_classification(record)
    return {
        "uid": record.get("uid"),
        "title": record.get("title"),
        "variation_id": record.get("variation_id") or record.get("accession"),
        "accession": record.get("accession"),
        "clinical_significance": classification.get("description"),
        "review_status": classification.get("review_status"),
        "last_evaluated": classification.get("last_evaluated"),
        "trait_set": classification.get("trait_set"),
        "genes": record.get("genes"),
    }


def _clinvar_classification(record: dict[str, Any]) -> dict[str, Any]:
    for key in (
        "germline_classification",
        "clinical_significance",
        "somatic_clinical_impact",
        "oncogenicity_classification",
    ):
        block = record.get(key)
        if isinstance(block, dict) and (block.get("description") or block.get("review_status")):
            return block
    return {}


def _clinvar_record_rank(record: dict[str, Any], variant_record: dict[str, Any]) -> int:
    title = (record.get("title") or "").lower()
    compact_title = re.sub(r"[^a-z0-9>]", "", title)
    gene = (variant_record.get("gene") or "").lower()
    mutation = variant_record.get("mutation") or {}
    score = 0
    if gene and f"({gene})" in title:
        score += 20
    for key in ("cdna_hgvs", "protein_hgvs", "normalized_protein_hgvs", "submitted_protein_hgvs"):
        value = mutation.get(key)
        if not value:
            continue
        compact_value = re.sub(r"[^a-z0-9>]", "", value.lower())
        compact_without_prefix = re.sub(r"^(c|p)", "", compact_value)
        if value.lower() in title or compact_value in compact_title:
            score += 20
        elif compact_without_prefix and compact_without_prefix in compact_title:
            score += 12
    if record.get("clinical_significance"):
        score += 5
    return score


def _live_apis_enabled() -> bool:
    return os.getenv("FOLDEX_DISABLE_LIVE_APIS", "").lower() not in {"1", "true", "yes"}
