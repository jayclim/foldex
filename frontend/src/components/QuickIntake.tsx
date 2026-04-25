import { useRef, useState } from 'react'
import { parseGeneMutationFromText, parseGeneMutationFromVcf, parseGeneMutationFromPdfBytes } from '../utils/geneMutationParser'
import { Button } from './Button'
import { MaterialIcon } from './MaterialIcon'

type QuickIntakeProps = {
  onSubmit: (gene: string, mutation: string) => void
}

export function QuickIntake({ onSubmit }: QuickIntakeProps) {
  const [inputValue, setInputValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isParsing, setIsParsing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleTextSubmit() {
    setError(null)
    const text = inputValue.trim()
    if (!text) return
    try {
      const { gene, mutation } = parseGeneMutationFromText(text)
      console.log('[QuickIntake] submitting', { gene, mutation })
      onSubmit(gene, mutation)
      setInputValue('')
    } catch {
      setError('Could not parse gene/mutation. Try: "BRCA1 c.5096G>A" or "TP53 p.R175H"')
    }
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault()
    handleTextSubmit()
  }

  async function handleFile(file: File) {
    setError(null)
    const lowerName = file.name.toLowerCase()

    if (lowerName.endsWith('.pdf') || file.type === 'application/pdf') {
      setIsParsing(true)
      try {
        const arrayBuffer = await file.arrayBuffer()
        const { gene, mutation } = await parseGeneMutationFromPdfBytes(arrayBuffer)
        console.log('[QuickIntake] PDF parsed', { gene, mutation })
        onSubmit(gene, mutation)
      } catch {
        setError('Could not extract gene/mutation from PDF. Ensure the report contains variant data.')
      } finally {
        setIsParsing(false)
      }
    } else if (lowerName.endsWith('.vcf') || file.type === 'text/plain') {
      try {
        const text = await file.text()
        const { gene, mutation } = parseGeneMutationFromVcf(text)
        onSubmit(gene, mutation)
      } catch {
        setError('Could not extract gene/mutation from VCF file.')
      }
    } else {
      setError('Supported formats: .pdf, .vcf files or paste sequence text below.')
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  return (
    <div className="glass-panel intake-panel">
      <div className="scan-line" />
      <h3>
        <MaterialIcon name="upload_file" />
        Quick Intake
      </h3>
      <Button
        type="button"
        className={`drop-zone${isDragging ? ' dragging' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        disabled={isParsing}
      >
        <MaterialIcon name="genetics" />
        <strong>{isParsing ? 'Parsing PDF…' : 'Drop PDF / VCF files'}</strong>
        <small>Genetic reports, VCF exports</small>
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".vcf,.txt,.pdf"
        style={{ display: 'none' }}
        onChange={handleFileInput}
      />
      <form className="sequence-entry" onSubmit={handleFormSubmit}>
        <span className="sr-only">
          <label htmlFor="quick-intake-input">Enter sequence string</label>
        </span>
        <input
          id="quick-intake-input"
          placeholder="e.g. BRCA1 c.5096G>A or TP53 p.R175H"
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
        />
        <Button type="submit" aria-label="Submit sequence">
          <MaterialIcon name="send" />
        </Button>
      </form>
      {error && <p className="intake-error">{error}</p>}
    </div>
  )
}
