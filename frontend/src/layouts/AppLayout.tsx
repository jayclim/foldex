import type { ReactNode } from 'react'

import { SideNav } from './SideNav'
import './Layout.css'

type AppLayoutProps = {
  activePage: string
  children?: ReactNode
  header?: ReactNode
  floatingAction?: ReactNode
  mainClassName?: string
}

export function AppLayout({
  activePage,
  children,
  header,
  floatingAction,
  mainClassName,
}: AppLayoutProps) {
  return (
    <div className="dashboard-shell">
      <SideNav activePage={activePage} />

      <main className={mainClassName ? `dashboard-main ${mainClassName}` : 'dashboard-main'}>
        {header}
        {children}
      </main>

      {floatingAction}
    </div>
  )
}
