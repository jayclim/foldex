export const sequenceRows = [
  {
    label: 'REF_SEQ',
    labelTone: 'muted',
    bases: ['A', 'T', 'G', 'C', '...', 'G', 'G', 'T', 'A', 'C', 'A', 'G', 'C', 'T', 'A', 'A', 'T', 'G', 'C', 'G', 'G', 'T', 'A', 'C', 'A', 'G', 'C', 'T', 'A', 'G', 'G', 'T', 'A', 'C', 'A'],
    baseTone: 'cyan',
  },
  {
    label: 'SAMPLE_1',
    labelTone: 'success',
    bases: ['A', 'T', 'G', 'C', '...', 'G', 'G', 'T', 'A', 'C', 'A', 'G', 'C', 'T', 'A', 'A', 'T', 'G', 'C', 'G', 'G', 'T', 'A', 'C', 'A', 'G', 'C', 'T', 'A', 'G', 'G', 'T', 'A', 'C', 'A'],
    baseTone: 'success',
    mutationIndex: 9,
  },
  {
    label: 'CONSENSUS',
    labelTone: 'muted',
    bases: ['A', 'T', 'G', 'C', '...', 'G', 'G', 'T', 'A', 'X', 'A', 'G', 'C', 'T', 'A', 'A', 'T', 'G', 'C', 'G', 'G', 'T', 'A', 'C', 'A'],
    baseTone: 'primary',
  },
]

export const signalBars = [4, 6, 5, 8, 4, 3, 6, 5, 7]

export const diagnosticLogs = [
  { time: '14:22:01', level: 'SUCCESS', tone: 'success', message: 'Base pair alignment at segment 449 verified.' },
  { time: '14:22:04', level: 'INFO', tone: 'info', message: 'Neural weights adjusted for GC-rich region.' },
  { time: '14:22:05', level: 'WARN', tone: 'warn', message: 'Low coverage detected at site 881-A. Re-scanning...' },
  { time: '14:22:09', level: 'ACTIVE', tone: 'success', message: 'Synthetic peptide prediction in progress.' },
  { time: '14:22:12', level: 'INFO', tone: 'info', message: 'GPU acceleration cluster "AURA-7" at 88% capacity.' },
]

export const systemStats = [
  { label: 'Latency', value: '12ms', tone: 'primary', progress: 15 },
  { label: 'Process Load', value: '84%', tone: 'primary', progress: 84, progressTone: 'error' },
  { label: 'Throughput', value: '4.2Gb/s', tone: 'primary' },
  { label: 'Error Rate', value: '0.002%', tone: 'success' },
]
