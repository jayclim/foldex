import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { createJob } from '@/server/jobs'
import { enqueueStage } from '@/server/queue'
import { demoJob } from '@/server/demo'

export const runtime = 'nodejs'
export const maxDuration = 60

function demoMode(): boolean {
  const value = (process.env.FOLDEX_DEMO_MODE ?? '').toLowerCase()
  if (['1', 'true', 'yes'].includes(value)) return true
  if (['0', 'false', 'no'].includes(value)) return false
  return Boolean(process.env.VERCEL && !process.env.KV_REST_API_URL && !process.env.QSTASH_TOKEN)
}

export async function POST(req: Request) {
  let body: { gene?: string; mutation?: string }
  try {
    body = (await req.json()) as { gene?: string; mutation?: string }
  } catch {
    return NextResponse.json({ detail: 'Invalid JSON body' }, { status: 400 })
  }
  const gene = (body.gene ?? '').trim()
  const mutation = (body.mutation ?? '').trim()
  if (!gene) {
    return NextResponse.json({ detail: 'gene is required' }, { status: 422 })
  }

  const jobId = randomUUID()
  if (demoMode()) {
    return NextResponse.json(demoJob(jobId, gene, mutation))
  }

  await createJob({
    job_id: jobId,
    status: 'queued',
    _input: { gene, mutation },
  })
  await enqueueStage(jobId, 'annotate')

  return NextResponse.json({ job_id: jobId, status: 'queued' })
}
