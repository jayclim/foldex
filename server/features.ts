type AAProperties = { name: string; hydropathy: number; mass: number; class: string }

export const AMINO_ACID_PROPERTIES: Record<string, AAProperties> = {
  A: { name: 'Alanine', hydropathy: 1.8, mass: 89.09, class: 'nonpolar' },
  R: { name: 'Arginine', hydropathy: -4.5, mass: 174.2, class: 'positive' },
  N: { name: 'Asparagine', hydropathy: -3.5, mass: 132.12, class: 'polar' },
  D: { name: 'Aspartic acid', hydropathy: -3.5, mass: 133.1, class: 'negative' },
  C: { name: 'Cysteine', hydropathy: 2.5, mass: 121.16, class: 'polar' },
  Q: { name: 'Glutamine', hydropathy: -3.5, mass: 146.15, class: 'polar' },
  E: { name: 'Glutamic acid', hydropathy: -3.5, mass: 147.13, class: 'negative' },
  G: { name: 'Glycine', hydropathy: -0.4, mass: 75.07, class: 'special' },
  H: { name: 'Histidine', hydropathy: -3.2, mass: 155.16, class: 'positive' },
  I: { name: 'Isoleucine', hydropathy: 4.5, mass: 131.18, class: 'nonpolar' },
  L: { name: 'Leucine', hydropathy: 3.8, mass: 131.18, class: 'nonpolar' },
  K: { name: 'Lysine', hydropathy: -3.9, mass: 146.19, class: 'positive' },
  M: { name: 'Methionine', hydropathy: 1.9, mass: 149.21, class: 'nonpolar' },
  F: { name: 'Phenylalanine', hydropathy: 2.8, mass: 165.19, class: 'aromatic' },
  P: { name: 'Proline', hydropathy: -1.6, mass: 115.13, class: 'special' },
  S: { name: 'Serine', hydropathy: -0.8, mass: 105.09, class: 'polar' },
  T: { name: 'Threonine', hydropathy: -0.7, mass: 119.12, class: 'polar' },
  W: { name: 'Tryptophan', hydropathy: -0.9, mass: 204.23, class: 'aromatic' },
  Y: { name: 'Tyrosine', hydropathy: -1.3, mass: 181.19, class: 'aromatic' },
  V: { name: 'Valine', hydropathy: 4.2, mass: 117.15, class: 'nonpolar' },
}

const THREE_TO_ONE: Record<string, string> = {
  ALA: 'A', ARG: 'R', ASN: 'N', ASP: 'D', CYS: 'C', GLN: 'Q', GLU: 'E', GLY: 'G',
  HIS: 'H', ILE: 'I', LEU: 'L', LYS: 'K', MET: 'M', PHE: 'F', PRO: 'P', SER: 'S',
  THR: 'T', TRP: 'W', TYR: 'Y', VAL: 'V',
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function mean(values: number[]): number {
  if (!values.length) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

type AnyDict = Record<string, unknown>

function asDict(v: unknown): AnyDict {
  return v && typeof v === 'object' ? (v as AnyDict) : {}
}

export async function variantFeatures(
  structureData: AnyDict,
  annotations?: AnyDict | null,
): Promise<AnyDict> {
  const sequence = (structureData.sequence as string) || ''
  const pdbText = (structureData.pdb as string) || ''
  const mutation = asDict(structureData.mutation)

  const sequenceFeatures = _sequenceFeatures(sequence)
  const mutationFeatures = _mutationFeatures(mutation, sequence)
  const structureFeatures = _structureFeatures(pdbText)

  return {
    sequence: sequenceFeatures,
    mutation: mutationFeatures,
    structure: structureFeatures,
    evidence: _evidenceFeatures(annotations || {}),
    feature_vector: _featureVector(sequenceFeatures, mutationFeatures, structureFeatures),
    warnings: _featureWarnings(sequence, pdbText),
  }
}

function _evidenceFeatures(annotations: AnyDict): AnyDict {
  const alphaPredictions = (asDict(annotations.alpha_missense).predictions as AnyDict[]) || []
  const clinvarRecords = (asDict(annotations.clinvar).records as AnyDict[]) || []
  const gnomad = asDict(annotations.gnomad)
  const uniprot = asDict(annotations.uniprot)
  return {
    alpha_missense: alphaPredictions.length ? alphaPredictions[0] : null,
    clinvar_primary_significance: clinvarRecords.length
      ? clinvarRecords[0].clinical_significance ?? null
      : null,
    population_frequency: gnomad.population_frequency ?? null,
    uniprot_accession: uniprot.accession ?? null,
    uniprot_protein_name: uniprot.protein_name ?? null,
  }
}

function _sequenceFeatures(sequence: string): AnyDict {
  const cleaned = sequence
    .toUpperCase()
    .split('')
    .filter((aa) => aa in AMINO_ACID_PROPERTIES)
    .join('')
  const length = cleaned.length
  if (!length) {
    return {
      length: 0,
      molecular_weight_da: 0,
      average_hydropathy: null,
      composition: {},
      class_composition: {},
      charge_balance: { positive_fraction: 0, negative_fraction: 0, net_positive_minus_negative: 0 },
      cysteine_count: 0,
      proline_count: 0,
      glycine_count: 0,
    }
  }

  const counts: Record<string, number> = {}
  const classCounts: Record<string, number> = {}
  let mass = 0
  const hydropathies: number[] = []

  for (const aa of cleaned) {
    counts[aa] = (counts[aa] ?? 0) + 1
    const props = AMINO_ACID_PROPERTIES[aa]
    classCounts[props.class] = (classCounts[props.class] ?? 0) + 1
    mass += props.mass
    hydropathies.push(props.hydropathy)
  }

  const composition: Record<string, number> = {}
  for (const aa of Object.keys(counts).sort()) {
    composition[aa] = round(counts[aa] / length, 4)
  }
  const classComposition: Record<string, number> = {}
  for (const cls of Object.keys(classCounts).sort()) {
    classComposition[cls] = round(classCounts[cls] / length, 4)
  }

  const positive = classCounts.positive ?? 0
  const negative = classCounts.negative ?? 0

  return {
    length,
    molecular_weight_da: round(mass, 2),
    average_hydropathy: round(mean(hydropathies), 3),
    composition,
    class_composition: classComposition,
    charge_balance: {
      positive_fraction: round(positive / length, 4),
      negative_fraction: round(negative / length, 4),
      net_positive_minus_negative: positive - negative,
    },
    cysteine_count: counts.C ?? 0,
    proline_count: counts.P ?? 0,
    glycine_count: counts.G ?? 0,
  }
}

function _mutationFeatures(mutation: AnyDict, sequence: string): AnyDict {
  const ref = mutation.reference_aa as string | null | undefined
  const alt = mutation.alternate_aa as string | null | undefined
  const position = mutation.protein_position as number | null | undefined
  const refProps = ref ? AMINO_ACID_PROPERTIES[ref] : undefined
  const altProps = alt ? AMINO_ACID_PROPERTIES[alt] : undefined

  const block: AnyDict = {
    reference_aa: ref ?? null,
    alternate_aa: alt ?? null,
    protein_position: position ?? null,
    position_fraction:
      typeof position === 'number' && sequence ? round(position / sequence.length, 4) : null,
    reference_properties: refProps ?? null,
    alternate_properties: altProps ?? null,
    class_change: null,
    hydropathy_delta: null,
    mass_delta_da: null,
    local_window: null,
  }

  if (refProps && altProps) {
    block.class_change = refProps.class !== altProps.class
    block.hydropathy_delta = round(altProps.hydropathy - refProps.hydropathy, 3)
    block.mass_delta_da = round(altProps.mass - refProps.mass, 2)
  }

  if (typeof position === 'number' && sequence) {
    const start = Math.max(position - 6, 0)
    const end = Math.min(position + 5, sequence.length)
    block.local_window = {
      start: start + 1,
      end,
      sequence: sequence.slice(start, end),
    }
  }

  return block
}

function _structureFeatures(pdbText: string): AnyDict {
  if (!pdbText) {
    return {
      model_available: false,
      atom_count: 0,
      residue_count: 0,
      chains: [],
      bounding_box_angstrom: null,
      radius_of_gyration_angstrom: null,
      secondary_structure_proxy: {},
    }
  }

  const atoms: [number, number, number, string][] = []
  const residues = new Set<string>()
  const chains = new Set<string>()

  for (const line of pdbText.split('\n')) {
    if (!(line.startsWith('ATOM') || line.startsWith('HETATM'))) continue
    const xRaw = line.slice(30, 38)
    const yRaw = line.slice(38, 46)
    const zRaw = line.slice(46, 54)
    const x = parseFloat(xRaw)
    const y = parseFloat(yRaw)
    const z = parseFloat(zRaw)
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue
    const residueName = line.slice(17, 20).trim()
    const chain = line.slice(21, 22).trim() || 'A'
    const residueNumber = line.slice(22, 26).trim()
    atoms.push([x, y, z, residueName])
    residues.add(`${chain}|${residueNumber}|${residueName}`)
    chains.add(chain)
  }

  if (!atoms.length) {
    return {
      model_available: true,
      atom_count: 0,
      residue_count: 0,
      chains: [],
      bounding_box_angstrom: null,
      radius_of_gyration_angstrom: null,
      secondary_structure_proxy: {},
    }
  }

  const xs = atoms.map((a) => a[0])
  const ys = atoms.map((a) => a[1])
  const zs = atoms.map((a) => a[2])
  const cx = mean(xs)
  const cy = mean(ys)
  const cz = mean(zs)
  const sqDist = atoms.map(([x, y, z]) => (x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2)
  const radius = Math.sqrt(mean(sqDist))

  const residueLetters = Array.from(residues).map((entry) => {
    const parts = entry.split('|')
    const residueName = parts[2]
    return THREE_TO_ONE[residueName] ?? 'X'
  })
  const residueCounts: Record<string, number> = {}
  for (const r of residueLetters) residueCounts[r] = (residueCounts[r] ?? 0) + 1

  const fraction = (counter: Record<string, number>, keys: string[]): number => {
    const total = Object.values(counter).reduce((a, b) => a + b, 0)
    if (!total) return 0
    return round(keys.reduce((sum, k) => sum + (counter[k] ?? 0), 0) / total, 4)
  }

  return {
    model_available: true,
    atom_count: atoms.length,
    residue_count: residues.size,
    chains: Array.from(chains).sort(),
    bounding_box_angstrom: {
      x: round(Math.max(...xs) - Math.min(...xs), 3),
      y: round(Math.max(...ys) - Math.min(...ys), 3),
      z: round(Math.max(...zs) - Math.min(...zs), 3),
    },
    radius_of_gyration_angstrom: round(radius, 3),
    secondary_structure_proxy: {
      helix_forming_fraction: fraction(residueCounts, ['A', 'L', 'M', 'E', 'Q', 'K']),
      turn_disrupting_fraction: fraction(residueCounts, ['G', 'P', 'S', 'D', 'N']),
      aromatic_fraction: fraction(residueCounts, ['F', 'W', 'Y']),
    },
  }
}

function _featureVector(
  sequenceFeatures: AnyDict,
  mutationFeatures: AnyDict,
  structureFeatures: AnyDict,
): Record<string, number> {
  return {
    length: Number(sequenceFeatures.length || 0),
    average_hydropathy: Number(sequenceFeatures.average_hydropathy || 0),
    mass_delta_da: Number(mutationFeatures.mass_delta_da || 0),
    hydropathy_delta: Number(mutationFeatures.hydropathy_delta || 0),
    position_fraction: Number(mutationFeatures.position_fraction || 0),
    radius_of_gyration_angstrom: Number(structureFeatures.radius_of_gyration_angstrom || 0),
  }
}

function _featureWarnings(sequence: string, pdbText: string): string[] {
  const warnings: string[] = []
  if (!sequence) warnings.push('No protein sequence was available, so sequence features are incomplete.')
  if (!pdbText) warnings.push('No PDB model was available, so structure features are sequence-only.')
  return warnings
}
