# **@georgewrmarshall/design-system-metrics**

A CLI tool to audit design system component usage and track migration progress across MetaMask codebases. Identifies deprecated local component usage and measures adoption of the new MetaMask Design System (MMDS) NPM packages.

## **Getting Started**

- [Extension](#extension)
- [Mobile](#mobile)
- [Design System Packages](#design-system-packages)
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

3. Two files will be generated in the current working directory:
   - `extension-component-metrics-deprecated.csv` - Old local component-library usage (needs migration)
   - `extension-component-metrics-current.csv` - New MMDS NPM package usage (@metamask/design-system-react)

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

3. Two files will be generated in the current working directory:
   - `mobile-component-metrics-deprecated.csv` - Old local component-library usage (needs migration)
   - `mobile-component-metrics-current.csv` - New MMDS NPM package usage (@metamask/design-system-react-native)

---

### **Design System Packages**

You can also audit the design system NPM packages themselves to track component usage within the design system repos.

#### **design-system-react**

1. **Clone the [design-system-react](https://github.com/MetaMask/design-system-react)** repository:

```bash
git clone https://github.com/MetaMask/design-system-react.git
```

2. **Run the CLI tool:**

```bash
npx @georgewrmarshall/design-system-metrics --project design-system-react
```

3. One file will be generated:
   - `design-system-react-metrics.csv` - Component usage within the design system package

#### **design-system-react-native**

1. **Clone the [design-system-react-native](https://github.com/MetaMask/design-system-react-native)** repository:

```bash
git clone https://github.com/MetaMask/design-system-react-native.git
```

2. **Run the CLI tool:**

```bash
npx @georgewrmarshall/design-system-metrics --project design-system-react-native
```

3. One file will be generated:
   - `design-system-react-native-metrics.csv` - Component usage within the design system package

---

### **CLI Options**

- **`--project` (Required)**: Specify the project to audit. Options are:
  - `extension`: For MetaMask Extension
  - `mobile`: For MetaMask Mobile
  - `design-system-react`: For design-system-react package
  - `design-system-react-native`: For design-system-react-native package

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
  - `all` (default): Track both deprecated and current sources
  - `deprecated`: Only track old local component-library usage
  - `current`: Only track new MMDS NPM package usage
  - Comma-separated: `deprecated,current` (same as `all`)

  Example:
  ```bash
  npx @georgewrmarshall/design-system-metrics --project extension --sources deprecated
  ```

- **`--config` (Optional)**: Path to custom configuration file

  Example:
  ```bash
  npx @georgewrmarshall/design-system-metrics --project extension --config ./custom-config.json
  ```

---

### **Features**

#### **Multi-Source Tracking (Extension & Mobile)**
For Extension and Mobile projects, the tool tracks component usage from two distinct sources:

1. **Deprecated**: Components imported from old local `/component-library` paths (needs migration)
2. **Current**: Components imported from new MMDS NPM packages:
   - Extension: `@metamask/design-system-react`
   - Mobile: `@metamask/design-system-react-native`

This helps you track **migration progress** from deprecated local components to the new design system packages.

#### **Design System Package Auditing**
For design system packages themselves (`design-system-react` and `design-system-react-native`), the tool generates a single report showing all component usage within the package. This helps you understand which components are being used internally.

#### **Flexible Configuration**
Four project configurations are available in `config.json`:
- `extension` - Tracks Extension repo (deprecated = local, current = @metamask/design-system-react)
- `mobile` - Tracks Mobile repo (deprecated = local, current = @metamask/design-system-react-native)
- `design-system-react` - Tracks the design-system-react package itself
- `design-system-react-native` - Tracks the design-system-react-native package itself

Each project can be configured with:
- Custom file patterns and ignore rules
- Component lists to audit
- NPM packages to track (for extension/mobile)

---

### **Output Files**

#### **Extension & Mobile Projects**
Two separate CSV or JSON files are generated to track migration progress:

**CSV Format:**
```csv
Component,Instances,File Paths
"Button",42,"ui/pages/send/send.js, ui/pages/home/home.js"
```

**Files Generated:**
- `{project}-component-metrics-deprecated.csv` - Old local component usage
- `{project}-component-metrics-current.csv` - New NPM package usage

**JSON Format:**
```json
{
  "Button": {
    "instances": 42,
    "files": ["ui/pages/send/send.js", "ui/pages/home/home.js"]
  }
}
```

#### **Design System Package Projects**
One aggregated report showing all component usage:

**Files Generated:**
- `design-system-react-metrics.csv` - All component usage in design-system-react
- `design-system-react-native-metrics.csv` - All component usage in design-system-react-native

---

### **Requirements**

- The tool **only counts components that are imported** from tracked sources:
  - For Extension/Mobile: Local `/component-library` (deprecated) or configured NPM packages (current)
  - For Design System packages: Any imports within the package
- Components **inside JSDoc comments** are not counted as usage
- **Test files** are automatically excluded (`*.test.{js,tsx}`)
- **Node.js** v14 or higher is required

---

### **Contributing**

If you wish to contribute to the tool, ensure you are running the latest version of **Yarn (v4.x)** and **Node.js**. You can make adjustments to the `config.json` file or update the CLI logic for tracking additional components or repositories.

---

### **License**

This project is licensed under the [MIT License](LICENSE).
