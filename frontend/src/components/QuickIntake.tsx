import { useRef, useState } from 'react'
import { parseGeneMutationFromText, parseGeneMutationFromVcf } from '../utils/geneMutationParser'
import { Button } from './Button'
import { MaterialIcon } from './MaterialIcon'

type QuickIntakeProps = {
  onSubmit: (gene: string, mutation: string) => void
}

export function QuickIntake({ onSubmit }: QuickIntakeProps) {
  const [inputValue, setInputValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
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
    if (file.name.endsWith('.vcf') || file.type === 'text/plain') {
      const text = await file.text()
      try {
        const { gene, mutation } = parseGeneMutationFromVcf(text)
        onSubmit(gene, mutation)
      } catch {
        setError('Could not extract gene/mutation from VCF file.')
      }
    } else {
      setError('Supported formats: .vcf files or paste sequence text below.')
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
      >
        <MaterialIcon name="genetics" />
        <strong>Drop FASTQ / VCF files</strong>
        <small>Max payload 2.4GB</small>
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".vcf,.txt"
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
