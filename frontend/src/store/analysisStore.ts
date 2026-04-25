import type { AnalysisResult } from '../api/analysisApi'

export type Phase = 'input' | 'loading' | 'results'

export type StoreState = {
  phase: Phase
  jobId: string | null
  jobStatus: string | null
  result: AnalysisResult | null
  error: string | null
  completedAt: string | null
}

const STORAGE_KEY = 'foldex_analysis_state'

function loadFromStorage(): StoreState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as StoreState
      if (parsed.result) {
        return { ...parsed, phase: 'results' }
      }
    }
  } catch {
    // ignore
  }
  return { phase: 'input', jobId: null, jobStatus: null, result: null, error: null, completedAt: null }
}

function saveToStorage(state: StoreState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore
  }
}

let state: StoreState = loadFromStorage()
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((fn) => fn())
}

export function getState(): StoreState {
  return state
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function setPhase(phase: Phase) {
  state = { ...state, phase }
  saveToStorage(state)
  notify()
}

export function setJobStarted(jobId: string) {
  state = { ...state, phase: 'loading', jobId, jobStatus: 'queued', result: null, error: null, completedAt: null }
  saveToStorage(state)
  notify()
}

export function setJobStatus(jobStatus: string) {
  state = { ...state, jobStatus }
  notify()
}

export function setJobCompleted(result: AnalysisResult) {
  state = {
    ...state,
    phase: 'results',
    jobStatus: 'completed',
    result,
    error: null,
    completedAt: new Date().toISOString(),
  }
  saveToStorage(state)
  notify()
}

export function setJobFailed(error: string) {
  state = { ...state, phase: 'input', jobStatus: 'failed', error }
  saveToStorage(state)
  notify()
}

export function reset() {
  state = { phase: 'input', jobId: null, jobStatus: null, result: null, error: null, completedAt: null }
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
  notify()
}
