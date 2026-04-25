import { Button } from '../components/Button'
import { MaterialIcon } from '../components/MaterialIcon'

export function AnalysisFloatingActionButton() {
  return (
    <Button className="analysis-fab" aria-label="Add analysis item">
      <MaterialIcon name="add_circle" />
    </Button>
  )
}
