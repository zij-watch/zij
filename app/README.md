# Zij app

Next.js (App Router, TypeScript), MapLibre GL JS and Apache ECharts. It reads only the files in `public/data/`, which the pipeline writes (`docs/event/DATA_CONTRACT.md`).

```powershell
pnpm install
pnpm dev      # http://localhost:3000
pnpm build
```

- `app/`: the three pages: Explore (`/`), Downloads (`/downloads`), How it works (`/how-it-works`).
- `components/`: the map, the calendar, the side panel, the charts.
- `lib/tokens.ts`: every colour and font. `lib/map/style.ts`: all basemap styling; `getBasemapStyle(theme, basemap)` is the only place a basemap is made or swapped. `lib/map/layers.ts`: the data layers, which sit on any basemap.
- `lib/url.ts`: the state kept in the URL (`area`, `from`, `to`, `view`, `month`, `basemap`).

Fonts are bundled from `@fontsource` packages, so a build needs no network.
