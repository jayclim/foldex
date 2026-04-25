import { Mol3DViewer } from './Mol3DViewer'

type ProteinViewerProps = {
  pdbData?: string | null
  label?: string
}

export function ProteinViewer({ pdbData, label }: ProteinViewerProps) {
  return (
    <div className="protein-viewer">
      <Mol3DViewer pdbData={pdbData ?? null} pdbId={pdbData ? undefined : '4HHB'} defaultScheme="ss" />

      <div className="viewer-status">
        <p>{label ?? 'ESMFOLD PREDICTION'}</p>
        <div>
          <span>{pdbData ? 'ESMFold Structure' : 'Demo: 4HHB'}</span>
          <div className="confidence-dots" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            {!pdbData && <span className="inactive" />}
          </div>
        </div>
      </div>
    </div>
  )
}
