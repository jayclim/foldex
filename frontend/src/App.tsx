import { useEffect, useState } from 'react'

// import { AnalysisPage } from './pages/AnalysisPage'
import { DashboardPage } from './pages/DashboardPage'
import { ReportsPage } from './pages/ReportsPage'

function App() {
  const [route, setRoute] = useState(window.location.pathname)

  useEffect(() => {
    const handleRouteChange = () => {
      setRoute(window.location.pathname)
    }

    window.addEventListener('popstate', handleRouteChange)
    return () => window.removeEventListener('popstate', handleRouteChange)
  }, [])

  // if (route === '/analysis') {
  //   return <AnalysisPage />
  // }

  if (route === '/reports') {
    return <ReportsPage />
  }

  return <DashboardPage />
}

export default App
