import { Button } from './Button'

export function AnalysisProteinPreview() {
  return (
    <section className="glass-panel analysis-protein-preview">
      <div className="protein-preview-meta">
        <span>ALPHAFOLD PREVIEW</span>
        <small>FOLD_CONFIDENCE: 92.4%</small>
      </div>
      <Button className="render-button">RENDER 8K</Button>
      <div className="analysis-protein-art" aria-hidden="true">
        <span className="protein-ring ring-one" />
        <span className="protein-ring ring-two" />
        <span className="protein-ring ring-three" />
        <span className="protein-strand strand-one" />
        <span className="protein-strand strand-two" />
      </div>
    </section>
  )
}
