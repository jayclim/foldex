'use client'

import { Button } from './Button'
import { MaterialIcon } from './MaterialIcon'
import { sequenceRows, signalBars } from '../utils/analysisData'

export function SequenceAlignmentPanel() {
  return (
    <section className="glass-panel analysis-sequence-panel">
      <div className="analysis-dna-wave" />
      <div className="sequence-toolbar">
        <div>
          <span className="live-chip">LIVE STREAM</span>
          <span className="offset-label">OFFSET: 1,422,904 bp</span>
        </div>
        <div className="sequence-tools">
          <Button aria-label="Zoom in">
            <MaterialIcon name="zoom_in" />
          </Button>
          <Button aria-label="Fit sequence viewport">
            <MaterialIcon name="settings_overscan" />
          </Button>
        </div>
      </div>

      <div className="sequence-matrix">
        <SequenceRow row={sequenceRows[0]} />
        <div className="sequence-divider" />
        <SequenceRow row={sequenceRows[1]} />
        <div className="signal-bars" aria-hidden="true">
          {signalBars.map((height, index) => (
            <span
              className={index === 5 ? 'error' : undefined}
              key={`${height}-${index}`}
              style={{ height: `${height * 4}px` }}
            />
          ))}
        </div>
        <SequenceRow row={sequenceRows[2]} faded />
      </div>
    </section>
  )
}

type SequenceRowProps = {
  row: (typeof sequenceRows)[number]
  faded?: boolean
}

function SequenceRow({ row, faded }: SequenceRowProps) {
  return (
    <div className={faded ? 'sequence-row faded' : 'sequence-row'}>
      <span className={`sequence-label ${row.labelTone}`}>{row.label}</span>
      <div className="sequence-bases">
        {row.bases.map((base, index) => (
          <span
            className={index === row.mutationIndex ? 'base mutation' : `base ${row.baseTone}`}
            key={`${base}-${index}`}
            title={index === row.mutationIndex ? 'Mutation Detected' : undefined}
          >
            {base}
          </span>
        ))}
      </div>
    </div>
  )
}