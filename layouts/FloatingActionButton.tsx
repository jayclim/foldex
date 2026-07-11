'use client'

import { Button } from '../components/Button'
import { MaterialIcon } from '../components/MaterialIcon'

export function FloatingActionButton() {
  return (
    <Button className="fab" aria-label="Open analysis tools">
      <MaterialIcon name="biotech" />
    </Button>
  )
}