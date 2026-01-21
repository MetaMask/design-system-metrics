#!/usr/bin/env node

const fs = require("fs").promises;
const { glob } = require("glob");
const path = require("path");
const babelParser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const { program } = require("commander");
const chalk = require("chalk");

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
  .version("2.0.0")
  .description("Design System Metrics CLI Tool - Track component usage from multiple sources")
  .requiredOption(
    "-p, --project <name>",
    "Specify the project to audit (e.g., extension, mobile)"
  )
  .option("-f, --format <type>", "Output format (csv, json)", "csv")
  .option(
    "-s, --sources <types>",
    "Comma-separated list of sources to track (local, npm, deprecated, all)",
    "all"
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
  componentsSet,
  npmPackages,
  deprecatedComponentsSet
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

    // First, check for deprecated component definitions with JSDoc tags
    traverse(ast, {
      // Check function declarations with JSDoc comments
      FunctionDeclaration(path) {
        const { node } = path;
        if (
          node.id &&
          node.id.name &&
          componentsSet.has(node.id.name) &&
          node.leadingComments
        ) {
          const hasDeprecatedTag = node.leadingComments.some((comment) =>
            comment.value.includes("@deprecated")
          );
          if (hasDeprecatedTag) {
            deprecatedComponentsSet.add(node.id.name);
            console.log(`Found deprecated component: ${node.id.name}`);
          }
        }
      },
      // Check variable declarations (const Component = ...)
      VariableDeclarator(path) {
        const { node } = path;
        if (
          node.id &&
          node.id.name &&
          componentsSet.has(node.id.name) &&
          path.parent.leadingComments
        ) {
          const hasDeprecatedTag = path.parent.leadingComments.some((comment) =>
            comment.value.includes("@deprecated")
          );
          if (hasDeprecatedTag) {
            deprecatedComponentsSet.add(node.id.name);
            console.log(`Found deprecated component: ${node.id.name}`);
          }
        }
      },
    });

    // Traverse the AST to find import declarations from multiple sources
    traverse(ast, {
      ImportDeclaration({ node }) {
        const importPath = node.source.value;
        console.log(`Import path detected: ${importPath}`);

        let source = null;

        // Check if it's from local component library
        if (importPath.includes("/component-library")) {
          source = "local";
        }
        // Check if it's from npm packages
        else if (npmPackages && npmPackages.length > 0) {
          for (const pkg of npmPackages) {
            if (importPath === pkg || importPath.startsWith(`${pkg}/`)) {
              source = `npm:${pkg}`;
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
              console.log(`Default imported component: ${componentName}`);
            } else if (specifier.type === "ImportSpecifier") {
              componentName = specifier.local.name;
              console.log(`Named imported component: ${componentName}`);
            }

            if (componentName && componentsSet.has(componentName)) {
              componentImports.set(componentName, source);
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
          if (
            componentsSet.has(componentName) &&
            componentImports.has(componentName)
          ) {
            let source = componentImports.get(componentName);

            // Check if component is deprecated
            if (
              deprecatedComponentsSet &&
              deprecatedComponentsSet.has(componentName)
            ) {
              source = "deprecated";
            }

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
    components,
    npmPackages = [],
    deprecatedComponents = [],
    trackDeprecated = true,
    sources = ["local", "npm", "deprecated"],
  } = projectConfig;

  const componentsSet = new Set(components);
  const deprecatedComponentsSet = new Set(deprecatedComponents);

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
        processFile(file, componentsSet, npmPackages, deprecatedComponentsSet)
      )
    );

    console.log(chalk.green("\nComponent Adoption Metrics:"));

    // Parse sources filter from CLI
    let requestedSources = ["local", "npm", "deprecated"];
    if (options.sources && options.sources !== "all") {
      requestedSources = options.sources.split(",").map((s) => s.trim());
    }

    // Generate separate reports for each source
    const sourceTypes = requestedSources;

    for (const sourceType of sourceTypes) {
      // Filter component metrics for this source type
      const sourceMetrics = new Map();

      componentsSet.forEach((componentName) => {
        const componentSources = componentMetrics.get(componentName);
        if (componentSources) {
          // For npm source, aggregate all npm packages
          if (sourceType === "npm") {
            let totalNpmCount = 0;
            let totalNpmFiles = [];
            let npmPackageBreakdown = {};

            componentSources.forEach((metrics, source) => {
              if (source.startsWith("npm:")) {
                const pkgName = source.replace("npm:", "");
                totalNpmCount += metrics.count;
                totalNpmFiles.push(...metrics.files);
                npmPackageBreakdown[pkgName] = {
                  count: metrics.count,
                  files: metrics.files,
                };
              }
            });

            if (totalNpmCount > 0) {
              sourceMetrics.set(componentName, {
                count: totalNpmCount,
                files: totalNpmFiles,
                packageBreakdown: npmPackageBreakdown,
              });
            }
          } else {
            // For local and deprecated, get directly
            const metrics = componentSources.get(sourceType);
            if (metrics) {
              sourceMetrics.set(componentName, metrics);
            }
          }
        }
      });

      // Skip if no metrics for this source
      if (sourceMetrics.size === 0) {
        console.log(
          chalk.yellow(`No ${sourceType} components found, skipping report.`)
        );
        continue;
      }

      // Generate output file name
      const baseFileName = outputFile.replace(/\.(csv|json)$/, "");
      const sourceOutputFile = `${baseFileName}-${sourceType}.${options.format.toLowerCase()}`;

      console.log(chalk.blue(`\n${sourceType.toUpperCase()} Components:`));

      if (options.format.toLowerCase() === "json") {
        const jsonOutput = {};
        sourceMetrics.forEach((metrics, componentName) => {
          console.log(`${chalk.cyan(componentName)}: ${metrics.count}`);
          jsonOutput[componentName] = {
            instances: metrics.count,
            files: metrics.files,
          };
          if (metrics.packageBreakdown) {
            jsonOutput[componentName].packageBreakdown =
              metrics.packageBreakdown;
          }
        });

        await fs.writeFile(
          sourceOutputFile,
          JSON.stringify(jsonOutput, null, 2)
        );
      } else {
        // CSV format
        let csvContent =
          sourceType === "npm"
            ? "Component,Instances,Package,File Paths\n"
            : "Component,Instances,File Paths\n";

        sourceMetrics.forEach((metrics, componentName) => {
          console.log(`${chalk.cyan(componentName)}: ${metrics.count}`);

          if (sourceType === "npm" && metrics.packageBreakdown) {
            // For npm, create a row for each package
            Object.entries(metrics.packageBreakdown).forEach(
              ([pkgName, pkgMetrics]) => {
                csvContent += `"${componentName}",${pkgMetrics.count},"${pkgName}","${pkgMetrics.files.join(", ")}"\n`;
              }
            );
          } else {
            csvContent += `"${componentName}",${metrics.count},"${metrics.files.join(", ")}"\n`;
          }
        });

        await fs.writeFile(sourceOutputFile, csvContent);
      }

      console.log(
        chalk.green(`Metrics written to ${sourceOutputFile}`)
      );
    }

    console.log(chalk.green("\n✓ All reports generated successfully!\n"));
  } catch (err) {
    console.error(chalk.red(`Error reading files: ${err.message}`));
  }
};

main();
