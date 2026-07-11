'use client'

import { Mol3DViewer } from './Mol3DViewer'

export function AnalysisProteinPreview() {
  return (
    <section className="glass-panel analysis-protein-preview">
      <div className="protein-preview-meta">
        <span>ALPHAFOLD PREVIEW</span>
        <small>FOLD_CONFIDENCE: 92.4%</small>
      </div>

      <Mol3DViewer
        pdbId="2LZM"
        defaultScheme="bfactor"
        label="3D protein structure analysis view"
        schemeBarClassName="analysis-scheme-bar"
      />
    </section>
  )
}