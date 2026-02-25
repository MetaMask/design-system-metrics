# Dashboard Implementation Plan

## Overview

Create an interactive web dashboard to visualize design system migration metrics with historical tracking and data visualization.

## Tech Stack

- **Framework**: Vite + React + TypeScript
- **Charts**: Recharts (lightweight, React-native charting library)
- **Hosting**: GitHub Pages (free, integrated with existing workflow)
- **Data Source**: XLSX files (source of truth) → JSON (derived at build time)

## Architecture

### Data Flow

```
Weekly GitHub Action
  ↓
Generate XLSX Files
  ↓
Extract JSON Data (ExcelJS)
  ↓
Aggregate Timeline Data
  ↓
Build Vite Dashboard
  ↓
Deploy to GitHub Pages
```

### File Structure

```
design-system-metrics/
├── dashboard/                          # Vite + React dashboard
│   ├── src/
│   │   ├── components/                 # Reusable UI components
│   │   │   ├── MetricsCard.tsx        # Summary stat cards
│   │   │   ├── TrendChart.tsx         # Line chart for trends
│   │   │   ├── ProgressGauge.tsx      # Migration progress visual
│   │   │   └── ComponentTable.tsx     # Sortable component list
│   │   ├── pages/                      # Main dashboard pages
│   │   │   ├── Overview.tsx           # High-level summary
│   │   │   ├── Mobile.tsx             # Mobile deep dive
│   │   │   ├── Extension.tsx          # Extension deep dive
│   │   │   └── Historical.tsx         # Time series views
│   │   ├── hooks/
│   │   │   └── useMetricsData.ts      # Data fetching logic
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── public/
│   ├── package.json
│   └── vite.config.ts
│
├── metrics/                            # Data files
│   ├── *.xlsx                         # Source of truth (Excel files)
│   ├── *-data.json                    # Per-week detailed data
│   ├── timeline.json                  # Aggregated time series
│   └── index.json                     # Manifest of available data
│
└── scripts/                            # Build scripts
    ├── xlsx-to-json.js                # Extract JSON from XLSX
    ├── update-timeline.js             # Aggregate historical data
    └── [existing scripts]
```

## Implementation Phases

### Phase 1: Data Extraction Pipeline ✅

**Goal**: Convert XLSX files to JSON for dashboard consumption

#### 1.1 Create `scripts/xlsx-to-json.js` ✅
- Parse XLSX files using ExcelJS
- Extract component-level data:
  - Component name
  - MMDS instances
  - Deprecated instances
  - Replacement mapping
  - Migration status
- Calculate summary statistics:
  - Total components
  - Total instances
  - Migration percentage
  - Fully migrated count
  - In progress count
  - Not started count
- Output: `metrics/{project}-metrics-{date}-data.json`

#### 1.2 Create `scripts/update-timeline.js` ⏳
- Scan all `*-data.json` files in metrics/
- Build time series dataset:
  - Array of dates
  - Migration percentages over time
  - Instance counts over time
  - Week-over-week changes
- Generate two files:
  - `metrics/timeline.json`: Aggregated time series data
  - `metrics/index.json`: Manifest of available weeks

#### 1.3 Backfill Historical Data ⏳
- Run extraction on existing XLSX files:
  - mobile-component-metrics-2026-02-23.xlsx
  - mobile-component-metrics-2026-02-24.xlsx
  - extension-component-metrics-2026-02-23.xlsx
  - extension-component-metrics-2026-02-24.xlsx
- Verify JSON output quality
- Generate initial timeline

### Phase 2: Dashboard Setup ⏳

**Goal**: Initialize Vite project with routing and basic layout

#### 2.1 Initialize Vite Project
```bash
cd /Users/georgemarshall/Sites/design-system-metrics
npm create vite@latest dashboard -- --template react-ts
cd dashboard
npm install
```

#### 2.2 Install Dependencies
```bash
npm install recharts react-router-dom
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

#### 2.3 Configure for GitHub Pages
- Update `vite.config.ts`:
  - Set `base: '/design-system-metrics/'` for repo deployment
  - Configure build output
- Update `package.json` scripts:
  - `build`: Build for production
  - `preview`: Preview production build

#### 2.4 Create Basic Layout
- Header with navigation
- Responsive sidebar menu
- Main content area
- Footer with metadata

### Phase 3: Dashboard Pages & Visualizations ⏳

#### 3.1 Overview Dashboard (Priority 1)

**Key Metrics Cards:**
- Total components (Mobile + Extension)
- Average migration percentage
- Total MMDS instances in use
- Total deprecated instances remaining

**Visualizations:**
- Side-by-side comparison: Mobile vs Extension
  - Progress bars showing migration %
  - Instance counts
- Weekly trend line chart (last 12 weeks)
  - Migration percentage over time
  - Separate lines for Mobile and Extension

**Quick Stats:**
- Components fully migrated
- Components in progress
- Components not started

#### 3.2 Mobile Deep Dive (Priority 2)

**Header Section:**
- Project name and last updated date
- Key stats: total components, migration %, instances

**Migration Progress:**
- Large progress gauge/circular chart
- Breakdown: Fully Migrated / In Progress / Not Started

**Component Breakdown Table:**
- Columns: Component, MMDS Instances, Deprecated Instances, Total, Migration %
- Features: Sortable, searchable, filterable
- Visual indicators: status badges

**Charts:**
- Stacked bar chart: MMDS vs Deprecated instances per component
- Top 10 components by usage
- Top 10 unmigrated components

#### 3.3 Extension Deep Dive (Priority 2)

Same structure as Mobile page, but for Extension data.

#### 3.4 Historical Trends (Priority 3)

**Time Series Charts:**
- Migration percentage over time (line chart)
- Instance counts over time (stacked area chart)
- Components migrated per week (bar chart)

**Metrics:**
- Week-over-week change indicators
- Migration velocity (components/week)
- Projected completion date (if linear)

**Comparison View:**
- Mobile vs Extension historical comparison
- Overlay both projects on same chart

### Phase 4: CI/CD Integration ⏳

**Goal**: Automate dashboard updates via GitHub Actions

#### 4.1 Update `.github/workflows/weekly-metrics.yml`

Add steps after XLSX generation:

```yaml
- name: Extract JSON from XLSX
  run: node scripts/xlsx-to-json.js

- name: Update timeline data
  run: node scripts/update-timeline.js

- name: Build dashboard
  run: |
    cd dashboard
    npm ci
    npm run build

- name: Deploy to GitHub Pages
  uses: peaceiris/actions-gh-pages@v3
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    publish_dir: ./dashboard/dist
```

#### 4.2 Configure GitHub Pages

- Enable GitHub Pages in repository settings
- Set source to `gh-pages` branch
- Dashboard will be available at: `https://georgewrmarshall.github.io/design-system-metrics/`

#### 4.3 Test End-to-End

- Trigger workflow manually
- Verify:
  - XLSX files generated
  - JSON files extracted
  - Timeline updated
  - Dashboard built
  - Deployed to GitHub Pages
  - Data displays correctly

## Key Design Decisions

### 1. Build-Time vs Runtime Data Processing

**Decision**: Build-time processing

**Rationale**:
- No XLSX parsing library in browser (saves ~1MB bundle)
- Faster page loads (data pre-processed as JSON)
- Perfect fit for static site generation
- Simpler deployment (no server needed)

### 2. XLSX as Source of Truth

**Decision**: Keep XLSX files, generate JSON as derived data

**Rationale**:
- Excel files are human-readable for stakeholders
- Can be opened in Excel for ad-hoc analysis
- Contains more detail than JSON summaries
- JSON can be regenerated anytime from XLSX

### 3. Data Storage Strategy

**Decision**: Individual JSON files per week + aggregated timeline

**Files**:
- `metrics/mobile-metrics-2026-02-24-data.json` (detailed, per week)
- `metrics/extension-metrics-2026-02-24-data.json`
- `metrics/timeline.json` (aggregated time series)
- `metrics/index.json` (manifest)

**Rationale**:
- Efficient loading (only fetch what's needed)
- Good caching (each week cached separately)
- Timeline pre-aggregated for fast chart rendering
- Scalable as data grows

### 4. Charting Library: Recharts

**Decision**: Recharts over Chart.js, D3, or Tremor

**Rationale**:
- Built specifically for React (declarative API)
- Small bundle size (25KB gzipped)
- Perfect for our chart types (line, bar, pie, area)
- Good TypeScript support
- Easy to customize and theme
- Active maintenance

### 5. Hosting: GitHub Pages

**Decision**: GitHub Pages over Vercel, Netlify, or Cloudflare Pages

**Rationale**:
- Completely free
- Integrated with existing GitHub workflow
- Automatic HTTPS
- No external account needed
- Fast CDN delivery
- Perfect for open-source projects

## Data Schema

### Component Data JSON (`*-data.json`)

```json
{
  "project": "mobile",
  "date": "2026-02-24",
  "generatedAt": "2026-02-24T16:00:00Z",
  "summary": {
    "totalComponents": 24,
    "mmdsInstances": 1897,
    "deprecatedInstances": 3168,
    "totalInstances": 5065,
    "migrationPercentage": "37.46",
    "fullyMigrated": 5,
    "inProgress": 15,
    "notStarted": 4
  },
  "components": [
    {
      "name": "Button",
      "mmdsInstances": 234,
      "deprecatedInstances": 567,
      "totalInstances": 801,
      "migrationPercentage": "29.21",
      "replacement": "@metamask/design-system-react-native/Button",
      "status": "in-progress"
    }
  ]
}
```

### Timeline JSON (`timeline.json`)

```json
{
  "mobile": {
    "dates": ["2026-02-17", "2026-02-24"],
    "migrationPercentage": [36.5, 37.46],
    "mmdsInstances": [1850, 1897],
    "deprecatedInstances": [3200, 3168],
    "totalInstances": [5050, 5065],
    "componentsFullyMigrated": [4, 5],
    "componentsInProgress": [14, 15]
  },
  "extension": {
    "dates": ["2026-02-17", "2026-02-24"],
    "migrationPercentage": [26.5, 26.91],
    "mmdsInstances": [1400, 1436],
    "deprecatedInstances": [3900, 3852],
    "totalInstances": [5300, 5288],
    "componentsFullyMigrated": [3, 3],
    "componentsInProgress": [10, 12]
  }
}
```

### Index JSON (`index.json`)

```json
{
  "lastUpdated": "2026-02-24T16:00:00Z",
  "projects": {
    "mobile": [
      {
        "date": "2026-02-17",
        "file": "mobile-component-metrics-2026-02-17-data.json"
      },
      {
        "date": "2026-02-24",
        "file": "mobile-component-metrics-2026-02-24-data.json"
      }
    ],
    "extension": [
      {
        "date": "2026-02-17",
        "file": "extension-component-metrics-2026-02-17-data.json"
      },
      {
        "date": "2026-02-24",
        "file": "extension-component-metrics-2026-02-24-data.json"
      }
    ]
  }
}
```

## Timeline

- **Phase 1**: 2-3 hours (Data extraction)
- **Phase 2**: 2-3 hours (Dashboard setup)
- **Phase 3**: 4-6 hours (Visualizations)
- **Phase 4**: 1-2 hours (CI/CD)
- **Total**: 9-14 hours

## Success Metrics

- Dashboard loads in < 2 seconds
- All historical data visualized correctly
- Automated weekly updates working
- Zero hosting costs
- Mobile responsive design
- Accessible to stakeholders without technical knowledge

## Future Enhancements

- Add component-level detail pages
- Show file-level usage (which files use which components)
- Add export functionality (PNG/PDF reports)
- Add annotations (mark important milestones)
- Team/project breakdowns
- Custom date range selection
- Comparison between arbitrary date ranges

## Resources

- **Recharts Documentation**: https://recharts.org/
- **Vite Documentation**: https://vitejs.dev/
- **GitHub Actions for Pages**: https://github.com/peaceiris/actions-gh-pages
- **ExcelJS Documentation**: https://github.com/exceljs/exceljs
- **SheetJS Documentation**: https://docs.sheetjs.com/

## Notes

- Keep dashboard simple and focused on key metrics
- Prioritize performance (build-time processing)
- Ensure accessibility (keyboard navigation, screen readers)
- Make it mobile-friendly
- Use clear, professional visualizations
- Avoid feature creep - start minimal, iterate based on feedback
