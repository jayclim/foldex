'use client'

import { Button } from '../components/Button'

export function DashboardHeader() {
  return (
    <header className="top-bar">
      <div>
        <h2>Gene Variant Dashboard</h2>
        <p>
          For research support only: <span>not medical advice</span>
        </p>
      </div>
      <div className="top-actions">
        <div className="online-pill">
          <span />
          Demo Ready
        </div>
        <Button className="primary-button">Review Variant</Button>
      </div>
    </header>
  )
}
