# **@georgewrmarshall/design-system-metrics**

A CLI tool to audit design system component usage and track migration progress across MetaMask codebases. Identifies deprecated local component usage, tracks intermediate migrations, and measures adoption of the new MetaMask Design System (MMDS) NPM packages.

## **Getting Started**

- [Extension](#extension)
- [Mobile](#mobile)
- [CLI Options](#cli-options)
- [Features](#features)
- [Output Files](#output-files)
- [Configuration](#configuration)
- [Requirements](#requirements)

---

### **Extension**

1. **Clone the [MetaMask Extension](https://github.com/MetaMask/metamask-extension)** repository if you haven't already:

```bash
git clone https://github.com/MetaMask/metamask-extension.git
cd metamask-extension
```

2. **Run the CLI tool using npx:**

```bash
npx @georgewrmarshall/design-system-metrics --project extension
```

3. An XLSX file will be generated in the current directory:
   - `extension-component-metrics.xlsx` - Multi-sheet workbook with migration progress, path-level details, and MMDS usage

---

### **Mobile**

1. **Clone the [MetaMask Mobile](https://github.com/MetaMask/metamask-mobile)** repository if you haven't already:

```bash
git clone https://github.com/MetaMask/metamask-mobile.git
cd metamask-mobile
```

2. **Run the CLI tool using npx:**

```bash
npx @georgewrmarshall/design-system-metrics --project mobile
```

3. An XLSX file will be generated in the current directory:
   - `mobile-component-metrics.xlsx` - Multi-sheet workbook with migration progress, path-level details, and MMDS usage

---

### **CLI Options**

- **`--project` (Required)**: Specify the project to audit. Options are:
  - `extension`: For MetaMask Extension
  - `mobile`: For MetaMask Mobile

  Example:
  ```bash
  npx @georgewrmarshall/design-system-metrics --project extension
  ```

- **`--config` (Optional)**: Path to custom configuration file

  Example:
  ```bash
  npx @georgewrmarshall/design-system-metrics --project extension --config ./custom-config.json
  ```

---

### **Features**

#### **Multi-Path Component Tracking**
Track component usage across multiple old implementations migrating to MMDS:

- **Multiple deprecated paths**: Track usage from really old UI components AND old component-library versions
- **Path-level breakdowns**: See which specific implementation path has the most usage
- **Accurate migration metrics**: Calculate migration progress across all deprecated versions

**Example:**
```
Button from ui/components/ui/button: 15 uses (really old)
Button from component-library/Button: 42 uses (old)
Button from @metamask/design-system-react: 23 uses (new MMDS)

Migration Progress: 23 / (15 + 42 + 23) = 28.75%
```

#### **Intermediate Migration Tracking**
Some components migrate to component-library first before going to MMDS:

```
Popover (ui/components/ui/popover) → Modal (component-library) → (future MMDS migration)
```

The tool identifies these intermediate migrations and reports them separately so you can track the full migration journey.

#### **No Replacement Tracking**
Some deprecated components don't have direct MMDS replacements yet. The tool identifies and reports these separately:

```
TextField - No direct MMDS replacement (custom implementation needed)
```

#### **Detailed XLSX Reports**
Generate comprehensive Excel workbooks with 5 sheets:

1. **Migration Progress**: Components migrating to MMDS with % complete
2. **Intermediate Migrations**: Components with intermediate component-library steps
3. **Path-Level Detail**: Usage broken down by specific import paths
4. **MMDS Usage**: Current MMDS component adoption
5. **No Replacement**: Components needing custom migration approaches

---

### **Output Files**

The tool generates an XLSX workbook with multiple sheets providing different views of your migration progress.

#### **Sheet 1: Migration Progress**
Tracks components migrating directly to MMDS packages.

| Deprecated Component | Source Paths | MMDS Component | Deprecated Instances | MMDS Instances | Migrated % |
|---------------------|--------------|----------------|---------------------|----------------|------------|
| Button | ui/components/ui/button, component-library/button | Button | 57 | 23 | 28.75% |
| Icon | component-library/icon | Icon | 142 | 89 | 38.52% |

#### **Sheet 2: Intermediate Migrations**
Shows components migrating to component-library before eventual MMDS migration.

| Old Component | Old Path | New Component | New Package/Path | Instances |
|--------------|----------|---------------|------------------|-----------|
| Popover | ui/components/ui/popover | Modal | component-library/modal | 15 |

#### **Sheet 3: Path-Level Detail**
Breaks down usage by specific import paths to see which old implementations are most used.

| Component | Specific Path | Instances | File Paths |
|-----------|--------------|-----------|------------|
| Button | ui/components/ui/button | 15 | pages/send.js, pages/home.js |
| Button | component-library/button | 42 | pages/settings.js, pages/confirm.js |

#### **Sheet 4: MMDS Usage**
Current adoption of MMDS components.

| Component | Instances | File Paths |
|-----------|-----------|------------|
| Button | 23 | pages/new-feature.js |
| Icon | 89 | pages/dashboard.js, pages/wallet.js |

#### **Sheet 5: No Replacement**
Components without direct MMDS replacements.

| Component | Path | Instances | File Paths |
|-----------|------|-----------|------------|
| TextField | component-library/text-field | 34 | pages/forms.js |

---

### **Configuration**

The tool uses a `config.json` file to define projects and their component mappings.

#### **Automated Config Generation**

The repository includes an automated workflow to keep `config.json` synchronized with the latest component deprecations from the MetaMask codebases.

**Setup:**

1. **Initialize git submodules** (first time only):
   ```bash
   yarn setup-repos
   ```
   This clones Extension, Mobile, and Design System repos as submodules in `repos/`.

2. **Sync config with latest deprecations**:
   ```bash
   yarn sync-config
   ```
   This will:
   - Update git submodules to latest
   - Scan Extension and Mobile for `@deprecated` components
   - Fetch MMDS component lists
   - Auto-map deprecated → MMDS replacements
   - Update `config.json` with discovered components

**Options:**

- **Dry run** (see what would change without writing):
  ```bash
  yarn sync-config:dry-run
  ```

- **Skip submodule update** (faster for development):
  ```bash
  yarn sync-config:skip-update
  ```

- **Manual submodule update**:
  ```bash
  yarn update-repos
  ```

**How it works:**

1. **Scanner** (`scripts/lib/scanner.js`): Uses Babel AST parsing to find all `@deprecated` JSDoc comments in:
   - Extension: `ui/components/**/*`
   - Mobile: `app/components/**/*`, `app/component-library/**/*`

2. **MMDS Fetcher** (`scripts/lib/mmds-fetcher.js`): Parses the Design System index.ts files to get available MMDS components

3. **Component Mapper** (`scripts/lib/component-mapper.js`): Maps deprecated → MMDS using:
   - Manual mapping table (special cases like `ButtonPrimary` → `Button`)
   - Explicit hints from `@deprecated` messages
   - Exact name matching
   - Returns `null` if no replacement exists

4. **Config Merger** (`scripts/lib/config-merger.js`): Merges discovered components with existing config:
   - Auto-generated entries (`_autoGenerated: true`) are refreshed from code
   - Manual overrides (`_autoGenerated: false`) are preserved
   - Generates a summary report of changes

**Preserving Manual Overrides:**

If you need to manually override a mapping, set `_autoGenerated: false`:

```json
{
  "SiteOrigin": {
    "paths": ["ui/components/ui/site-origin"],
    "replacement": {
      "component": "AvatarFavicon",
      "package": "@metamask/design-system-react"
    },
    "_autoGenerated": false
  }
}
```

This entry will never be modified by the sync script.

See `PLAN.md` for full architecture documentation.

#### **Config Structure**

```json
{
  "projects": {
    "extension": {
      "rootFolder": "ui",
      "ignoreFolders": ["ui/components/component-library"],
      "filePattern": "ui/**/*.{js,tsx}",
      "outputFile": "extension-component-metrics.xlsx",
      "currentPackages": ["@metamask/design-system-react"],
      "deprecatedComponents": {
        "Button": {
          "paths": [
            "ui/components/ui/button",
            "ui/components/component-library/button"
          ],
          "replacement": {
            "component": "Button",
            "package": "@metamask/design-system-react"
          }
        },
        "Popover": {
          "paths": ["ui/components/ui/popover"],
          "replacement": {
            "component": "Modal",
            "package": "component-library",
            "path": "ui/components/component-library/modal"
          }
        },
        "TextField": {
          "paths": ["ui/components/component-library/text-field"],
          "replacement": null
        }
      },
      "currentComponents": [
        "Button",
        "Icon",
        "Text",
        "Box"
      ]
    }
  }
}
```

#### **Config Fields**

**Project Level:**
- `rootFolder`: Root directory to scan
- `ignoreFolders`: Directories to exclude (e.g., the component-library source itself)
- `filePattern`: Glob pattern for files to scan
- `outputFile`: Name of the generated XLSX file
- `currentPackages`: NPM packages to track as "current" (MMDS packages)
- `currentComponents`: List of components available in MMDS packages

**Deprecated Components:**
- `paths`: Array of import paths to match (can be multiple old implementations)
- `replacement`: Object describing the migration target
  - For MMDS migrations: `{ component: "Button", package: "@metamask/design-system-react" }`
  - For intermediate migrations: `{ component: "Modal", package: "component-library", path: "..." }`
  - For no replacement: `null`

#### **Path Matching**

The tool matches import paths flexibly:
- Exact matches: `ui/components/component-library/button`
- Relative imports: `../../components/component-library/button`
- Partial matches: Any path containing `/component-library`
- Package imports: `react-native-vector-icons/Ionicons`

---

### **Requirements**

- The tool **only counts components that are imported** from tracked sources
- Components **inside JSDoc comments** are not counted as usage
- **Test files** are automatically excluded (`*.test.{js,tsx}`)
- **Node.js** v14 or higher is required

---

### **Migration Strategy**

The tool helps you plan your migration strategy by identifying:

1. **High-impact components**: Components with the most usage that should be migrated first
2. **Multiple old versions**: Components with usage spread across really old and old implementations
3. **Intermediate steps**: Components that need to go through component-library first
4. **Custom work needed**: Components without direct MMDS replacements

Use the Path-Level Detail sheet to prioritize which old implementation to migrate first (usually the most-used one).

---

### **Future Feature Ideas**

We're exploring additional features to enhance design system adoption tracking:

#### **Props Audit**
- Track the most commonly used props for each component
- Identify prop usage patterns across the codebase
- Help inform API design decisions for design system components
- Surface which props are heavily used vs rarely used

#### **Team Adoption Metrics**
- Use CODEOWNERS files to map component usage to teams
- Generate team-level adoption reports showing:
  - Which teams have the highest design system adoption
  - Which teams still have the most deprecated component usage
  - Per-team migration progress tracking
- Help identify teams that may need additional migration support

Want to contribute or suggest other features? Open an issue on GitHub!

---

### **Contributing**

If you wish to contribute to the tool, ensure you are running the latest version of **Yarn (v4.x)** and **Node.js**. You can make adjustments to the `config.json` file or update the CLI logic for tracking additional components or repositories.

---

### **License**

This project is licensed under the [MIT License](LICENSE).
