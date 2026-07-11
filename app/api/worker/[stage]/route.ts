import { NextResponse } from 'next/server'
import { runStage } from '@/server/pipeline'
import { STAGE_ORDER, verifyQStashSignature, type Stage } from '@/server/queue'

export const runtime = 'nodejs'
export const maxDuration = 60

function isStage(value: string): value is Stage {
  return (STAGE_ORDER as readonly string[]).includes(value)
}

export async function POST(
  req: Request,
  context: { params: Promise<{ stage: string }> },
) {
  const { stage } = await context.params
  if (!isStage(stage)) {
    return NextResponse.json({ detail: `Unknown stage: ${stage}` }, { status: 404 })
  }

  const rawBody = await req.text()
  const verified = await verifyQStashSignature(req, rawBody)
  if (!verified) {
    return NextResponse.json({ detail: 'Invalid signature' }, { status: 401 })
  }

  let parsed: { job_id?: string }
  try {
    parsed = JSON.parse(rawBody) as { job_id?: string }
  } catch {
    return NextResponse.json({ detail: 'Invalid JSON' }, { status: 400 })
  }
  const jobId = parsed.job_id
  if (!jobId) {
    return NextResponse.json({ detail: 'job_id required' }, { status: 422 })
  }

  await runStage(jobId, stage)
  return NextResponse.json({ ok: true })
}
