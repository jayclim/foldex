import { fetchWithTimeout, liveApisEnabled } from './http'

const ESMFOLD_URL = 'https://api.esmatlas.com/foldSequence/v1/pdb/'

type AnyDict = Record<string, unknown>

function asDict(v: unknown): AnyDict {
  return v && typeof v === 'object' ? (v as AnyDict) : {}
}

function viewerPayload(pdbText: string | null): AnyDict {
  return {
    format: 'pdb',
    data: pdbText,
    recommended_viewer: '3Dmol.js',
    available: Boolean(pdbText),
  }
}

export async function structure(variant: AnyDict): Promise<AnyDict> {
  const fullSequence =
    (variant.mutant_sequence as string) ||
    (variant.sequence as string) ||
    (variant.wild_type_sequence as string) ||
    ''
  let sequence = fullSequence
  const mutation = asDict(variant.mutation) || (variant as AnyDict)
  const label =
    (variant.label as string) ||
    (variant.name as string) ||
    (mutation.protein_hgvs as string) ||
    'variant'
  const warnings: string[] = []
  let modeledRegion: AnyDict | null = null

  if (!sequence) {
    warnings.push('No amino acid sequence was available for ESMFold.')
    return {
      label,
      source: 'none',
      sequence,
      mutation,
      pdb: null,
      viewer: viewerPayload(null),
      warnings,
    }
  }

  let pdbText: string | null = null
  let source = 'esmfold'

  if (liveApisEnabled()) {
    try {
      pdbText = await foldWithEsmfold(sequence)
      source = 'esmfold'
    } catch (exc) {
      const region = mutationCenteredRegion(fullSequence, mutation)
      if (region && region.sequence !== fullSequence) {
        try {
          pdbText = await foldWithEsmfold(region.sequence as string)
          sequence = region.sequence as string
          modeledRegion = {
            start: region.start,
            end: region.end,
            is_partial: true,
            full_sequence_length: fullSequence.length,
          }
          source = 'esmfold_partial'
          warnings.push(
            'Full-length ESMFold request failed, so a mutation-centered protein region was folded instead.',
          )
        } catch (regionExc) {
          warnings.push(`ESMFold request failed: ${exc instanceof Error ? exc.message : String(exc)}`)
          warnings.push(
            `Partial ESMFold fallback failed: ${regionExc instanceof Error ? regionExc.message : String(regionExc)}`,
          )
          source = 'esmfold_error'
        }
      } else {
        warnings.push(`ESMFold request failed: ${exc instanceof Error ? exc.message : String(exc)}`)
        source = 'esmfold_error'
      }
    }
  } else {
    source = 'esmfold_disabled'
    warnings.push('Live APIs are disabled by FOLDEX_DISABLE_LIVE_APIS=1.')
  }

  const payload: AnyDict = {
    label,
    source,
    sequence,
    sequence_length: sequence.length,
    full_sequence_length: fullSequence.length,
    mutation,
    pdb: pdbText,
    viewer: viewerPayload(pdbText),
    warnings,
  }
  if (modeledRegion) payload.modeled_region = modeledRegion
  return payload
}

export async function structuresForReport(
  unknownVariant: AnyDict,
  similarVariants: AnyDict[],
  annotations: AnyDict,
): Promise<AnyDict> {
  const wildTypeSequence = (asDict(annotations.uniprot).sequence as string) || ''
  const unknownStructure = asDict(annotations.structures).unknown_variant ?? null

  const wildTypeStructure = await structure({
    label: `${unknownVariant.gene || 'Gene'} wild type`,
    sequence: wildTypeSequence,
    mutation: { kind: 'wild_type' },
  })

  const similarStructures: AnyDict[] = []
  for (const similar of similarVariants.slice(0, 10)) {
    similarStructures.push({
      variant: similar,
      structure: await structure({
        label: similar.name,
        sequence: (similar.mutant_sequence as string) || wildTypeSequence,
        mutation: similar,
      }),
    })
  }

  return {
    wild_type: wildTypeStructure,
    unknown_variant: unknownStructure,
    similar_variants: similarStructures,
  }
}

export function mutateSequence(
  sequence: string,
  mutation: AnyDict,
): [string, string[]] {
  const warnings: string[] = []
  if (!sequence) {
    return ['', ['Cannot create mutant sequence because wild-type sequence is missing.']]
  }
  const position = mutation.protein_position
  const referenceAa = mutation.reference_aa
  const alternateAa = mutation.alternate_aa

  if (typeof position !== 'number' || !referenceAa || !alternateAa) {
    return [sequence, ['Protein substitution was not specific enough to mutate the sequence.']]
  }
  const index = position - 1
  if (index < 0 || index >= sequence.length) {
    return [sequence, [`Protein position ${position} is outside the available sequence.`]]
  }
  const observed = sequence[index]
  if (observed !== referenceAa) {
    return [
      sequence,
      [
        `Wild-type sequence has ${observed} at protein position ${position}, not ${referenceAa}; mutation was not applied.`,
      ],
    ]
  }
  return [`${sequence.slice(0, index)}${alternateAa}${sequence.slice(index + 1)}`, warnings]
}

function mutationCenteredRegion(
  sequence: string,
  mutation: AnyDict,
  maxLength = 400,
): { start: number; end: number; sequence: string } | null {
  if (!sequence || sequence.length <= maxLength) return null

  const position = mutation.protein_position
  if (typeof position !== 'number' || position < 1 || position > sequence.length) {
    return { start: 1, end: maxLength, sequence: sequence.slice(0, maxLength) }
  }
  const halfWindow = Math.floor(maxLength / 2)
  let start = Math.max(position - halfWindow, 1)
  const end = Math.min(start + maxLength - 1, sequence.length)
  start = Math.max(end - maxLength + 1, 1)
  return { start, end, sequence: sequence.slice(start - 1, end) }
}

async function foldWithEsmfold(sequence: string): Promise<string> {
  // Stay under 60s function limit; ESMFold itself rarely exceeds 50s for short sequences.
  const response = await fetchWithTimeout(ESMFOLD_URL, {
    method: 'POST',
    body: sequence,
    headers: { 'Content-Type': 'text/plain' },
    timeoutMs: 50_000,
  })
  if (!response.ok) {
    throw new Error(`ESMFold HTTP ${response.status}`)
  }
  return await response.text()
}
