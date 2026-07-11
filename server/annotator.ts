import { fetchWithTimeout, getJson, getText, liveApisEnabled } from './http'
import { variantFeatures } from './features'
import { mutateSequence, structure } from './structures'

type AnyDict = Record<string, unknown>

const AA_THREE_TO_ONE: Record<string, string> = {
  Ala: 'A', Arg: 'R', Asn: 'N', Asp: 'D', Cys: 'C', Gln: 'Q', Glu: 'E', Gly: 'G',
  His: 'H', Ile: 'I', Leu: 'L', Lys: 'K', Met: 'M', Phe: 'F', Pro: 'P', Ser: 'S',
  Thr: 'T', Trp: 'W', Tyr: 'Y', Val: 'V', Ter: '*',
}

const AA_ONE_TO_THREE: Record<string, string> = {}
for (const [three, one] of Object.entries(AA_THREE_TO_ONE)) {
  if (one !== '*') AA_ONE_TO_THREE[one] = three
}

const CODON_TABLE: Record<string, string> = {
  TTT: 'F', TTC: 'F', TTA: 'L', TTG: 'L', TCT: 'S', TCC: 'S', TCA: 'S', TCG: 'S',
  TAT: 'Y', TAC: 'Y', TAA: '*', TAG: '*', TGT: 'C', TGC: 'C', TGA: '*', TGG: 'W',
  CTT: 'L', CTC: 'L', CTA: 'L', CTG: 'L', CCT: 'P', CCC: 'P', CCA: 'P', CCG: 'P',
  CAT: 'H', CAC: 'H', CAA: 'Q', CAG: 'Q', CGT: 'R', CGC: 'R', CGA: 'R', CGG: 'R',
  ATT: 'I', ATC: 'I', ATA: 'I', ATG: 'M', ACT: 'T', ACC: 'T', ACA: 'T', ACG: 'T',
  AAT: 'N', AAC: 'N', AAA: 'K', AAG: 'K', AGT: 'S', AGC: 'S', AGA: 'R', AGG: 'R',
  GTT: 'V', GTC: 'V', GTA: 'V', GTG: 'V', GCT: 'A', GCC: 'A', GCA: 'A', GCG: 'A',
  GAT: 'D', GAC: 'D', GAA: 'E', GAG: 'E', GGT: 'G', GGC: 'G', GGA: 'G', GGG: 'G',
}

const ONE_LETTER_AAS = new Set('ACDEFGHIKLMNPQRSTVWY'.split(''))
const STOP_TOKENS = new Set(['*', 'X', 'TER'])

const CDNA_RE = /\bc\.[0-9*+\-_]+(?:[ACGT]>[ACGT]|del[ACGT]*|dup[ACGT]*|ins[ACGT]+|delins[ACGT]+)/i
const PROTEIN_RE = /(?:p\.)?(?<ref>[A-Za-z]{3}|[A-Za-z])(?<pos>\d+)(?<alt>Ter|TER|[A-Za-z]{3}|[A-Za-z*X])(?![A-Za-z0-9])/

function asDict(v: unknown): AnyDict {
  return v && typeof v === 'object' ? (v as AnyDict) : {}
}

function asArray<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

function normalizeAa(token: string | null | undefined): string | null {
  if (!token) return null
  const normalized = token.trim()
  const upper = normalized.toUpperCase()
  if (STOP_TOKENS.has(upper)) return '*'
  if (normalized.length === 1 && ONE_LETTER_AAS.has(upper)) return upper
  const title = normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase()
  return AA_THREE_TO_ONE[title] ?? null
}

function canonicalAaToken(amino: string | null | undefined): string | null {
  if (!amino) return null
  if (amino === '*') return 'Ter'
  return AA_ONE_TO_THREE[amino] ?? amino
}

function mutationMetadata(mutationText: string): AnyDict {
  const metadata: AnyDict = { submitted: mutationText }
  if (!mutationText) return metadata

  const cdnaMatch = mutationText.match(CDNA_RE)
  if (cdnaMatch) {
    metadata.cdna_hgvs = 'c.' + cdnaMatch[0].slice(2)
  }

  const proteinMatch = mutationText.match(PROTEIN_RE)
  if (proteinMatch?.groups) {
    const refAa = normalizeAa(proteinMatch.groups.ref)
    const altAa = normalizeAa(proteinMatch.groups.alt)
    const position = parseInt(proteinMatch.groups.pos, 10)
    if (refAa && altAa) {
      metadata.protein_hgvs = `p.${canonicalAaToken(refAa)}${position}${canonicalAaToken(altAa)}`
      metadata.reference_aa = refAa
      metadata.alternate_aa = altAa
      metadata.protein_position = position
    }
  }
  return metadata
}

function buildVariantRecord(gene: string, mutationText: string): AnyDict {
  const mutation = mutationMetadata(mutationText)
  const cdnaHgvs = mutation.cdna_hgvs as string | undefined
  const proteinHgvs = mutation.protein_hgvs as string | undefined
  const parts: string[] = []
  if (gene) parts.push(gene)
  if (mutationText && mutationText.toUpperCase() !== gene.toUpperCase()) parts.push(mutationText)
  const displayName = parts.length ? parts.join(' ') : ''

  return {
    gene,
    mutation_text: mutationText,
    input_text: displayName,
    display_name: displayName,
    query_terms: [gene, mutationText, cdnaHgvs, proteinHgvs].filter(Boolean) as string[],
    mutation,
    source: 'frontend',
  }
}

function variantQueryTerms(variantRecord: AnyDict): string[] {
  const mutation = asDict(variantRecord.mutation)
  const terms = [
    variantRecord.gene as string | undefined,
    variantRecord.mutation_text as string | undefined,
    mutation.submitted_protein_hgvs as string | undefined,
    mutation.normalized_protein_hgvs as string | undefined,
    mutation.cdna_hgvs as string | undefined,
    mutation.protein_hgvs as string | undefined,
  ]
  const deduped: string[] = []
  for (const term of terms) {
    if (term && !deduped.includes(term)) deduped.push(term)
  }
  return deduped
}

function proteinHgvs(referenceAa: string, position: number, alternateAa: string): string {
  const reference = AA_ONE_TO_THREE[referenceAa] ?? referenceAa
  const alternate = AA_ONE_TO_THREE[alternateAa] ?? alternateAa
  return `p.${reference}${position}${alternate}`
}

function normalizeProteinReference(mutation: AnyDict, wildTypeSequence: string): string[] {
  const position = mutation.protein_position
  const submittedReference = mutation.reference_aa as string | undefined
  const alternate = mutation.alternate_aa as string | undefined
  if (!wildTypeSequence || typeof position !== 'number' || !submittedReference || !alternate) return []
  const index = position - 1
  if (index < 0 || index >= wildTypeSequence.length) return []
  const observedReference = wildTypeSequence[index]
  if (observedReference === submittedReference) return []
  const submittedHgvs = mutation.protein_hgvs as string | undefined
  const normalizedHgvs = proteinHgvs(observedReference, position, alternate)
  mutation.submitted_reference_aa = submittedReference
  mutation.observed_reference_aa = observedReference
  mutation.submitted_protein_hgvs = submittedHgvs
  mutation.normalized_protein_hgvs = normalizedHgvs
  mutation.protein_hgvs = normalizedHgvs
  mutation.reference_aa = observedReference
  return [
    `Submitted protein reference ${submittedReference} at position ${position} does not match the wild-type sequence (${observedReference}); using ${normalizedHgvs} to build and annotate the mutant protein.`,
  ]
}

async function parseVariantWithAi(text: string): Promise<{ gene?: string; mutation?: string }> {
  const tokens = text.trim().split(/\s+/)
  if (!tokens.length) return {}
  const gene = tokens[0].toUpperCase()
  const mutation = tokens.slice(1).join(' ')
  return { gene, mutation }
}

function recommendedProteinName(entry: AnyDict): string | null {
  const protein = asDict(entry.proteinDescription)
  const recommended = asDict(protein.recommendedName)
  const fullName = asDict(recommended.fullName)
  return (fullName.value as string) ?? null
}

function uniprotFeatures(entry: AnyDict, featureType: string): AnyDict[] {
  const features: AnyDict[] = []
  for (const feature of asArray<AnyDict>(entry.features)) {
    if (feature.type !== featureType) continue
    const location = asDict(feature.location)
    features.push({
      description: feature.description ?? null,
      start: asDict(location.start).value ?? null,
      end: asDict(location.end).value ?? null,
    })
  }
  return features
}

function functionComments(comments: AnyDict[]): string[] {
  const functions: string[] = []
  for (const comment of comments) {
    if (comment.commentType !== 'FUNCTION') continue
    for (const text of asArray<AnyDict>(comment.texts)) {
      if (text.value) functions.push(String(text.value))
    }
  }
  return functions
}

async function fetchUniprot(variantRecord: AnyDict): Promise<AnyDict> {
  const gene = variantRecord.gene as string | undefined
  if (!gene) {
    return { status: 'missing_gene', warnings: ['No gene symbol was extracted for UniProt lookup.'] }
  }
  if (!liveApisEnabled()) {
    return {
      status: 'live_api_disabled',
      gene,
      sequence: null,
      warnings: ['Live APIs are disabled by FOLDEX_DISABLE_LIVE_APIS=1.'],
    }
  }

  const url = 'https://rest.uniprot.org/uniprotkb/search'
  try {
    const data = (await getJson(url, {
      params: {
        query: `gene_exact:${gene} AND organism_id:9606 AND reviewed:true`,
        fields: 'accession,id,protein_name,gene_names,sequence,ft_domain,cc_function',
        format: 'json',
        size: 1,
      },
    })) as AnyDict
    const results = asArray<AnyDict>(data.results)
    if (!results.length) {
      return { status: 'not_found', gene, sequence: null, warnings: [] }
    }
    const entry = results[0]
    const comments = asArray<AnyDict>(entry.comments)
    const sequenceBlock = asDict(entry.sequence)
    return {
      status: 'ok',
      gene,
      accession: entry.primaryAccession ?? null,
      entry_name: entry.uniProtkbId ?? null,
      protein_name: recommendedProteinName(entry),
      sequence: sequenceBlock.value ?? null,
      length: sequenceBlock.length ?? null,
      domains: uniprotFeatures(entry, 'Domain'),
      function: functionComments(comments),
      warnings: [],
    }
  } catch (exc) {
    return {
      status: 'error',
      gene,
      sequence: null,
      warnings: [`UniProt failed: ${exc instanceof Error ? exc.message : String(exc)}`],
    }
  }
}

function targetTranscriptConsequence(vep: AnyDict): AnyDict | null {
  const consequences: AnyDict[] = []
  for (const record of asArray<AnyDict>(vep.records)) {
    consequences.push(...asArray<AnyDict>(record.transcript_consequences))
  }
  if (!consequences.length) return null
  for (const c of consequences) {
    if (c.alphamissense && c.cds_start) return c
  }
  for (const c of consequences) {
    if (c.biotype === 'protein_coding' && c.cds_start) return c
  }
  return null
}

function codingHgvsFromVep(vep: AnyDict): string | null {
  const target = targetTranscriptConsequence(vep)
  if (!target) return null
  const cdsStart = target.cds_start
  const codons = (target.codons as string) ?? ''
  if (typeof cdsStart !== 'number' || !codons.includes('/')) return null
  const [refRaw, altRaw] = codons.split('/', 2)
  const referenceCodon = refRaw.toUpperCase()
  const alternateCodon = altRaw.toUpperCase()
  if (referenceCodon.length !== alternateCodon.length) return null
  const differences: number[] = []
  for (let i = 0; i < referenceCodon.length; i++) {
    if (referenceCodon[i] !== alternateCodon[i]) differences.push(i)
  }
  if (differences.length !== 1) return null
  const offset = differences[0]
  return `c.${cdsStart}${referenceCodon[offset]}>${alternateCodon[offset]}`
}

function enrichVariantFromVep(variantRecord: AnyDict, vep: AnyDict): string[] {
  const mutation = asDict(variantRecord.mutation)
  if (mutation.cdna_hgvs) return []
  const cdnaHgvs = codingHgvsFromVep(vep)
  if (!cdnaHgvs) return []
  mutation.cdna_hgvs = cdnaHgvs
  variantRecord.query_terms = variantQueryTerms(variantRecord)
  return [`Derived coding HGVS ${cdnaHgvs} from VEP for exact ClinVar search.`]
}

function hgvsQuery(variantRecord: AnyDict): string | null {
  const gene = variantRecord.gene as string | undefined
  const transcript = variantRecord.ensembl_transcript as string | undefined
  const mutation = asDict(variantRecord.mutation)
  const target = transcript || gene
  if (!target) return null
  for (const key of ['cdna_hgvs', 'protein_hgvs'] as const) {
    if (mutation[key]) return `${target}:${mutation[key]}`
  }
  return null
}

async function fetchVepHgvs(hgvs: string): Promise<[unknown | null, string | null]> {
  const url = `https://rest.ensembl.org/vep/human/hgvs/${hgvs}`
  try {
    const data = await getJson(url, {
      params: { AlphaMissense: '1' },
      headers: { 'Content-Type': 'application/json' },
    })
    return [data, null]
  } catch (exc) {
    return [null, exc instanceof Error ? exc.message : String(exc)]
  }
}

async function canonicalTranscriptForGene(gene: string): Promise<[AnyDict | null, string[]]> {
  const url = `https://rest.ensembl.org/lookup/symbol/homo_sapiens/${gene}`
  let data: AnyDict
  try {
    data = (await getJson(url, {
      params: { expand: '1' },
      headers: { 'Content-Type': 'application/json' },
    })) as AnyDict
  } catch (exc) {
    return [null, [`Could not resolve canonical Ensembl transcript for ${gene}: ${exc instanceof Error ? exc.message : String(exc)}`]]
  }
  const transcripts = asArray<AnyDict>(data.Transcript).filter(
    (t) => t.biotype === 'protein_coding' && t.Translation,
  )
  if (!transcripts.length) {
    return [null, [`No protein-coding Ensembl transcript was available for ${gene}.`]]
  }
  const canonical = transcripts.find((t) => t.is_canonical === 1)
  const primary = transcripts.find((t) => t.gencode_primary === 1)
  let chosen = canonical || primary
  if (!chosen) {
    chosen = transcripts.reduce((best, item) => {
      const a = (asDict(best.Translation).length as number | undefined) ?? 0
      const b = (asDict(item.Translation).length as number | undefined) ?? 0
      return b > a ? item : best
    }, transcripts[0])
  }
  return [
    {
      id: chosen.id,
      display_name: chosen.display_name,
      translation_id: asDict(chosen.Translation).id,
      translation_length: asDict(chosen.Translation).length,
    },
    [],
  ]
}

async function fetchEnsemblTranscript(gene: string): Promise<string | null> {
  if (!gene || !liveApisEnabled()) return null
  const [transcript] = await canonicalTranscriptForGene(gene)
  return (transcript?.id as string) ?? null
}

async function fetchCdsSequence(transcriptId: string): Promise<[string | null, string | null]> {
  const url = `https://rest.ensembl.org/sequence/id/${transcriptId}`
  try {
    return [await getText(url, { params: { type: 'cds' }, headers: { 'Content-Type': 'text/plain' } }), null]
  } catch (exc) {
    return [null, `Could not fetch CDS sequence for ${transcriptId}: ${exc instanceof Error ? exc.message : String(exc)}`]
  }
}

function cdnaCandidatesFromCds(args: {
  gene: string
  proteinHgvs: string | null
  cdsSequence: string
  proteinPosition: number
  referenceAa: string
  alternateAa: string
  transcriptId: string
}): [AnyDict[], string | null] {
  const { gene, proteinHgvs, cdsSequence, proteinPosition, referenceAa, alternateAa, transcriptId } = args
  const codonStart = (proteinPosition - 1) * 3
  const codon = cdsSequence.slice(codonStart, codonStart + 3).toUpperCase()
  if (codon.length !== 3) return [[], `${proteinHgvs} is outside the CDS sequence for ${transcriptId}.`]

  const observedAa = CODON_TABLE[codon]
  if (observedAa !== referenceAa) {
    return [
      [],
      `${proteinHgvs} reference amino acid mismatch: ${transcriptId} has ${observedAa || 'unknown'} at protein position ${proteinPosition}, not ${referenceAa}.`,
    ]
  }
  const candidates: AnyDict[] = []
  for (let offset = 0; offset < codon.length; offset++) {
    const refBase = codon[offset]
    for (const altBase of 'ACGT') {
      if (altBase === refBase) continue
      const mutatedCodon = `${codon.slice(0, offset)}${altBase}${codon.slice(offset + 1)}`
      if (CODON_TABLE[mutatedCodon] !== alternateAa) continue
      const cdnaPosition = codonStart + offset + 1
      const cdnaHgvs = `c.${cdnaPosition}${refBase}>${altBase}`
      candidates.push({
        query: `${gene}:${cdnaHgvs}`,
        transcript_query: `${transcriptId}:${cdnaHgvs}`,
        cdna_hgvs: cdnaHgvs,
        protein_hgvs: proteinHgvs,
        transcript_id: transcriptId,
        reference_codon: codon,
        alternate_codon: mutatedCodon,
        protein_position: proteinPosition,
      })
    }
  }
  if (!candidates.length) {
    return [[], `No single-nucleotide CDS change converts ${codon} from ${referenceAa} to ${alternateAa}.`]
  }
  return [candidates, null]
}

async function proteinHgvsCdnaCandidates(variantRecord: AnyDict): Promise<[AnyDict[], string[]]> {
  const gene = variantRecord.gene as string | undefined
  const mutation = asDict(variantRecord.mutation)
  const position = mutation.protein_position
  const referenceAa = mutation.reference_aa as string | undefined
  const alternateAa = mutation.alternate_aa as string | undefined
  const protein = (mutation.protein_hgvs as string | undefined) ?? null
  if (!gene || typeof position !== 'number' || !referenceAa || !alternateAa) {
    return [[], ['Protein-only VEP fallback needs gene, protein position, reference AA, and alternate AA.']]
  }
  const [transcript, transcriptWarnings] = await canonicalTranscriptForGene(gene)
  if (!transcript) return [[], transcriptWarnings]

  const [cdsSequence, sequenceWarning] = await fetchCdsSequence(transcript.id as string)
  if (!cdsSequence) return [[], [...transcriptWarnings, sequenceWarning ?? 'CDS fetch failed.']]

  const [candidates, candidateWarning] = cdnaCandidatesFromCds({
    gene,
    proteinHgvs: protein,
    cdsSequence,
    proteinPosition: position,
    referenceAa,
    alternateAa,
    transcriptId: transcript.id as string,
  })
  const warnings = [...transcriptWarnings]
  if (candidateWarning) warnings.push(candidateWarning)
  return [candidates, warnings]
}

async function fetchVep(variantRecord: AnyDict): Promise<AnyDict> {
  const hgvs = hgvsQuery(variantRecord)
  if (!hgvs) {
    return { status: 'missing_hgvs', records: [], warnings: ['No HGVS query was available for VEP.'] }
  }
  if (!liveApisEnabled()) {
    return {
      status: 'live_api_disabled',
      query: hgvs,
      records: [],
      warnings: ['Live APIs are disabled by FOLDEX_DISABLE_LIVE_APIS=1.'],
    }
  }
  const warnings: string[] = []
  const attempted: string[] = [hgvs]
  let [data, error] = await fetchVepHgvs(hgvs)
  if (data !== null) {
    return { status: 'ok', query: hgvs, records: data, warnings: [] }
  }
  warnings.push(`VEP failed for ${hgvs}: ${error}`)

  const mutation = asDict(variantRecord.mutation)
  if (mutation.protein_hgvs && !mutation.cdna_hgvs) {
    const [candidates, candidateWarnings] = await proteinHgvsCdnaCandidates(variantRecord)
    warnings.push(...candidateWarnings)
    for (const candidate of candidates) {
      const query = candidate.query as string
      attempted.push(query)
      ;[data, error] = await fetchVepHgvs(query)
      if (data !== null) {
        return {
          status: 'ok',
          query,
          records: data,
          resolved_from: hgvs,
          resolution: candidate,
          attempted_queries: attempted,
          warnings,
        }
      }
      warnings.push(`VEP failed for derived query ${query}: ${error}`)
    }
  }
  return {
    status: 'error',
    query: hgvs,
    attempted_queries: attempted,
    records: [],
    warnings,
  }
}

function clinvarClassification(record: AnyDict): AnyDict {
  for (const key of [
    'germline_classification',
    'clinical_significance',
    'somatic_clinical_impact',
    'oncogenicity_classification',
  ]) {
    const block = record[key]
    if (block && typeof block === 'object') {
      const b = block as AnyDict
      if (b.description || b.review_status) return b
    }
  }
  return {}
}

function clinvarRecord(record: AnyDict): AnyDict {
  const classification = clinvarClassification(record)
  return {
    uid: record.uid ?? null,
    title: record.title ?? null,
    variation_id: record.variation_id ?? record.accession ?? null,
    accession: record.accession ?? null,
    clinical_significance: classification.description ?? null,
    review_status: classification.review_status ?? null,
    last_evaluated: classification.last_evaluated ?? null,
    trait_set: classification.trait_set ?? null,
    genes: record.genes ?? null,
  }
}

function clinvarRecordRank(record: AnyDict, variantRecord: AnyDict): number {
  const title = ((record.title as string) ?? '').toLowerCase()
  const compactTitle = title.replace(/[^a-z0-9>]/g, '')
  const gene = ((variantRecord.gene as string) ?? '').toLowerCase()
  const mutation = asDict(variantRecord.mutation)
  let score = 0
  if (gene && title.includes(`(${gene})`)) score += 20
  for (const key of ['cdna_hgvs', 'protein_hgvs', 'normalized_protein_hgvs', 'submitted_protein_hgvs']) {
    const value = mutation[key] as string | undefined
    if (!value) continue
    const compactValue = value.toLowerCase().replace(/[^a-z0-9>]/g, '')
    const compactWithoutPrefix = compactValue.replace(/^(c|p)/, '')
    if (title.includes(value.toLowerCase()) || compactTitle.includes(compactValue)) {
      score += 20
    } else if (compactWithoutPrefix && compactTitle.includes(compactWithoutPrefix)) {
      score += 12
    }
  }
  if (record.clinical_significance) score += 5
  return score
}

async function fetchClinvar(variantRecord: AnyDict): Promise<AnyDict> {
  const terms = (variantRecord.query_terms as string[] | undefined) ?? []
  if (!terms.length) {
    return { status: 'missing_terms', records: [], warnings: ['No query terms were available for ClinVar.'] }
  }
  if (!liveApisEnabled()) {
    return { status: 'live_api_disabled', records: [], warnings: ['Live APIs are disabled by FOLDEX_DISABLE_LIVE_APIS=1.'] }
  }
  const query = terms.join(' ')
  try {
    const search = (await getJson(
      'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi',
      { params: { db: 'clinvar', term: query, retmode: 'json', retmax: 10 } },
    )) as AnyDict
    const ids = asArray<string>(asDict(search.esearchresult).idlist)
    if (!ids.length) return { status: 'not_found', query, records: [], warnings: [] }
    const summary = (await getJson(
      'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi',
      { params: { db: 'clinvar', id: ids.join(','), retmode: 'json' } },
    )) as AnyDict
    const result = asDict(summary.result)
    const records = ids
      .filter((id) => result[id])
      .map((id) => clinvarRecord(asDict(result[id])))
    records.sort((a, b) => clinvarRecordRank(b, variantRecord) - clinvarRecordRank(a, variantRecord))
    return { status: 'ok', query, records, warnings: [] }
  } catch (exc) {
    return {
      status: 'error',
      query,
      records: [],
      warnings: [`ClinVar failed: ${exc instanceof Error ? exc.message : String(exc)}`],
    }
  }
}

function reverseComplement(allele: string): string {
  const complementMap: Record<string, string> = { A: 'T', T: 'A', G: 'C', C: 'G', a: 't', t: 'a', g: 'c', c: 'g' }
  return allele
    .split('')
    .map((c) => complementMap[c] ?? c)
    .reverse()
    .join('')
    .toUpperCase()
}

function gnomadVariantIdFromVep(vep: AnyDict): string | null {
  for (const record of asArray<AnyDict>(vep.records)) {
    const chrom = record.seq_region_name as string | undefined
    const pos = record.start as number | undefined
    const alleleString = (record.allele_string as string) ?? ''
    const alleles = alleleString.split('/')
    if (!chrom || !pos || alleles.length < 2) continue
    let ref = alleles[0]
    let alt = alleles[1]
    if (ref.length === 1 && alt.length === 1 && record.strand === -1) {
      ref = reverseComplement(ref)
      alt = reverseComplement(alt)
    }
    return `${chrom}-${pos}-${ref}-${alt}`
  }
  return null
}

function gnomadFrequencyBlock(block: AnyDict): AnyDict | null {
  if (!block || !Object.keys(block).length) return null
  return {
    allele_count: block.ac ?? null,
    allele_number: block.an ?? null,
    allele_frequency: block.af ?? null,
    homozygote_count: block.homozygote_count ?? null,
  }
}

function preferredGnomadFrequency(frequencies: Record<string, AnyDict | null>): AnyDict {
  const observed: [string, number][] = []
  for (const [src, block] of Object.entries(frequencies)) {
    const af = block?.allele_frequency
    if (block && typeof af === 'number') observed.push([src, af])
  }
  if (!observed.length) return { allele_frequency: null, source: null }
  observed.sort((a, b) => b[1] - a[1])
  return { allele_frequency: observed[0][1], source: observed[0][0] }
}

function populationFrequenciesFromVep(vep: AnyDict): AnyDict[] {
  const frequencies: AnyDict[] = []
  const frequencyKeys = new Set([
    'gnomad_af', 'gnomade_af', 'gnomadg_af', 'gnomad', 'gnomade', 'gnomadg',
    'af', 'afr_af', 'amr_af', 'eas_af', 'eur_af', 'sas_af',
  ])
  for (const record of asArray<AnyDict>(vep.records)) {
    for (const colocated of asArray<AnyDict>(record.colocated_variants)) {
      const nested = asDict(colocated.frequencies)
      for (const [allele, alleleFrequencies] of Object.entries(nested)) {
        if (alleleFrequencies) {
          frequencies.push({
            variant_id: colocated.id ?? null,
            source: 'VEP colocated variant',
            allele,
            frequencies: alleleFrequencies,
          })
        }
      }
      const found: AnyDict = {}
      for (const key of frequencyKeys) {
        if (colocated[key] !== undefined && colocated[key] !== null) found[key] = colocated[key]
      }
      if (Object.keys(found).length) {
        frequencies.push({
          variant_id: colocated.id ?? null,
          source: 'VEP colocated variant',
          frequencies: found,
        })
      }
    }
  }
  return frequencies
}

function preferredVepFrequency(frequencies: AnyDict[]): AnyDict {
  const flattened: Record<string, number> = {}
  for (const item of frequencies) {
    const inner = asDict(item.frequencies)
    for (const [key, value] of Object.entries(inner)) {
      if (typeof value === 'number') flattened[key] = value
    }
  }
  const preferred = ['gnomade', 'gnomadg', 'gnomade_af', 'gnomadg_af', 'gnomad_af', 'af']
  for (const key of preferred) {
    if (flattened[key] !== undefined) {
      return { allele_frequency: flattened[key], source: key, population_frequencies: flattened }
    }
  }
  const numericItems = Object.entries(flattened).filter(([, v]) => v !== null && v !== undefined)
  if (!numericItems.length) {
    return { allele_frequency: null, source: null, population_frequencies: flattened }
  }
  numericItems.sort((a, b) => (b[1] as number) - (a[1] as number))
  return { allele_frequency: numericItems[0][1], source: numericItems[0][0], population_frequencies: flattened }
}

async function fetchGnomadVariant(variantId: string): Promise<AnyDict> {
  const query = `
    query Variant($variantId: String!, $dataset: DatasetId!) {
      variant(variantId: $variantId, dataset: $dataset) {
        variantId
        reference_genome
        chrom
        pos
        ref
        alt
        flags
        genome { ac an af homozygote_count }
        exome { ac an af homozygote_count }
      }
    }
  `
  const dataset = process.env.FOLDEX_GNOMAD_DATASET ?? 'gnomad_r4'
  let payload: AnyDict
  try {
    const response = await fetchWithTimeout('https://gnomad.broadinstitute.org/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { variantId, dataset } }),
      timeoutMs: 30_000,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    payload = (await response.json()) as AnyDict
  } catch (exc) {
    return {
      status: 'error',
      source: 'gnomAD GraphQL',
      variant_id: variantId,
      population_frequency: null,
      warnings: [`gnomAD GraphQL failed: ${exc instanceof Error ? exc.message : String(exc)}`],
    }
  }

  const variant = asDict(asDict(payload.data).variant)
  if (!Object.keys(variant).length) {
    const errors = asArray<AnyDict>(payload.errors)
    return {
      status: 'not_found',
      source: 'gnomAD GraphQL',
      dataset,
      variant_id: variantId,
      population_frequency: 0,
      population_frequency_source: 'gnomAD not observed',
      population_frequencies: { exome: null, genome: null },
      warnings: errors.map((e) => e.message).filter(Boolean) as string[],
    }
  }
  const exome = asDict(variant.exome)
  const genome = asDict(variant.genome)
  const exomeFreq = gnomadFrequencyBlock(exome)
  const genomeFreq = gnomadFrequencyBlock(genome)
  const preferred = preferredGnomadFrequency({ exome: exomeFreq, genome: genomeFreq })
  return {
    status: 'ok',
    source: 'gnomAD GraphQL',
    dataset,
    variant_id: variant.variantId ?? variantId,
    population_frequency: preferred.allele_frequency,
    population_frequency_source: preferred.source,
    population_frequencies: { exome: exomeFreq, genome: genomeFreq },
    flags: variant.flags ?? [],
    raw: variant,
    warnings: [],
  }
}

async function fetchGnomad(variantRecord: AnyDict, vep: AnyDict): Promise<AnyDict> {
  const id = gnomadVariantIdFromVep(vep)
  if (id && liveApisEnabled()) {
    const direct = await fetchGnomadVariant(id)
    if (direct.status === 'ok') {
      const vepFrequencies = populationFrequenciesFromVep(vep)
      if (vepFrequencies.length) direct.vep_colocated_frequencies = vepFrequencies
      return direct
    }
    if (direct.status === 'not_found') {
      const frequencies = populationFrequenciesFromVep(vep)
      if (frequencies.length) {
        const frequency = preferredVepFrequency(frequencies)
        return {
          status: 'from_vep_colocated_variants',
          source: 'Ensembl VEP colocated variants',
          queried_gnomad_variant_id: id,
          population_frequency: frequency.allele_frequency,
          population_frequency_source: frequency.source,
          population_frequencies: frequency.population_frequencies,
          all_frequencies: frequencies,
          warnings: (direct.warnings as string[]) ?? [],
        }
      }
      return direct
    }
  }
  const frequencies = populationFrequenciesFromVep(vep)
  if (frequencies.length) {
    const frequency = preferredVepFrequency(frequencies)
    return {
      status: 'ok',
      source: 'Ensembl VEP colocated variants',
      population_frequency: frequency.allele_frequency,
      population_frequency_source: frequency.source,
      population_frequencies: frequency.population_frequencies,
      all_frequencies: frequencies,
      warnings: [],
    }
  }
  return {
    status: 'missing_coordinates',
    source: 'gnomAD',
    population_frequency: null,
    warnings: ['gnomAD lookup needs genomic coordinates and alleles from VEP; none were available.'],
  }
}

function alphaMissenseFromVep(vep: AnyDict): AnyDict {
  const predictions: AnyDict[] = []
  for (const record of asArray<AnyDict>(vep.records)) {
    for (const transcript of asArray<AnyDict>(record.transcript_consequences)) {
      const alpha = asDict(transcript.alphamissense)
      if (Object.keys(alpha).length) {
        predictions.push({
          score: alpha.am_pathogenicity ?? null,
          prediction: alpha.am_class ?? null,
          transcript_id: transcript.transcript_id ?? null,
          protein_position: transcript.protein_start ?? null,
          amino_acids: transcript.amino_acids ?? null,
        })
      }
      if ('alphamissense_score' in transcript || 'alphamissense_prediction' in transcript) {
        predictions.push({
          score: transcript.alphamissense_score ?? null,
          prediction: transcript.alphamissense_prediction ?? null,
          transcript_id: transcript.transcript_id ?? null,
        })
      }
    }
  }
  return {
    status: predictions.length ? 'ok' : (vep.status as string) ?? 'missing',
    predictions,
  }
}

export async function annotateVariant(variant: AnyDict): Promise<AnyDict> {
  let gene = String(variant.gene ?? '').trim().toUpperCase()
  let mutationText = String(variant.mutation ?? '').trim()
  const warnings: string[] = []

  if ((gene && !mutationText) || gene.length + mutationText.length > 30) {
    const aiParsed = await parseVariantWithAi(`${gene} ${mutationText}`)
    if (aiParsed.gene) {
      gene = aiParsed.gene
      mutationText = aiParsed.mutation ?? mutationText
    }
  }

  const variantRecord = buildVariantRecord(gene, mutationText)

  const transcriptId = await fetchEnsemblTranscript(gene)
  if (transcriptId) {
    variantRecord.ensembl_transcript = transcriptId
  } else {
    warnings.push(`Could not find a canonical Ensembl transcript for gene ${gene}.`)
  }

  const uniprot = await fetchUniprot(variantRecord)
  warnings.push(...((uniprot.warnings as string[]) ?? []))
  delete uniprot.warnings

  const mutation = asDict(variantRecord.mutation)
  const wildTypeSequence = (uniprot.sequence as string) ?? ''
  warnings.push(...normalizeProteinReference(mutation, wildTypeSequence))
  variantRecord.query_terms = variantQueryTerms(variantRecord)
  const [mutantSequence, mutationWarnings] = mutateSequence(wildTypeSequence, mutation)
  warnings.push(...mutationWarnings)

  variantRecord.wild_type_sequence = wildTypeSequence
  variantRecord.mutant_sequence = mutantSequence
  variantRecord.sequence = mutantSequence || wildTypeSequence

  const unknownStructure = await structure({
    ...variantRecord,
    label: variantRecord.display_name,
    sequence: variantRecord.sequence,
    mutation,
  })

  const vep = await fetchVep(variantRecord)
  warnings.push(...enrichVariantFromVep(variantRecord, vep))
  const clinvar = await fetchClinvar(variantRecord)
  const gnomad = await fetchGnomad(variantRecord, vep)
  const alphaMissense = alphaMissenseFromVep(vep)

  const features = await variantFeatures(unknownStructure, {
    vep,
    clinvar,
    gnomad,
    uniprot,
    alpha_missense: alphaMissense,
  })

  for (const block of [vep, clinvar, gnomad]) {
    warnings.push(...((block.warnings as string[]) ?? []))
  }

  return {
    variant: variantRecord,
    vep,
    alpha_missense: alphaMissense,
    clinvar,
    gnomad,
    uniprot,
    features,
    structures: { unknown_variant: unknownStructure },
    warnings,
  }
}
