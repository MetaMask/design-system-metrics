# **@georgewrmarshall/design-system-metrics**

A CLI tool to audit design system component usage across multiple MetaMask codebases. Track components from local component libraries, NPM packages, and identify deprecated component usage.

## **Getting Started**

- [Extension](#extension)
- [Mobile](#mobile)
- [CLI Options](#cli-options)
- [Features](#features)
- [Output Files](#output-files)
- [Requirements](#requirements)

---

### **Extension**

1. **Clone the [MetaMask Extension](https://github.com/MetaMask/metamask-extension)** repository if you haven't already:

```bash
git clone https://github.com/MetaMask/metamask-extension.git
```

2. **Run the CLI tool using npx:**

```bash
npx @georgewrmarshall/design-system-metrics --project extension
```

3. Three files will be generated in the current working directory (if components from each source are found):
   - `extension-component-adoption-metrics-local.csv` - Local component library usage
   - `extension-component-adoption-metrics-npm.csv` - NPM package usage
   - `extension-component-adoption-metrics-deprecated.csv` - Deprecated component usage

---

### **Mobile**

1. **Clone the [MetaMask Mobile](https://github.com/MetaMask/metamask-mobile)** repository if you haven't already:

```bash
git clone https://github.com/MetaMask/metamask-mobile.git
```

2. **Run the CLI tool using npx:**

```bash
npx @georgewrmarshall/design-system-metrics --project mobile
```

3. Three files will be generated in the current working directory (if components from each source are found):
   - `mobile-component-adoption-metrics-local.csv` - Local component library usage
   - `mobile-component-adoption-metrics-npm.csv` - NPM package usage
   - `mobile-component-adoption-metrics-deprecated.csv` - Deprecated component usage

---

### **CLI Options**

- **`--project` (Required)**: Specify the project to audit. Options are:
  - `extension`: For MetaMask Extension
  - `mobile`: For MetaMask Mobile

  Example:
  ```bash
  npx @georgewrmarshall/design-system-metrics --project extension
  ```

- **`--format` (Optional)**: Specify the output format. Options are `csv` (default) or `json`.

  Example:
  ```bash
  npx @georgewrmarshall/design-system-metrics --project extension --format json
  ```

- **`--sources` (Optional)**: Specify which sources to track. Options are:
  - `all` (default): Track all sources (local, npm, deprecated)
  - `local`: Only track local component library usage
  - `npm`: Only track NPM package imports
  - `deprecated`: Only track deprecated components
  - Comma-separated: `local,npm` to track multiple specific sources

  Example:
  ```bash
  npx @georgewrmarshall/design-system-metrics --project extension --sources npm,deprecated
  ```

---

### **Features**

#### **Multi-Source Tracking**
The tool tracks component usage from three distinct sources:

1. **Local Component Library**: Components imported from local `/component-library` paths
2. **NPM Packages**: Components imported from configured NPM packages:
   - Extension: `@metamask/design-system-react`
   - Mobile: `@metamask/design-system-react-native`
3. **Deprecated Components**: Components marked with `@deprecated` JSDoc tags

#### **Automatic Deprecated Detection**
Components with JSDoc `@deprecated` tags are automatically identified and tracked separately, helping teams monitor and reduce technical debt.

#### **Flexible Configuration**
Each project can be configured independently in `config.json` with:
- Custom NPM packages to track
- Specific deprecated components to monitor
- File patterns and ignore rules
- Component lists to audit

---

### **Output Files**

The tool generates separate CSV or JSON files for each source type:

#### **CSV Format**

**Local and Deprecated Reports:**
```csv
Component,Instances,File Paths
"Button",42,"ui/pages/send/send.js, ui/pages/home/home.js"
```

**NPM Report** (includes package name):
```csv
Component,Instances,Package,File Paths
"Button",15,"@metamask/design-system-react","ui/pages/send/send.js"
```

#### **JSON Format**
```json
{
  "Button": {
    "instances": 42,
    "files": ["ui/pages/send/send.js", "ui/pages/home/home.js"],
    "packageBreakdown": {
      "@metamask/design-system-react": {
        "count": 15,
        "files": ["ui/pages/send/send.js"]
      }
    }
  }
}
```

---

### **Requirements**

- The tool **automatically detects deprecated components** via JSDoc `@deprecated` tags
- The tool **only counts components that are imported** from tracked sources (local component library or configured NPM packages)
- Components **inside JSDoc comments** are not counted as usage
- **Node.js** v14 or higher is required

---

### **Contributing**

If you wish to contribute to the tool, ensure you are running the latest version of **Yarn (v4.x)** and **Node.js**. You can make adjustments to the `config.json` file or update the CLI logic for tracking additional components or repositories.

---

### **License**

This project is licensed under the [MIT License](LICENSE).
