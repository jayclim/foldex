import type { Job } from './schemas'

const JOB_TTL_SECONDS = 60 * 60 * 24 // 24 hours
const KEY_PREFIX = 'foldex:job:'

function key(jobId: string): string {
  return `${KEY_PREFIX}${jobId}`
}

function kvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
}

// In-memory fallback for local dev when no KV/Redis is wired up.
// Vercel's serverless model would lose this across invocations, so KV is required in production.
const memoryStore = new Map<string, Job>()

async function kvSet(jobId: string, job: Job): Promise<void> {
  const { kv } = await import('@vercel/kv')
  await kv.set(key(jobId), job, { ex: JOB_TTL_SECONDS })
}

async function kvGet(jobId: string): Promise<Job | null> {
  const { kv } = await import('@vercel/kv')
  const job = (await kv.get(key(jobId))) as Job | null
  return job ?? null
}

export async function createJob(job: Job): Promise<void> {
  if (kvConfigured()) {
    await kvSet(job.job_id, job)
    return
  }
  memoryStore.set(job.job_id, job)
}

export async function getJob(jobId: string): Promise<Job | null> {
  if (kvConfigured()) {
    return kvGet(jobId)
  }
  return memoryStore.get(jobId) ?? null
}

export async function updateJob(
  jobId: string,
  patch: Partial<Job>,
): Promise<Job | null> {
  const existing = await getJob(jobId)
  if (!existing) return null
  const merged: Job = { ...existing, ...patch }
  if (kvConfigured()) {
    await kvSet(jobId, merged)
  } else {
    memoryStore.set(jobId, merged)
  }
  return merged
}
