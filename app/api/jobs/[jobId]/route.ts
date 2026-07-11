import { NextResponse } from 'next/server'
import { getJob } from '@/server/jobs'

export const runtime = 'nodejs'

export async function GET(
  _req: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params
  const job = await getJob(jobId)
  if (!job) {
    return NextResponse.json({ detail: 'Job not found' }, { status: 404 })
  }
  // Strip pipeline scratch fields before returning to the client.
  const { _input, _annotations, _similar, _structures, ...publicJob } = job
  void _input
  void _annotations
  void _similar
  void _structures
  return NextResponse.json(publicJob)
}
