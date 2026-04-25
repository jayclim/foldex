from collections import Counter
from math import sqrt
from statistics import mean
from typing import Any


AMINO_ACID_PROPERTIES = {
    "A": {"name": "Alanine", "hydropathy": 1.8, "mass": 89.09, "class": "nonpolar"},
    "R": {"name": "Arginine", "hydropathy": -4.5, "mass": 174.2, "class": "positive"},
    "N": {"name": "Asparagine", "hydropathy": -3.5, "mass": 132.12, "class": "polar"},
    "D": {"name": "Aspartic acid", "hydropathy": -3.5, "mass": 133.1, "class": "negative"},
    "C": {"name": "Cysteine", "hydropathy": 2.5, "mass": 121.16, "class": "polar"},
    "Q": {"name": "Glutamine", "hydropathy": -3.5, "mass": 146.15, "class": "polar"},
    "E": {"name": "Glutamic acid", "hydropathy": -3.5, "mass": 147.13, "class": "negative"},
    "G": {"name": "Glycine", "hydropathy": -0.4, "mass": 75.07, "class": "special"},
    "H": {"name": "Histidine", "hydropathy": -3.2, "mass": 155.16, "class": "positive"},
    "I": {"name": "Isoleucine", "hydropathy": 4.5, "mass": 131.18, "class": "nonpolar"},
    "L": {"name": "Leucine", "hydropathy": 3.8, "mass": 131.18, "class": "nonpolar"},
    "K": {"name": "Lysine", "hydropathy": -3.9, "mass": 146.19, "class": "positive"},
    "M": {"name": "Methionine", "hydropathy": 1.9, "mass": 149.21, "class": "nonpolar"},
    "F": {"name": "Phenylalanine", "hydropathy": 2.8, "mass": 165.19, "class": "aromatic"},
    "P": {"name": "Proline", "hydropathy": -1.6, "mass": 115.13, "class": "special"},
    "S": {"name": "Serine", "hydropathy": -0.8, "mass": 105.09, "class": "polar"},
    "T": {"name": "Threonine", "hydropathy": -0.7, "mass": 119.12, "class": "polar"},
    "W": {"name": "Tryptophan", "hydropathy": -0.9, "mass": 204.23, "class": "aromatic"},
    "Y": {"name": "Tyrosine", "hydropathy": -1.3, "mass": 181.19, "class": "aromatic"},
    "V": {"name": "Valine", "hydropathy": 4.2, "mass": 117.15, "class": "nonpolar"},
}


THREE_TO_ONE = {
    "ALA": "A",
    "ARG": "R",
    "ASN": "N",
    "ASP": "D",
    "CYS": "C",
    "GLN": "Q",
    "GLU": "E",
    "GLY": "G",
    "HIS": "H",
    "ILE": "I",
    "LEU": "L",
    "LYS": "K",
    "MET": "M",
    "PHE": "F",
    "PRO": "P",
    "SER": "S",
    "THR": "T",
    "TRP": "W",
    "TYR": "Y",
    "VAL": "V",
}


async def variant_features(
    structure_data: dict[str, Any],
    annotations: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Fetch biologically relevant features from a given variant's 3D structure
    which is the input from structures.py

    Contributor task:
    - For MVP, extract features from the generated 3D structure using biopython or another api,
    needs to be very comprehensive.
    """
    sequence = structure_data.get("sequence") or ""
    pdb_text = structure_data.get("pdb") or ""
    mutation = structure_data.get("mutation") or {}

    sequence_features = _sequence_features(sequence)
    mutation_features = _mutation_features(mutation, sequence)
    structure_features = _structure_features(pdb_text)

    return {
        "sequence": sequence_features,
        "mutation": mutation_features,
        "structure": structure_features,
        "evidence": _evidence_features(annotations or {}),
        "feature_vector": _feature_vector(sequence_features, mutation_features, structure_features),
        "warnings": _feature_warnings(sequence, pdb_text),
    }


def _evidence_features(annotations: dict[str, Any]) -> dict[str, Any]:
    alpha_predictions = (annotations.get("alpha_missense") or {}).get("predictions") or []
    clinvar_records = (annotations.get("clinvar") or {}).get("records") or []
    gnomad = annotations.get("gnomad") or {}
    uniprot = annotations.get("uniprot") or {}
    return {
        "alpha_missense": alpha_predictions[0] if alpha_predictions else None,
        "clinvar_primary_significance": (
            clinvar_records[0].get("clinical_significance") if clinvar_records else None
        ),
        "population_frequency": gnomad.get("population_frequency"),
        "uniprot_accession": uniprot.get("accession"),
        "uniprot_protein_name": uniprot.get("protein_name"),
    }


def _sequence_features(sequence: str) -> dict[str, Any]:
    clean_sequence = "".join(aa for aa in sequence.upper() if aa in AMINO_ACID_PROPERTIES)
    counts = Counter(clean_sequence)
    length = len(clean_sequence)
    masses = [AMINO_ACID_PROPERTIES[aa]["mass"] for aa in clean_sequence]
    hydropathy = [AMINO_ACID_PROPERTIES[aa]["hydropathy"] for aa in clean_sequence]
    classes = Counter(AMINO_ACID_PROPERTIES[aa]["class"] for aa in clean_sequence)

    return {
        "length": length,
        "molecular_weight_da": round(sum(masses), 2),
        "average_hydropathy": round(mean(hydropathy), 3) if hydropathy else None,
        "composition": {aa: round(count / length, 4) for aa, count in sorted(counts.items())} if length else {},
        "class_composition": {
            aa_class: round(count / length, 4) for aa_class, count in sorted(classes.items())
        }
        if length
        else {},
        "charge_balance": {
            "positive_fraction": round((classes["positive"] / length), 4) if length else 0,
            "negative_fraction": round((classes["negative"] / length), 4) if length else 0,
            "net_positive_minus_negative": classes["positive"] - classes["negative"],
        },
        "cysteine_count": counts["C"],
        "proline_count": counts["P"],
        "glycine_count": counts["G"],
    }


def _mutation_features(mutation: dict[str, Any], sequence: str) -> dict[str, Any]:
    ref = mutation.get("reference_aa")
    alt = mutation.get("alternate_aa")
    position = mutation.get("protein_position")
    ref_props = AMINO_ACID_PROPERTIES.get(ref or "")
    alt_props = AMINO_ACID_PROPERTIES.get(alt or "")

    feature_block: dict[str, Any] = {
        "reference_aa": ref,
        "alternate_aa": alt,
        "protein_position": position,
        "position_fraction": round(position / len(sequence), 4)
        if isinstance(position, int) and sequence
        else None,
        "reference_properties": ref_props,
        "alternate_properties": alt_props,
        "class_change": None,
        "hydropathy_delta": None,
        "mass_delta_da": None,
        "local_window": None,
    }

    if ref_props and alt_props:
        feature_block["class_change"] = ref_props["class"] != alt_props["class"]
        feature_block["hydropathy_delta"] = round(alt_props["hydropathy"] - ref_props["hydropathy"], 3)
        feature_block["mass_delta_da"] = round(alt_props["mass"] - ref_props["mass"], 2)

    if isinstance(position, int) and sequence:
        start = max(position - 6, 0)
        end = min(position + 5, len(sequence))
        feature_block["local_window"] = {
            "start": start + 1,
            "end": end,
            "sequence": sequence[start:end],
        }

    return feature_block


def _structure_features(pdb_text: str) -> dict[str, Any]:
    if not pdb_text:
        return {
            "model_available": False,
            "atom_count": 0,
            "residue_count": 0,
            "chains": [],
            "bounding_box_angstrom": None,
            "radius_of_gyration_angstrom": None,
            "secondary_structure_proxy": {},
        }

    atoms = []
    residues = set()
    chains = set()

    for line in pdb_text.splitlines():
        if not line.startswith(("ATOM", "HETATM")):
            continue
        try:
            x = float(line[30:38])
            y = float(line[38:46])
            z = float(line[46:54])
        except ValueError:
            continue
        residue_name = line[17:20].strip()
        chain = line[21].strip() or "A"
        residue_number = line[22:26].strip()
        atoms.append((x, y, z, residue_name))
        residues.add((chain, residue_number, residue_name))
        chains.add(chain)

    if not atoms:
        return {
            "model_available": True,
            "atom_count": 0,
            "residue_count": 0,
            "chains": [],
            "bounding_box_angstrom": None,
            "radius_of_gyration_angstrom": None,
            "secondary_structure_proxy": {},
        }

    xs = [atom[0] for atom in atoms]
    ys = [atom[1] for atom in atoms]
    zs = [atom[2] for atom in atoms]
    centroid = (mean(xs), mean(ys), mean(zs))
    radius = sqrt(
        mean(
            (x - centroid[0]) ** 2 + (y - centroid[1]) ** 2 + (z - centroid[2]) ** 2
            for x, y, z, _ in atoms
        )
    )
    residue_letters = [THREE_TO_ONE.get(residue_name, "X") for _, _, residue_name in residues]
    residue_counts = Counter(residue_letters)

    return {
        "model_available": True,
        "atom_count": len(atoms),
        "residue_count": len(residues),
        "chains": sorted(chains),
        "bounding_box_angstrom": {
            "x": round(max(xs) - min(xs), 3),
            "y": round(max(ys) - min(ys), 3),
            "z": round(max(zs) - min(zs), 3),
        },
        "radius_of_gyration_angstrom": round(radius, 3),
        "secondary_structure_proxy": {
            "helix_forming_fraction": _fraction(residue_counts, ["A", "L", "M", "E", "Q", "K"]),
            "turn_disrupting_fraction": _fraction(residue_counts, ["G", "P", "S", "D", "N"]),
            "aromatic_fraction": _fraction(residue_counts, ["F", "W", "Y"]),
        },
    }


def _feature_vector(
    sequence_features: dict[str, Any],
    mutation_features: dict[str, Any],
    structure_features: dict[str, Any],
) -> dict[str, float]:
    return {
        "length": float(sequence_features.get("length") or 0),
        "average_hydropathy": float(sequence_features.get("average_hydropathy") or 0),
        "mass_delta_da": float(mutation_features.get("mass_delta_da") or 0),
        "hydropathy_delta": float(mutation_features.get("hydropathy_delta") or 0),
        "position_fraction": float(mutation_features.get("position_fraction") or 0),
        "radius_of_gyration_angstrom": float(structure_features.get("radius_of_gyration_angstrom") or 0),
    }


def _feature_warnings(sequence: str, pdb_text: str) -> list[str]:
    warnings = []
    if not sequence:
        warnings.append("No protein sequence was available, so sequence features are incomplete.")
    if not pdb_text:
        warnings.append("No PDB model was available, so structure features are sequence-only.")
    return warnings


def _fraction(counter: Counter, keys: list[str]) -> float:
    total = sum(counter.values())
    if not total:
        return 0
    return round(sum(counter[key] for key in keys) / total, 4)
