import { Button } from './Button'
import { MaterialIcon } from './MaterialIcon'
import { structureControls, structureModes } from '../utils/reportsData'

export function ReportStructurePanel() {
  return (
    <section className="glass-panel report-structure-panel">
      <div className="structure-mode-panel">
        <p>Structure View</p>
        <div>
          {structureModes.map((mode) => (
            <Button className={mode.active ? 'structure-mode active' : 'structure-mode'} key={mode.label}>
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

      <div className="structure-hud">
        <p>COORD: X-104.32 Y+22.91 Z-0.12</p>
        <p>RMSD: 0.42A | pLDDT: 92.4</p>
        <p>RESIDUE: ASP234 (MUTANT)</p>
      </div>
    </section>
  )
}
