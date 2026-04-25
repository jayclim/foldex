import type { AnalysisResult } from '../api/analysisApi'
import { useState } from 'react'
import { Button } from './Button'
import { MaterialIcon } from './MaterialIcon'
import { Mol3DViewer } from './Mol3DViewer'
import { structureControls, structureModes } from '../utils/reportsData'

type ReportStructurePanelProps = {
  result?: AnalysisResult | null
}

export function ReportStructurePanel({ result }: ReportStructurePanelProps) {
  const [activeMode, setActiveMode] = useState('Ribbon')
  const pdbData = result?.structures?.unknown_variant?.pdb
  const wildPdb = result?.structures?.wild_type?.pdb
  const showWild = activeMode === 'Surface'

  const structFeat = result?.annotations?.features?.structure
  const mut = result?.annotations?.features?.mutation

  return (
    <section className="glass-panel report-structure-panel">
      <div className="structure-mode-panel">
        <p>Structure View</p>
        <div>
          {structureModes.map((mode) => (
            <Button
              className={activeMode === mode.label ? 'structure-mode active' : 'structure-mode'}
              key={mode.label}
              onClick={() => setActiveMode(mode.label)}
            >
              <MaterialIcon name={mode.icon} />
              {mode.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="structure-controls">
        {structureControls.map((control) => (
          <Button aria-label={control.replaceAll('_', ' ')} key={control}>
            <MaterialIcon name={control} />
          </Button>
        ))}
      </div>

      {(pdbData || wildPdb) ? (
        <div className="report-mol-viewer">
          <Mol3DViewer
            pdbData={showWild ? (wildPdb ?? undefined) : (pdbData ?? undefined)}
            defaultScheme="ss"
            className="mol3d-canvas"
          />
        </div>
      ) : (
        <div className="report-protein-art" aria-hidden="true">
          <span className="report-ring ring-a" />
          <span className="report-ring ring-b" />
          <span className="report-ring ring-c" />
          <span className="report-strand strand-a" />
          <span className="report-strand strand-b" />
          <span className="mutation-target">
            <span />
          </span>
        </div>
      )}

      <div className="structure-hud">
        {structFeat ? (
          <>
            <p>RESIDUES: {structFeat.residue_count ?? '—'} | ATOMS: {structFeat.atom_count ?? '—'}</p>
            <p>
              RG: {structFeat.radius_of_gyration_angstrom != null
                ? `${structFeat.radius_of_gyration_angstrom.toFixed(2)}Å`
                : '—'}{' '}
              | CHAINS: {structFeat.chains?.join(', ') ?? '—'}
            </p>
            <p>
              RESIDUE: {mut?.alternate_aa ?? '?'}{mut?.protein_position ?? ''} (MUTANT)
            </p>
          </>
        ) : (
          <>
            <p>COORD: X-104.32 Y+22.91 Z-0.12</p>
            <p>RMSD: 0.42A | pLDDT: 92.4</p>
            <p>RESIDUE: ASP234 (MUTANT)</p>
          </>
        )}
      </div>
    </section>
  )
}
