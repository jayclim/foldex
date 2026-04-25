# Foldex Frontend

Vite + React + TypeScript frontend for Foldex, managed with Bun.

The Vite starter UI has been replaced with design-driven Foldex screens from `docs/design`.

## Routes

- `/`: dashboard
- `/analysis`: live analysis view
- `/reports`: report view

Routing is currently implemented in `src/App.tsx` with the browser History API. React Router is not installed.

## Structure

```text
src/
  App.tsx
  main.tsx
  index.css
  layouts/
    AppLayout.tsx
    SideNav.tsx
    DashboardHeader.tsx
    FloatingActionButton.tsx
    AnalysisFloatingActionButton.tsx
    Layout.css
  components/
    Button.tsx
    MaterialIcon.tsx
    ...page panels...
  pages/
    DashboardPage.tsx
    DashboardPage.css
    AnalysisPage.tsx
    AnalysisPage.css
    ReportsPage.tsx
    ReportsPage.css
  utils/
    dashboardData.ts
    analysisData.ts
    reportsData.ts
```

## Commands

```bash
bun install
bun run dev
bun run build
bun run lint
```

## Notes

- Current views use static mock data in `src/utils`.
- Shared shell/navigation styles live in `src/layouts/Layout.css`.
- Page-specific styles live beside each page.
- Backend integration has not been wired yet.
