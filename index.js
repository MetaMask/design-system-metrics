#!/usr/bin/env node

const fs = require("fs").promises;
const { glob } = require("glob");
const path = require("path");
const babelParser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const { program } = require("commander");
const chalk = require("chalk");
const ExcelJS = require("exceljs");

let config;

// Function to load and parse the configuration file
const loadConfig = async (configPath) => {
  try {
    const configContent = await fs.readFile(configPath, "utf8");
    config = JSON.parse(configContent);
    validateConfig(config);
  } catch (err) {
    console.error(
      chalk.red(`Failed to load configuration file: ${err.message}`)
    );
    process.exit(1);
  }
};

// Validate config structure
const validateConfig = (cfg) => {
  if (!cfg.projects || typeof cfg.projects !== 'object') {
    throw new Error('Config must have a "projects" object');
  }

  for (const [projectName, projectCfg] of Object.entries(cfg.projects)) {
    if (projectCfg.deprecatedComponents && typeof projectCfg.deprecatedComponents !== 'object') {
      throw new Error(`Project "${projectName}" deprecatedComponents must be an object`);
    }

    // Check if using old array format
    if (Array.isArray(projectCfg.deprecatedComponents)) {
      console.warn(chalk.yellow(`\nWarning: Project "${projectName}" is using the old array format for deprecatedComponents.`));
      console.warn(chalk.yellow('Please migrate to the new object format with paths and replacement info.\n'));
    }
  }
};

// Define CLI options using Commander
program
  .version("2.6.0")
  .description("Design System Metrics CLI Tool - Track component usage and migration progress")
  .requiredOption(
    "-p, --project <name>",
    "Specify the project to audit (e.g., extension, mobile)"
  )
  .option(
    "-c, --config <path>",
    "Path to custom config file",
    path.join(__dirname, "config.json")
  )
  .parse(process.argv);

const options = program.opts();

// Initialize component instances and file mappings
// Structure: Map<componentName, Map<source, Map<specificPath, { count, files }>>>
let componentMetrics = new Map();

// Helper function to track component usage by source and specific path
const trackComponent = (componentName, source, specificPath, filePath) => {
  if (!componentMetrics.has(componentName)) {
    componentMetrics.set(componentName, new Map());
  }

  const sourceMetrics = componentMetrics.get(componentName);
  if (!sourceMetrics.has(source)) {
    sourceMetrics.set(source, new Map());
  }

  const pathMetrics = sourceMetrics.get(source);
  if (!pathMetrics.has(specificPath)) {
    pathMetrics.set(specificPath, { count: 0, files: [] });
  }

  const metrics = pathMetrics.get(specificPath);
  metrics.count++;
  metrics.files.push(filePath);
};

// Helper function to check if import path matches any component paths
const matchComponentPath = (importPath, deprecatedComponents) => {
  // Normalize the import path
  const normalizedImportPath = importPath.replace(/\\/g, '/');

  for (const [componentName, config] of Object.entries(deprecatedComponents)) {
    for (const componentPath of config.paths) {
      // Normalize the component path
      const normalizedComponentPath = componentPath.replace(/\\/g, '/');

      // Check for exact match
      if (normalizedImportPath === normalizedComponentPath) {
        return { componentName, matchedPath: componentPath };
      }

      // Check if import path ends with the component path (relative imports)
      if (normalizedImportPath.endsWith(normalizedComponentPath)) {
        return { componentName, matchedPath: componentPath };
      }

      // Check if import path includes key parts of component path
      // e.g., "../../components/component-library" matches "*/component-library/*"
      const pathParts = normalizedComponentPath.split('/');
      const importParts = normalizedImportPath.split('/');

      // If import includes "/component-library" and path includes "/component-library"
      if (normalizedImportPath.includes('/component-library') &&
          normalizedComponentPath.includes('/component-library')) {
        return { componentName, matchedPath: componentPath };
      }

      // Check for package imports (e.g., react-native-vector-icons/*)
      if (normalizedComponentPath.includes(normalizedImportPath)) {
        return { componentName, matchedPath: componentPath };
      }
    }
  }
  return null;
};

// Function to process a single file
const processFile = async (
  filePath,
  deprecatedComponents,
  currentComponentsSet,
  currentPackages
) => {
  // Track imports by source: Map<componentName, { source, specificPath }>
  const componentImports = new Map();

  try {
    const content = await fs.readFile(filePath, "utf8");

    // Parse the file content into an AST
    const ast = babelParser.parse(content, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
      attachComment: true,
    });

    // Traverse the AST to find import declarations from multiple sources
    traverse(ast, {
      ImportDeclaration({ node }) {
        const importPath = node.source.value;

        let source = null;
        let specificPath = null;

        // Check if it's a deprecated component from local paths
        const deprecatedMatch = matchComponentPath(importPath, deprecatedComponents);
        if (deprecatedMatch) {
          source = "deprecated";
          specificPath = deprecatedMatch.matchedPath;

          node.specifiers.forEach((specifier) => {
            let componentName = null;

            if (specifier.type === "ImportDefaultSpecifier") {
              componentName = specifier.local.name;
            } else if (specifier.type === "ImportSpecifier") {
              componentName = specifier.local.name;
            }

            if (componentName && deprecatedComponents[componentName]) {
              componentImports.set(componentName, { source, specificPath });
            }
          });
        }
        // Check if it's from current NPM packages
        else if (currentPackages && currentPackages.length > 0) {
          for (const pkg of currentPackages) {
            if (importPath === pkg || importPath.startsWith(`${pkg}/`)) {
              source = "current";
              specificPath = pkg;

              node.specifiers.forEach((specifier) => {
                let componentName = null;

                if (specifier.type === "ImportDefaultSpecifier") {
                  componentName = specifier.local.name;
                } else if (specifier.type === "ImportSpecifier") {
                  componentName = specifier.local.name;
                }

                if (componentName && currentComponentsSet.has(componentName)) {
                  componentImports.set(componentName, { source, specificPath });
                }
              });
              break;
            }
          }
        }
      },
    });

    // Traverse the AST to find JSX elements
    traverse(ast, {
      JSXElement({ node }) {
        const openingElement = node.openingElement;
        if (
          openingElement &&
          openingElement.name &&
          (openingElement.name.type === "JSXIdentifier" ||
            openingElement.name.type === "JSXMemberExpression")
        ) {
          let componentName = "";

          if (openingElement.name.type === "JSXIdentifier") {
            componentName = openingElement.name.name;
          } else if (openingElement.name.type === "JSXMemberExpression") {
            // Handle namespaced components like <UI.Button>
            let current = openingElement.name;
            while (current.object) {
              current = current.object;
            }
            componentName = current.name;
          }

          // Check if this component was imported and track its usage
          if (componentImports.has(componentName)) {
            const { source, specificPath } = componentImports.get(componentName);
            trackComponent(componentName, source, specificPath, filePath);
          }
        }
      },
    });
  } catch (err) {
    console.error(
      chalk.yellow(`Error processing file ${filePath}: ${err.message}`)
    );
  }
};

// Main function to coordinate the audit
const main = async () => {
  await loadConfig(options.config);

  const projectName = options.project;
  const projectConfig = config.projects[projectName];

  if (!projectConfig) {
    console.error(
      chalk.red(
        `Project "${projectName}" is not defined in the configuration file.`
      )
    );
    process.exit(1);
  }

  const {
    rootFolder,
    ignoreFolders,
    filePattern,
    outputFile: baseOutputFile,
    deprecatedComponents = {},
    currentComponents = [],
    currentPackages = [],
  } = projectConfig;

  // Add today's date to the output filename
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  const ext = path.extname(baseOutputFile);
  const basename = path.basename(baseOutputFile, ext);
  const dirname = path.dirname(baseOutputFile);
  const outputFile = path.join(dirname, `${basename}-${today}${ext}`);

  const currentComponentsSet = new Set(currentComponents);

  console.log(chalk.blue(`\nStarting audit for project: ${projectName}\n`));

  try {
    const files = await glob(filePattern, {
      ignore: [
        ...ignoreFolders.map((folder) => path.join(folder, "**")),
        `${rootFolder}/**/*.test.{js,tsx}`,
      ],
    });

    if (files.length === 0) {
      console.log(chalk.yellow("No files matched the provided pattern."));
      return;
    }

    // Process files concurrently
    await Promise.all(
      files.map((file) =>
        processFile(
          file,
          deprecatedComponents,
          currentComponentsSet,
          currentPackages
        )
      )
    );

    console.log(chalk.green("\nGenerating Component Migration Metrics...\n"));

    // Collect metrics by component and calculate totals
    const deprecatedMetrics = new Map(); // Map<componentName, { totalCount, pathBreakdown, files }>
    const currentMetrics = new Map(); // Map<componentName, { count, files }>

    // Aggregate deprecated metrics across all paths
    for (const [componentName, componentConfig] of Object.entries(deprecatedComponents)) {
      const componentSources = componentMetrics.get(componentName);
      if (componentSources && componentSources.has("deprecated")) {
        const pathMetrics = componentSources.get("deprecated");
        let totalCount = 0;
        const pathBreakdown = new Map();
        const allFiles = [];

        for (const [specificPath, metrics] of pathMetrics.entries()) {
          totalCount += metrics.count;
          pathBreakdown.set(specificPath, metrics);
          allFiles.push(...metrics.files);
        }

        deprecatedMetrics.set(componentName, {
          totalCount,
          pathBreakdown,
          files: allFiles,
          replacement: componentConfig.replacement,
        });
      }
    }

    // Collect current (MMDS) metrics
    currentComponentsSet.forEach((componentName) => {
      const componentSources = componentMetrics.get(componentName);
      if (componentSources && componentSources.has("current")) {
        const pathMetrics = componentSources.get("current");
        let totalCount = 0;
        const allFiles = [];

        for (const [, metrics] of pathMetrics.entries()) {
          totalCount += metrics.count;
          allFiles.push(...metrics.files);
        }

        currentMetrics.set(componentName, { count: totalCount, files: allFiles });
      }
    });

    // Generate XLSX file with multiple sheets using ExcelJS
    const workbook = new ExcelJS.Workbook();

    // Sheet 1: Migration Progress (components migrating to MMDS)
    const migrationSheet = workbook.addWorksheet("Migration Progress");
    migrationSheet.addRow([
      "Deprecated Component",
      "Source Paths",
      "MMDS Component",
      "Deprecated Instances",
      "MMDS Instances",
      "Migrated %",
    ]);

    const componentsWithMMDSReplacement = Array.from(deprecatedMetrics.entries())
      .filter(([, metrics]) =>
        metrics.replacement &&
        metrics.replacement.package &&
        (metrics.replacement.package.includes("@metamask/design-system"))
      );

    componentsWithMMDSReplacement.forEach(([componentName, metrics]) => {
      const mmdsComp = metrics.replacement.component;
      const deprecatedCount = metrics.totalCount;
      const mmdsCount = currentMetrics.get(mmdsComp)?.count || 0;
      const total = deprecatedCount + mmdsCount;
      const percentage = total > 0 ? (mmdsCount / total) * 100 : 0;
      const sourcePaths = deprecatedComponents[componentName].paths.join(", ");

      migrationSheet.addRow([
        componentName,
        sourcePaths,
        mmdsComp,
        deprecatedCount,
        mmdsCount,
        `${percentage.toFixed(2)}%`,
      ]);
    });

    console.log(
      chalk.blue(`Migration Progress: ${componentsWithMMDSReplacement.length} components tracked`)
    );

    // Sheet 2: Intermediate Migrations (components migrating to component-library)
    const intermediateSheet = workbook.addWorksheet("Intermediate Migrations");
    intermediateSheet.addRow([
      "Old Component",
      "Old Path",
      "New Component",
      "New Package/Path",
      "Instances",
    ]);

    const componentsWithIntermediateReplacement = Array.from(deprecatedMetrics.entries())
      .filter(([, metrics]) =>
        metrics.replacement &&
        metrics.replacement.package === "component-library"
      );

    componentsWithIntermediateReplacement.forEach(([componentName, metrics]) => {
      const oldPaths = deprecatedComponents[componentName].paths.join(", ");
      const newComponent = metrics.replacement.component;
      const newPath = metrics.replacement.path || metrics.replacement.package;

      intermediateSheet.addRow([
        componentName,
        oldPaths,
        newComponent,
        newPath,
        metrics.totalCount,
      ]);
    });

    console.log(
      chalk.blue(`Intermediate Migrations: ${componentsWithIntermediateReplacement.length} components tracked`)
    );

    // Sheet 3: Path-Level Detail
    const pathDetailSheet = workbook.addWorksheet("Path-Level Detail");
    pathDetailSheet.addRow([
      "Component",
      "Specific Path",
      "Instances",
      "File Paths",
    ]);

    deprecatedMetrics.forEach((metrics, componentName) => {
      metrics.pathBreakdown.forEach((pathMetrics, specificPath) => {
        pathDetailSheet.addRow([
          componentName,
          specificPath,
          pathMetrics.count,
          pathMetrics.files.join(", "),
        ]);
      });
    });

    console.log(
      chalk.blue(`Path-Level Detail: ${deprecatedMetrics.size} components with path breakdowns`)
    );

    // Sheet 4: MMDS Usage
    const mmdsSheet = workbook.addWorksheet("MMDS Usage");
    mmdsSheet.addRow(["Component", "Instances", "File Paths"]);

    // Include all MMDS components, even those with 0 instances
    currentComponentsSet.forEach((componentName) => {
      const metrics = currentMetrics.get(componentName);
      const count = metrics ? metrics.count : 0;
      const files = metrics ? metrics.files.join(", ") : "";

      console.log(`${chalk.cyan(componentName)}: ${count} (MMDS)`);
      mmdsSheet.addRow([
        componentName,
        count,
        files,
      ]);
    });

    // Sheet 5: No Replacement Components
    const noReplacementSheet = workbook.addWorksheet("No Replacement");
    noReplacementSheet.addRow(["Component", "Path", "Instances", "File Paths"]);

    const componentsWithNoReplacement = Array.from(deprecatedMetrics.entries())
      .filter(([, metrics]) => !metrics.replacement);

    componentsWithNoReplacement.forEach(([componentName, metrics]) => {
      const paths = deprecatedComponents[componentName].paths.join(", ");
      noReplacementSheet.addRow([
        componentName,
        paths,
        metrics.totalCount,
        metrics.files.join(", "),
      ]);
    });

    console.log(
      chalk.blue(`No Replacement: ${componentsWithNoReplacement.length} components`)
    );

    // Create output directory if it doesn't exist
    const outputDir = path.dirname(outputFile);
    await fs.mkdir(outputDir, { recursive: true });

    // Write the XLSX file
    await workbook.xlsx.writeFile(outputFile);

    console.log(chalk.green(`\n✓ Metrics written to ${outputFile}`));
    console.log(chalk.green("✓ All reports generated successfully!\n"));
  } catch (err) {
    console.error(chalk.red(`Error: ${err.message}`));
    console.error(chalk.red(err.stack));
  }
};

main();
