import { useEffect, useRef } from 'react'

type $3DmolViewer = {
  render: () => void
  zoomTo: () => void
  removeAllModels: () => void
  setStyle: (sel: object, style: object) => void
  addModel: (data: string, fmt: string) => void
}

export type ColorScheme = 'ss' | 'spectrum' | 'bfactor' | 'residue'

const STYLE_MAP: Record<ColorScheme, object> = {
  ss: { cartoon: { colorscheme: 'ssPyMol' } },
  spectrum: { cartoon: { color: 'spectrum' } },
  bfactor: {
    cartoon: {
      colorscheme: { prop: 'b', gradient: 'rwb', min: 0, max: 100 },
    },
  },
  residue: { cartoon: { colorscheme: 'amino' } },
}

export const COLOR_SCHEME_META: { id: ColorScheme; label: string; description: string }[] = [
  { id: 'ss', label: 'Structure', description: 'α-helices red · β-sheets yellow · loops white' },
  { id: 'spectrum', label: 'Sequence', description: 'N-terminus blue → C-terminus red' },
  { id: 'bfactor', label: 'Flexibility', description: 'Rigid blue → flexible red (B-factor)' },
  { id: 'residue', label: 'Residue', description: 'Amino acid chemical properties' },
]

export function use3DmolViewer(
  pdbId = '4HHB',
  colorScheme: ColorScheme = 'ss',
  pdbData?: string | null,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<$3DmolViewer | null>(null)
  const loadedRef = useRef(false)
  // Always current so init() applies the right scheme even if it changed during fetch
  const colorSchemeRef = useRef(colorScheme)
  colorSchemeRef.current = colorScheme

  useEffect(() => {
    if (!containerRef.current) return

    let cancelled = false

    async function init() {
      const $3Dmol = await import('3dmol')
      if (cancelled || !containerRef.current) return

      const viewer = $3Dmol.createViewer(containerRef.current, {
        backgroundColor: 'transparent',
        antialias: true,
      }) as $3DmolViewer

      viewerRef.current = viewer

      let data: string
      if (pdbData) {
        data = pdbData
      } else {
        const response = await fetch(`https://files.rcsb.org/download/${pdbId}.pdb`)
        if (cancelled) return
        data = await response.text()
      }
      if (cancelled) return

      viewer.removeAllModels()
      viewer.addModel(data, 'pdb')
      viewer.setStyle({}, STYLE_MAP[colorSchemeRef.current])
      viewer.zoomTo()
      viewer.render()
      loadedRef.current = true
    }

    init().catch(console.error)

    return () => {
      cancelled = true
      loadedRef.current = false
      viewerRef.current = null
      // Remove the canvas 3Dmol appended so a re-mount starts with a clean container
      containerRef.current?.querySelectorAll('canvas').forEach((c) => c.remove())
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdbId, pdbData])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !loadedRef.current) return
    viewer.setStyle({}, STYLE_MAP[colorScheme])
    viewer.render()
  }, [colorScheme])

  return containerRef
}
