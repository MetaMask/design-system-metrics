# Automated Config Sync - Implementation Plan

## Overview

Automate the generation of `config.json` by scanning MetaMask repositories for deprecated components and their MMDS replacements.

## Goals

1. **Auto-discover deprecated components** from Extension and Mobile codebases
2. **Extract MMDS component lists** from design-system packages
3. **Intelligently map** deprecated components to their MMDS replacements
4. **Preserve manual overrides** in config.json
5. **Keep config.json up-to-date** as repos evolve

## Architecture

### Repository Structure

```
design-system-metrics/
├── repos/                          # Git submodules
│   ├── metamask-mobile/
│   ├── metamask-extension/
│   └── metamask-design-system/
├── scripts/
│   ├── sync-config.js             # Main orchestrator
│   └── lib/
│       ├── scanner.js             # Scan for @deprecated tags
│       ├── mmds-fetcher.js        # Extract MMDS components
│       ├── component-mapper.js    # Map deprecated → MMDS
│       └── config-merger.js       # Merge with existing config
├── config.json                     # Auto-generated + manual overrides
├── index.js                        # Existing metrics tool
└── PLAN.md                         # This file
```

### Git Submodules

Three repos added as submodules in `repos/`:
- `metamask-mobile`
- `metamask-extension`
- `metamask-design-system`

**Commands:**
```bash
yarn setup-repos     # git submodule init && update
yarn update-repos    # git submodule update --remote --merge
```

## Data Sources

### Deprecated Components (Source)

**Extension:**
- `repos/metamask-extension/ui/components/component-library/**/*.{js,jsx,ts,tsx}`
- `repos/metamask-extension/ui/components/ui/**/*.{js,jsx,ts,tsx}`
- `repos/metamask-extension/ui/components/**/*.{js,jsx,ts,tsx}` (catch-all for icon libs)

**Mobile:**
- `repos/metamask-mobile/app/component-library/**/*.{js,jsx,ts,tsx}`
- `repos/metamask-mobile/app/components/UI/**/*.{js,jsx,ts,tsx}`
- `repos/metamask-mobile/app/components/**/*.{js,jsx,ts,tsx}` (catch-all)

### MMDS Components (Target)

**React:**
- `repos/metamask-design-system/packages/design-system-react/src/components/index.ts`

**React Native:**
- `repos/metamask-design-system/packages/design-system-react-native/src/components/index.ts`

### Usage Scanning (for metrics)

**Extension:**
- `repos/metamask-extension/ui/components/**/*.{js,jsx,ts,tsx}`
- Exclude: `ui/components/component-library/**`

**Mobile:**
- `repos/metamask-mobile/app/components/**/*.{js,jsx,ts,tsx}`
- Exclude: `app/component-library/**`

## Detection Patterns

### @deprecated JSDoc Pattern

**Extension Example:**
```javascript
/**
 * @deprecated
 * The <Button /> component has been deprecated in favor of the new <Button>
 * component from the component-library.
 * Please update your code to use the new <Button> component instead, which can be found at
 * ./ui/components/component-library/button/button.js
 * You can find documentation for the new Button component in the MetaMask Storybook:
 * {@link https://metamask.github.io/metamask-storybook/}
 */
```

**Mobile Example:**
```typescript
/**
 * @deprecated Please update your code to use `Button` from `@metamask/design-system-react-native`
 */
```

### Regex Patterns

```javascript
// Match MMDS package references
/@deprecated.*?@metamask\/design-system-react(-native)?/i

// Extract replacement component and package
/@deprecated.*?use\s+`?(\w+)`?\s+from\s+`?(@metamask\/design-system[^`\s]+)/i

// Extract component-library paths
/component-library\/([^/\s]+)/
```

## Component Mapping Logic

### Priority Order

1. **Explicit MMDS hint** in @deprecated message
   - "use Button from @metamask/design-system-react" → Button

2. **Component-library path** with MMDS match
   - component-library/button → check if "Button" exists in MMDS

3. **Manual mapping table** (special cases)
   - ButtonLink → TextButton
   - SiteOrigin → AvatarFavicon
   - FeatherIcon/FontAwesomeIcon/IonicIcon → Icon

4. **Exact name match** in MMDS components
   - Icon → Icon (if exists in MMDS)

5. **No replacement** (null)
   - Component exists in component-library but not in MMDS yet

### Special Cases Map

```javascript
const MANUAL_MAPPINGS = {
  // Extension
  'ButtonLink': { component: 'TextButton', package: '@metamask/design-system-react' },
  'ButtonPrimary': { component: 'Button', package: '@metamask/design-system-react' },
  'ButtonSecondary': { component: 'Button', package: '@metamask/design-system-react' },
  'SiteOrigin': { component: 'AvatarFavicon', package: '@metamask/design-system-react' },
  'FeatherIcon': { component: 'Icon', package: '@metamask/design-system-react' },
  'FontAwesomeIcon': { component: 'Icon', package: '@metamask/design-system-react' },
  'IonicIcon': { component: 'Icon', package: '@metamask/design-system-react' },
  'SimpleLineIconsIcon': { component: 'Icon', package: '@metamask/design-system-react' },

  // Mobile
  'BadgeNotifications': { component: 'BadgeCount', package: '@metamask/design-system-react-native' },
  'SheetBottom': { component: 'BottomSheet', package: 'component-library', path: 'app/component-library/components/BottomSheets/BottomSheet' },
  'SheetHeader': { component: 'BottomSheetHeader', package: 'component-library', path: 'app/component-library/components/BottomSheets/BottomSheetHeader' },
};
```

## Config Merge Strategy

### Auto-Generated Flag

```json
{
  "deprecatedComponents": {
    "Icon": {
      "paths": ["ui/components/component-library/icon"],
      "replacement": {
        "component": "Icon",
        "package": "@metamask/design-system-react"
      },
      "_autoGenerated": true
    },
    "SiteOrigin": {
      "paths": ["ui/components/ui/site-origin"],
      "replacement": {
        "component": "AvatarFavicon",
        "package": "@metamask/design-system-react"
      },
      "_autoGenerated": false
    }
  }
}
```

### Merge Logic

1. **Load existing config.json**
2. **For each discovered deprecated component:**
   - If component exists in config AND `_autoGenerated: false` → **SKIP** (manual override)
   - If component exists in config AND `_autoGenerated: true` → **UPDATE** (refresh from code)
   - If component doesn't exist → **ADD** (new discovery)
3. **Preserve manual overrides** at all costs
4. **Write merged config** back to config.json

## Workflow

### Regular Usage

```bash
# 1. Update repos (pull latest from GitHub)
yarn update-repos

# 2. Sync config (auto-generate config.json)
yarn sync-config

# 3. Generate metrics (run existing tool)
yarn metrics --project extension
yarn metrics --project mobile
```

### One-Time Setup

```bash
# Clone submodules
yarn setup-repos
```

## Script Implementations

### 1. scripts/sync-config.js

Main orchestrator:
1. Update git submodules
2. Scan for deprecated components
3. Fetch MMDS components
4. Map deprecated → MMDS
5. Merge with existing config
6. Write config.json
7. Print summary report

### 2. scripts/lib/scanner.js

**Input:** Repo path, glob patterns
**Output:** Array of discovered components

```javascript
{
  name: 'ButtonPrimary',
  filePath: 'ui/components/component-library/button-primary/button-primary.tsx',
  deprecationMessage: '...',
  replacementHint: 'Button from @metamask/design-system-react',
  project: 'extension'
}
```

**Logic:**
- Recursively glob files
- Parse each file's AST
- Find @deprecated JSDoc tags
- Extract component name, paths, hints

### 3. scripts/lib/mmds-fetcher.js

**Input:** Path to MMDS repo
**Output:** Lists of available components

```javascript
{
  react: ['Button', 'Icon', 'Text', 'Box', ...],
  reactNative: ['Button', 'Icon', 'Text', 'Box', 'BottomSheet', ...]
}
```

**Logic:**
- Read index.ts files
- Parse export statements
- Extract component names

### 4. scripts/lib/component-mapper.js

**Input:** Discovered component, MMDS lists, manual mappings
**Output:** Replacement object or null

```javascript
{
  component: 'Button',
  package: '@metamask/design-system-react'
}
// or
{
  component: 'BottomSheet',
  package: 'component-library',
  path: 'app/component-library/components/BottomSheets/BottomSheet'
}
// or
null
```

**Logic:**
- Check manual mappings first
- Parse deprecation message for hints
- Match against MMDS components
- Return best match or null

### 5. scripts/lib/config-merger.js

**Input:** Existing config, discovered components, mappings
**Output:** Merged config object

**Logic:**
- Preserve manual overrides (`_autoGenerated: false`)
- Update auto-generated entries
- Add new discoveries
- Return merged config

## Testing Strategy

### Test Cases

1. **Manual override preservation**
   - Verify SiteOrigin → AvatarFavicon mapping isn't overwritten

2. **New component discovery**
   - Add new @deprecated tag to extension
   - Run sync-config
   - Verify component added to config

3. **Path updates**
   - Move component file
   - Run sync-config
   - Verify path updated in config

4. **Replacement updates**
   - Change @deprecated message
   - Run sync-config
   - Verify replacement updated (if auto-generated)

### Dry-Run Mode

Add `--dry-run` flag:
```bash
yarn sync-config --dry-run
```

Prints changes without writing config.json

## Future Enhancements

### Dashboard (Future)

- Web UI to visualize migration progress
- Interactive component mapping
- Approve/reject auto-generated mappings

### Cron Job (Future)

- Weekly automated runs
- GitHub Actions workflow
- Auto-commit updated config
- Generate metrics spreadsheets
- Post to Slack/notifications

### Validation

- Detect conflicts (multiple components → same MMDS)
- Warn about missing MMDS replacements
- Validate config.json schema

## Dependencies

**New npm packages needed:**
- `@babel/parser` (already installed)
- `@babel/traverse` (already installed)
- `glob` (already installed)
- `chalk` (already installed)

**No new dependencies required!**

## Timeline

1. ✅ Research complete
2. 🔄 Git submodules setup
3. ⏳ Scanner implementation
4. ⏳ MMDS fetcher implementation
5. ⏳ Mapper implementation
6. ⏳ Merger implementation
7. ⏳ Main orchestrator
8. ⏳ Testing
9. ⏳ Documentation

**Estimated completion:** 1-2 hours

## Success Criteria

1. ✅ Config.json auto-generates from source code
2. ✅ Manual overrides preserved
3. ✅ All current components tracked
4. ✅ Icon library deprecations detected
5. ✅ New deprecations auto-discovered
6. ✅ Metrics tool works with generated config

## Notes

- Git submodules update manually (not auto-pull)
- Scanning is fast (~1-2 seconds per repo)
- Config merge is safe (preserves overrides)
- Can run sync-config anytime to refresh
