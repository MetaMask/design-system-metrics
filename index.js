#!/usr/bin/env node

const fs = require("fs").promises;
const { glob } = require("glob");
const path = require("path");
const babelParser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const { program } = require("commander");
const chalk = require("chalk");
const XLSX = require("xlsx");

let config;

// Function to load and parse the configuration file
const loadConfig = async (configPath) => {
  try {
    const configContent = await fs.readFile(configPath, "utf8");
    config = JSON.parse(configContent);
  } catch (err) {
    console.error(
      chalk.red(`Failed to load configuration file: ${err.message}`)
    );
    process.exit(1);
  }
};

// Define CLI options using Commander
program
  .version("2.3.0")
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
// Structure: Map<componentName, Map<source, { count, files }>>
let componentMetrics = new Map();

// Helper function to track component usage by source
const trackComponent = (componentName, source, filePath) => {
  if (!componentMetrics.has(componentName)) {
    componentMetrics.set(componentName, new Map());
  }

  const sourceMetrics = componentMetrics.get(componentName);
  if (!sourceMetrics.has(source)) {
    sourceMetrics.set(source, { count: 0, files: [] });
  }

  const metrics = sourceMetrics.get(source);
  metrics.count++;
  metrics.files.push(filePath);
};

// Function to process a single file
const processFile = async (
  filePath,
  deprecatedComponentsSet,
  currentComponentsSet,
  currentPackages
) => {
  // Track imports by source: Map<componentName, source>
  const componentImports = new Map();
  try {
    const content = await fs.readFile(filePath, "utf8");

    // Parse the file content into an AST
    const ast = babelParser.parse(content, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
      attachComment: true, // Enable comment attachment for JSDoc parsing
    });

    // Traverse the AST to find import declarations from multiple sources
    traverse(ast, {
      ImportDeclaration({ node }) {
        const importPath = node.source.value;
        console.log(`Import path detected: ${importPath}`);

        let source = null;

        // Check if it's from local component library (DEPRECATED)
        if (importPath.includes("/component-library")) {
          source = "deprecated";
        }
        // Check if it's from current NPM packages
        else if (currentPackages && currentPackages.length > 0) {
          for (const pkg of currentPackages) {
            if (importPath === pkg || importPath.startsWith(`${pkg}/`)) {
              source = "current";
              break;
            }
          }
        }

        // If we found a relevant import source, track the components
        if (source) {
          node.specifiers.forEach((specifier) => {
            let componentName = null;

            if (specifier.type === "ImportDefaultSpecifier") {
              componentName = specifier.local.name;
              console.log(
                `Default imported component: ${componentName} (${source})`
              );
            } else if (specifier.type === "ImportSpecifier") {
              componentName = specifier.local.name;
              console.log(`Named imported component: ${componentName} (${source})`);
            }

            if (componentName) {
              // Check if component is in deprecated list (for local imports)
              if (
                source === "deprecated" &&
                deprecatedComponentsSet.has(componentName)
              ) {
                componentImports.set(componentName, source);
              }
              // Check if component is in current list (for NPM imports)
              else if (
                source === "current" &&
                currentComponentsSet.has(componentName)
              ) {
                componentImports.set(componentName, source);
              }
            }
          });
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

          console.log(`JSX component detected: ${componentName}`);

          // Check if this component was imported and track its usage
          if (componentImports.has(componentName)) {
            const source = componentImports.get(componentName);
            trackComponent(componentName, source, filePath);

            console.log(
              `Matched JSX component: ${componentName}, Source: ${source}`
            );
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
    outputFile,
    deprecatedComponents = [],
    currentComponents = [],
    currentPackages = [],
  } = projectConfig;

  const deprecatedComponentsSet = new Set(deprecatedComponents);
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
          deprecatedComponentsSet,
          currentComponentsSet,
          currentPackages
        )
      )
    );

    console.log(chalk.green("\nComponent Migration Metrics:"));

    const componentMapping = projectConfig.componentMapping || {};

    // Collect deprecated metrics
    const deprecatedMetrics = new Map();
    deprecatedComponentsSet.forEach((componentName) => {
      const componentSources = componentMetrics.get(componentName);
      if (componentSources) {
        const metrics = componentSources.get("deprecated");
        if (metrics) {
          deprecatedMetrics.set(componentName, metrics);
        }
      }
    });

    // Collect current (MMDS) metrics
    const currentMetrics = new Map();
    currentComponentsSet.forEach((componentName) => {
      const componentSources = componentMetrics.get(componentName);
      if (componentSources) {
        const metrics = componentSources.get("current");
        if (metrics) {
          currentMetrics.set(componentName, metrics);
        }
      }
    });

    // Generate XLSX file with multiple sheets
    const workbook = XLSX.utils.book_new();

    // Sheet 1: Migration Progress
    const migrationData = [];
    migrationData.push([
      "Deprecated Component",
      "MMDS Component Replacement",
      "Deprecated Instances",
      "MMDS Instances",
      "Migrated %",
    ]);

    // Collect all unique deprecated components that have mappings
    const deprecatedComponentsWithMapping = Array.from(
      deprecatedComponentsSet
    ).filter((comp) => componentMapping[comp]);

    deprecatedComponentsWithMapping.forEach((deprecatedComp) => {
      const mmdsComp = componentMapping[deprecatedComp];
      const deprecatedCount = deprecatedMetrics.get(deprecatedComp)?.count || 0;
      const mmdsCount = currentMetrics.get(mmdsComp)?.count || 0;
      const total = deprecatedCount + mmdsCount;
      const percentage = total > 0 ? (mmdsCount / total) * 100 : 0;

      migrationData.push([
        deprecatedComp,
        mmdsComp,
        deprecatedCount,
        mmdsCount,
        `${percentage.toFixed(2)}%`,
      ]);
    });

    const migrationSheet = XLSX.utils.aoa_to_sheet(migrationData);
    XLSX.utils.book_append_sheet(workbook, migrationSheet, "Migration Progress");

    console.log(
      chalk.blue(`\nMigration Progress: ${deprecatedComponentsWithMapping.length} components tracked`)
    );

    // Sheet 2: MMDS Usage
    const mmdsData = [];
    mmdsData.push(["Component", "Instances", "File Paths"]);

    currentMetrics.forEach((metrics, componentName) => {
      console.log(`${chalk.cyan(componentName)}: ${metrics.count} (MMDS)`);
      mmdsData.push([
        componentName,
        metrics.count,
        metrics.files.join(", "),
      ]);
    });

    const mmdsSheet = XLSX.utils.aoa_to_sheet(mmdsData);
    XLSX.utils.book_append_sheet(workbook, mmdsSheet, "MMDS Usage");

    // Sheet 3: Deprecated Usage
    const deprecatedData = [];
    deprecatedData.push(["Component", "Instances", "File Paths"]);

    deprecatedMetrics.forEach((metrics, componentName) => {
      console.log(`${chalk.yellow(componentName)}: ${metrics.count} (Deprecated)`);
      deprecatedData.push([
        componentName,
        metrics.count,
        metrics.files.join(", "),
      ]);
    });

    const deprecatedSheet = XLSX.utils.aoa_to_sheet(deprecatedData);
    XLSX.utils.book_append_sheet(workbook, deprecatedSheet, "Deprecated Usage");

    // Create output directory if it doesn't exist
    const outputDir = path.dirname(outputFile);
    await fs.mkdir(outputDir, { recursive: true });

    // Write the XLSX file
    XLSX.writeFile(workbook, outputFile);

    console.log(chalk.green(`\n✓ Metrics written to ${outputFile}`));
    console.log(chalk.green("✓ All reports generated successfully!\n"));
  } catch (err) {
    console.error(chalk.red(`Error reading files: ${err.message}`));
  }
};

main();
