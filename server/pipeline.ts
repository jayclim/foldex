import { annotateVariant } from './annotator'
import { findSimilarVariants } from './similarity'
import { generateReport } from './reporter'
import { structure } from './structures'
import { getJob, updateJob } from './jobs'
import { enqueueStage, nextStage, type Stage } from './queue'
import type { Job, ProteinStructure, SimilarVariant } from './schemas'

type AnyDict = Record<string, unknown>

function asDict(v: unknown): AnyDict {
  return v && typeof v === 'object' ? (v as AnyDict) : {}
}

async function runAnnotate(job: Job): Promise<Partial<Job>> {
  if (!job._input) throw new Error('Missing job input.')
  const annotations = await annotateVariant({
    gene: job._input.gene,
    mutation: job._input.mutation,
  })
  return { _annotations: annotations as AnyDict, status: 'running' }
}

async function runSimilar(job: Job): Promise<Partial<Job>> {
  const annotations = job._annotations ?? {}
  const parsed = (annotations.variant as AnyDict) ?? {
    gene: job._input?.gene,
    mutation: job._input?.mutation,
  }
  const similar = (await findSimilarVariants(parsed, annotations)) as SimilarVariant[]
  return { _similar: similar }
}

async function runStructureUnknown(job: Job): Promise<Partial<Job>> {
  const annotations = asDict(job._annotations)
  const existing = asDict(annotations.structures).unknown_variant as ProteinStructure | undefined
  const updatedStructures = job._structures ?? {}
  updatedStructures.unknown_variant = existing ?? null
  return { _structures: updatedStructures }
}

async function runStructureWildtype(job: Job): Promise<Partial<Job>> {
  const annotations = asDict(job._annotations)
  const wildTypeSequence = (asDict(annotations.uniprot).sequence as string) || ''
  const gene = (asDict(annotations.variant).gene as string) || job._input?.gene || 'Gene'
  const wildTypeStructure = (await structure({
    label: `${gene} wild type`,
    sequence: wildTypeSequence,
    mutation: { kind: 'wild_type' },
  })) as ProteinStructure
  const updated = job._structures ?? {}
  updated.wild_type = wildTypeStructure
  return { _structures: updated }
}

async function runStructureSimilar(job: Job): Promise<Partial<Job>> {
  const annotations = asDict(job._annotations)
  const wildTypeSequence = (asDict(annotations.uniprot).sequence as string) || ''
  const similar = job._similar ?? []
  // Cap at 1 to fit the 60s budget on Hobby. Increase on Pro.
  const target = similar.slice(0, 1)
  const similarStructures: { variant: SimilarVariant; structure: ProteinStructure }[] = []
  for (const sv of target) {
    const s = (await structure({
      label: sv.name,
      sequence: (sv.mutant_sequence as string) || wildTypeSequence,
      mutation: sv,
    })) as ProteinStructure
    similarStructures.push({ variant: sv, structure: s })
  }
  const updated = job._structures ?? {}
  updated.similar_variants = similarStructures
  return { _structures: updated }
}

async function runReport(job: Job): Promise<Partial<Job>> {
  const annotations = job._annotations ?? {}
  const similar = job._similar ?? []
  const structures = job._structures ?? {}
  const variant = (annotations.variant as AnyDict) ?? {
    gene: job._input?.gene,
    mutation: job._input?.mutation,
  }
  const report = await generateReport(variant, annotations as AnyDict, similar as AnyDict[], structures as AnyDict)

  return {
    status: 'completed',
    result: {
      variant: variant as Job['result'] extends infer R ? (R extends { variant?: infer V } ? V : never) : never,
      annotations: annotations as Record<string, unknown>,
      similar_variants: similar,
      structures: structures as Record<string, unknown>,
      report: report as { markdown?: string | null; patient_summary?: string | null; json?: Record<string, unknown> | null },
    },
  }
}

export async function runStage(jobId: string, stage: Stage): Promise<void> {
  const job = await getJob(jobId)
  if (!job) throw new Error(`Job ${jobId} not found`)

  let patch: Partial<Job> = {}
  try {
    switch (stage) {
      case 'annotate':
        patch = await runAnnotate(job)
        break
      case 'similar':
        patch = await runSimilar(job)
        break
      case 'structure-unknown':
        patch = await runStructureUnknown(job)
        break
      case 'structure-wildtype':
        patch = await runStructureWildtype(job)
        break
      case 'structure-similar':
        patch = await runStructureSimilar(job)
        break
      case 'report':
        patch = await runReport(job)
        break
    }
  } catch (exc) {
    await updateJob(jobId, {
      status: 'failed',
      error: exc instanceof Error ? exc.message : String(exc),
    })
    return
  }

  await updateJob(jobId, patch)

  const next = nextStage(stage)
  if (next) {
    await enqueueStage(jobId, next)
  }
}
