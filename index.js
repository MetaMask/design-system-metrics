const fs = require("fs").promises;
const fsSync = require("fs");
const { glob } = require("glob");
const path = require("path");
const babelParser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const { program } = require("commander");
const chalk = require("chalk");
const CodeOwnersParser = require("./scripts/codeowners-parser");
const { minimatch } = require("minimatch");

let config;
let codeOwnersParser = null;
let codeOwnerMetricIgnoreGlobs = [];

// Function to load and parse the configuration file
const loadConfig = async (configPath) => {
  try {
    const configContent = await fs.readFile(configPath, "utf8");
    config = JSON.parse(configContent);
    validateConfig(config);
  } catch (err) {
    console.error(
      chalk.red(`Failed to load configuration file: ${err.message}`),
    );
    process.exit(1);
  }
};

// Validate config structure
const validateConfig = (cfg) => {
  if (!cfg.projects || typeof cfg.projects !== "object") {
    throw new Error('Config must have a "projects" object');
  }

  for (const [projectName, projectCfg] of Object.entries(cfg.projects)) {
    if (
      projectCfg.deprecatedComponents &&
      typeof projectCfg.deprecatedComponents !== "object"
    ) {
      throw new Error(
        `Project "${projectName}" deprecatedComponents must be an object`,
      );
    }

    // Check if using old array format
    if (Array.isArray(projectCfg.deprecatedComponents)) {
      console.warn(
        chalk.yellow(
          `\nWarning: Project "${projectName}" is using the old array format for deprecatedComponents.`,
        ),
      );
      console.warn(
        chalk.yellow(
          "Please migrate to the new object format with paths and replacement info.\n",
        ),
      );
    }
  }
};

/**
 * Count MMDS components available in the design system package
 */
const countAvailableMMDSComponents = (currentComponents) => {
  if (!currentComponents) return 0;
  return new Set(currentComponents).size;
};

/**
 * Get filtered list of MMDS components
 */
const getMMDSComponentsList = (currentComponents) => {
  if (!currentComponents) return [];
  return Array.from(new Set(currentComponents)).sort();
};

/**
 * Find new MMDS components by comparing with previous summary
 */
const findNewComponents = async (outputBasePath, currentComponents) => {
  try {
    const outputDir = path.dirname(outputBasePath);
    const files = await fs.readdir(outputDir);
    const prefix = path.basename(outputBasePath).split("-")[0];
    const currentFilename = path.basename(outputBasePath) + "-summary.json";
    const summaryFiles = files
      .filter(
        (f) =>
          f.includes("-summary.json") &&
          f.startsWith(prefix) &&
          f !== currentFilename,
      )
      .sort()
      .reverse();

    if (summaryFiles.length > 0) {
      const previousSummaryPath = path.join(outputDir, summaryFiles[0]);
      const previousSummary = JSON.parse(
        await fs.readFile(previousSummaryPath, "utf8"),
      );

      if (previousSummary.mmdsComponentsList) {
        const previousComponents = new Set(previousSummary.mmdsComponentsList);
        return currentComponents.filter(
          (comp) => !previousComponents.has(comp),
        );
      }
    }
  } catch (err) {
    console.log(
      chalk.yellow(
        `Could not find previous summary to compare: ${err.message}`,
      ),
    );
  }
  return [];
};

// Define CLI options using Commander
program
  .version("2.6.0")
  .description(
    "Design System Metrics CLI Tool - Track component usage and migration progress",
  )
  .requiredOption(
    "-p, --project <name>",
    "Specify the project to audit (e.g., extension, mobile)",
  )
  .option(
    "-c, --config <path>",
    "Path to custom config file",
    path.join(__dirname, "config.json"),
  )
  .parse(process.argv);

const options = program.opts();

// Initialize component instances and file mappings
// Structure: Map<componentName, Map<source, Map<specificPath, { count, files }>>>
let componentMetrics = new Map();

// Structure: Map<owner, { mmdsInstances, deprecatedInstances, files }>
let codeOwnerMetrics = new Map();
let repoRootPath = null;

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

  // Track by code owner if parser is available
  if (codeOwnersParser) {
    const absoluteFilePath = path.resolve(process.cwd(), filePath);
    let lookupPath = filePath;
    if (repoRootPath) {
      const relativePath = path.relative(repoRootPath, absoluteFilePath).replace(/\\/g, "/");
      if (relativePath && !relativePath.startsWith("..")) {
        lookupPath = relativePath;
      }
    }

    // If this file is part of a path we want to exclude from code owner metrics,
    // skip tracking it for the code owner stats only.
    if (codeOwnerMetricIgnoreGlobs.some((pattern) => minimatch(lookupPath, pattern, { dot: true }))) {
      return;
    }

    const owner = codeOwnersParser.getPrimaryOwner(lookupPath);
    if (!codeOwnerMetrics.has(owner)) {
      codeOwnerMetrics.set(owner, {
        mmdsInstances: 0,
        deprecatedInstances: 0,
        mmdsByComponent: new Map(),
        deprecatedByComponent: new Map(),
        files: new Set(),
      });
    }

    const ownerMetrics = codeOwnerMetrics.get(owner);
    if (source === "current") {
      ownerMetrics.mmdsInstances++;
      ownerMetrics.mmdsByComponent.set(
        componentName,
        (ownerMetrics.mmdsByComponent.get(componentName) || 0) + 1,
      );
    } else if (source === "deprecated") {
      ownerMetrics.deprecatedInstances++;
      ownerMetrics.deprecatedByComponent.set(
        componentName,
        (ownerMetrics.deprecatedByComponent.get(componentName) || 0) + 1,
      );
    }
    ownerMetrics.files.add(filePath);
  }
};

// Helper function to check if import path matches any component paths
const matchComponentPath = (importPath, deprecatedComponents) => {
  // Normalize the import path
  const normalizedImportPath = importPath.replace(/\\/g, "/");

  for (const [componentName, config] of Object.entries(deprecatedComponents)) {
    for (const componentPath of config.paths) {
      // Normalize the component path
      const normalizedComponentPath = componentPath.replace(/\\/g, "/");

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
      const pathParts = normalizedComponentPath.split("/");
      const importParts = normalizedImportPath.split("/");

      // If import includes "/component-library" and path includes "/component-library"
      if (
        normalizedImportPath.includes("/component-library") &&
        normalizedComponentPath.includes("/component-library")
      ) {
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
  currentPackages,
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
        const deprecatedMatch = matchComponentPath(
          importPath,
          deprecatedComponents,
        );
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
            const { source, specificPath } =
              componentImports.get(componentName);
            trackComponent(componentName, source, specificPath, filePath);
          }
        }
      },
    });
  } catch (err) {
    console.error(
      chalk.yellow(`Error processing file ${filePath}: ${err.message}`),
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
        `Project "${projectName}" is not defined in the configuration file.`,
      ),
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
    codeOwnerMetricIgnoreGlobs: projectCodeOwnerIgnore = [],
  } = projectConfig;

  // Add date to the output filename (from env var or today)
  const today =
    process.env.METRICS_DATE || new Date().toISOString().split("T")[0]; // YYYY-MM-DD format

  // Derive a base output path (no extension) for JSON outputs
  const outputDir = path.dirname(baseOutputFile);
  const baseName = path.basename(baseOutputFile, path.extname(baseOutputFile));
  const outputBasePath = path.join(outputDir, `${baseName}-${today}`);

  const currentComponentsSet = new Set(currentComponents);

  // Derive target repository root from file pattern (e.g., repos/metamask-extension/**).
  if (filePattern.startsWith("repos/")) {
    const parts = filePattern.split("/");
    if (parts.length >= 2) {
      repoRootPath = path.resolve(process.cwd(), parts[0], parts[1]);
    }
  }

  if (!repoRootPath) {
    repoRootPath = process.cwd();
  }

  // Configure per-project exclusions for code owner metrics (does not affect other metrics).
  codeOwnerMetricIgnoreGlobs = (projectCodeOwnerIgnore || []).map((pattern) =>
    pattern.replace(/\\/g, "/"),
  );

  // Initialize CodeOwners parser
  const codeownersCandidates = [
    path.join(repoRootPath, ".github", "CODEOWNERS"),
    path.join(repoRootPath, "CODEOWNERS"),
  ];
  const codeownersPath = codeownersCandidates.find((candidate) => fsSync.existsSync(candidate));
  if (codeownersPath) {
    codeOwnersParser = new CodeOwnersParser(codeownersPath);
    console.log(chalk.blue(`✓ Loaded CODEOWNERS file from ${codeownersPath}`));
  } else {
    console.log(chalk.yellow("⚠ CODEOWNERS file not found, skipping code owner tracking"));
  }

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
          currentPackages,
        ),
      ),
    );

    console.log(chalk.green("\nGenerating Component Migration Metrics...\n"));

    // Collect metrics by component and calculate totals
    const deprecatedMetrics = new Map(); // Map<componentName, { totalCount, pathBreakdown, files }>
    const currentMetrics = new Map(); // Map<componentName, { count, files }>

    // Aggregate deprecated metrics across all paths
    for (const [componentName, componentConfig] of Object.entries(
      deprecatedComponents,
    )) {
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

        currentMetrics.set(componentName, {
          count: totalCount,
          files: allFiles,
        });
      }
    });

    // Filter to components that have an MMDS replacement
    const componentsWithMMDSReplacement = Array.from(
      deprecatedMetrics.entries(),
    ).filter(
      ([, metrics]) =>
        metrics.replacement &&
        metrics.replacement.package &&
        metrics.replacement.package.includes("@metamask/design-system"),
    );

    // Group deprecated components by their MMDS replacement component
    const groupedByMMDS = new Map();
    componentsWithMMDSReplacement.forEach(([componentName, metrics]) => {
      const mmdsComp = metrics.replacement.component;
      if (!groupedByMMDS.has(mmdsComp)) {
        groupedByMMDS.set(mmdsComp, []);
      }
      groupedByMMDS.get(mmdsComp).push([componentName, metrics]);
    });

    // Compute totals for migration summary
    let totalDeprecated = 0;
    let totalMMDS = 0;

    for (const [mmdsComp, deprecatedGroup] of groupedByMMDS.entries()) {
      const mmdsCount = currentMetrics.get(mmdsComp)?.count || 0;
      totalMMDS += mmdsCount;
      deprecatedGroup.forEach(([, metrics]) => {
        totalDeprecated += metrics.totalCount;
      });
    }

    // Total MMDS usage across all tracked components
    let totalMMDSUsage = 0;
    currentComponentsSet.forEach((componentName) => {
      const metrics = currentMetrics.get(componentName);
      if (metrics) totalMMDSUsage += metrics.count;
    });

    const componentsWithNoReplacement = Array.from(
      deprecatedMetrics.entries(),
    ).filter(([, metrics]) => !metrics.replacement);

    let totalNoReplacement = 0;
    componentsWithNoReplacement.forEach(([, metrics]) => {
      totalNoReplacement += metrics.totalCount;
    });

    console.log(
      chalk.blue(
        `MMDS vs Legacy: ${componentsWithMMDSReplacement.length} components tracked`,
      ),
    );
    console.log(
      chalk.blue(
        `Total: ${totalMMDS} MMDS / ${totalDeprecated} Legacy (${totalDeprecated + totalMMDS > 0 ? ((totalMMDS / (totalDeprecated + totalMMDS)) * 100).toFixed(2) : "0.00"}%)`,
      ),
    );
    console.log(
      chalk.blue(`Total MMDS Usage: ${totalMMDSUsage} instances`),
    );
    console.log(
      chalk.blue(
        `No MMDS Replacement Yet: ${componentsWithNoReplacement.length} components`,
      ),
    );

    // Create output directory if it doesn't exist
    await fs.mkdir(outputDir, { recursive: true });

    // Build canonical machine-readable component list grouped by MMDS replacement
    const groupedComponentData = Array.from(groupedByMMDS.entries())
      .map(([mmdsComp, deprecatedGroup]) => {
        let legacyInstances = 0;
        const legacyComponents = [];

        deprecatedGroup.forEach(([componentName, metrics]) => {
          legacyInstances += metrics.totalCount;
          legacyComponents.push(componentName);
        });

        const mmdsInstances = currentMetrics.get(mmdsComp)?.count || 0;
        const totalInstances = legacyInstances + mmdsInstances;
        const migrationPercentage =
          totalInstances > 0
            ? ((mmdsInstances / totalInstances) * 100).toFixed(2)
            : "0.00";

        return {
          replacementComponent: mmdsComp,
          legacyComponents: legacyComponents.sort(),
          legacyInstances,
          mmdsInstances,
          totalInstances,
          migrationPercentage,
        };
      })
      .sort((a, b) => b.totalInstances - a.totalInstances);

    // Aggregate code owner stats
    const codeOwnerStats = {};

    // Include all CODEOWNERS entries even when they currently have zero matched instances.
    if (codeOwnersParser) {
      for (const owner of codeOwnersParser.getAllTeams()) {
        codeOwnerStats[owner] = {
          mmdsInstances: 0,
          deprecatedInstances: 0,
          totalInstances: 0,
          migrationPercentage: "0.00",
          filesCount: 0,
          mmdsByComponent: {},
          deprecatedByComponent: {},
        };
      }
    }

    for (const [owner, metrics] of codeOwnerMetrics.entries()) {
      const totalInstances = metrics.mmdsInstances + metrics.deprecatedInstances;
      const migrationPercentage = totalInstances > 0
        ? ((metrics.mmdsInstances / totalInstances) * 100).toFixed(2)
        : "0.00";

      const sortByCountDesc = (entries) =>
        Object.fromEntries([...entries].sort((a, b) => b[1] - a[1]));

      const mmdsByComponent = sortByCountDesc(
        metrics.mmdsByComponent || new Map(),
      );
      const deprecatedByComponent = sortByCountDesc(
        metrics.deprecatedByComponent || new Map(),
      );

      codeOwnerStats[owner] = {
        mmdsInstances: metrics.mmdsInstances,
        deprecatedInstances: metrics.deprecatedInstances,
        totalInstances: totalInstances,
        migrationPercentage: migrationPercentage,
        filesCount: metrics.files.size,
        mmdsByComponent,
        deprecatedByComponent,
      };
    }

    const mmdsComponentsAvailable = countAvailableMMDSComponents(
      projectConfig.currentComponents,
    );
    const mmdsComponentsList = getMMDSComponentsList(
      projectConfig.currentComponents,
    );
    const newComponents = await findNewComponents(
      outputBasePath,
      mmdsComponentsList,
    );

    const summaryTotalAll = totalDeprecated + totalMMDSUsage;
    const summaryTotalPercentage =
      summaryTotalAll > 0 ? (totalMMDSUsage / summaryTotalAll) * 100 : 0;

    // Write summary JSON
    const summaryFile = `${outputBasePath}-summary.json`;
    const summary = {
      project: projectName,
      date: today,
      mmdsInstances: totalMMDSUsage,
      deprecatedInstances: totalDeprecated,
      mmdsUsageTotal: totalMMDS,
      totalInstances: summaryTotalAll,
      migrationPercentage: summaryTotalPercentage.toFixed(2),
      componentsTracked: groupedByMMDS.size,
      mmdsComponentsAvailable: mmdsComponentsAvailable,
      mmdsComponentsList: mmdsComponentsList,
      newComponents: newComponents,
      noReplacementComponents: componentsWithNoReplacement.length,
      totalNoReplacementInstances: totalNoReplacement,
      codeOwnerStats: codeOwnerStats,
    };
    await fs.writeFile(summaryFile, JSON.stringify(summary, null, 2));

    // Write data JSON used by dashboard/timeline
    const dataFile = `${outputBasePath}-data.json`;
    const dataSummary = {
      totalComponents: groupedByMMDS.size,
      mmdsInstances: summary.mmdsInstances,
      deprecatedInstances: summary.deprecatedInstances,
      totalInstances: summary.totalInstances,
      migrationPercentage: summary.migrationPercentage,
      fullyMigrated: groupedComponentData.filter(
        (comp) => comp.legacyInstances === 0 && comp.mmdsInstances > 0,
      ).length,
      inProgress: groupedComponentData.filter(
        (comp) => comp.legacyInstances > 0 && comp.mmdsInstances > 0,
      ).length,
      notStarted: groupedComponentData.filter(
        (comp) => comp.legacyInstances > 0 && comp.mmdsInstances === 0,
      ).length,
      codeOwnerStats,
    };

    const dataOutput = {
      project: projectName,
      date: today,
      generatedAt: new Date().toISOString(),
      mmdsComponentsAvailable,
      mmdsComponentsList,
      newComponents,
      summary: dataSummary,
      components: groupedComponentData,
    };

    await fs.writeFile(dataFile, JSON.stringify(dataOutput, null, 2));

    console.log(chalk.green(`\n✓ Summary written to ${summaryFile}`));
    console.log(chalk.green(`✓ Data written to ${dataFile}`));
    console.log(chalk.green("✓ Metrics generated successfully!\n"));
  } catch (err) {
    console.error(chalk.red(`Error: ${err.message}`));
    console.error(chalk.red(err.stack));
  }
};

main();
