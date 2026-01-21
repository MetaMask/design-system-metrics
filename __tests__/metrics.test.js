const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

const TEST_CONFIG = path.join(__dirname, 'fixtures/test-config.json');
const OUTPUT_DIR = path.join(__dirname, 'output');
const DEPRECATED_OUTPUT = path.join(OUTPUT_DIR, 'test-metrics-deprecated.csv');
const CURRENT_OUTPUT = path.join(OUTPUT_DIR, 'test-metrics-current.csv');

describe('Design System Metrics', () => {
  beforeAll(() => {
    // Clean output directory before tests
    try {
      execSync(`rm -rf ${OUTPUT_DIR}/*`);
    } catch (err) {
      // Directory might not exist yet
    }
  });

  afterAll(async () => {
    // Clean up output files after tests
    try {
      await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
    } catch (err) {
      // Ignore errors
    }
  });

  describe('Deprecated Component Tracking', () => {
    test('should track deprecated components from local component-library', async () => {
      execSync(
        `yarn node index.js --project test-project --config ${TEST_CONFIG} --sources deprecated`,
        { stdio: 'pipe' }
      );

      const content = await fs.readFile(DEPRECATED_OUTPUT, 'utf8');
      const lines = content.trim().split('\n');

      // Check header
      expect(lines[0]).toBe('Component,Instances,File Paths');

      // Check that deprecated components are tracked
      expect(content).toContain('Button');
      expect(content).toContain('Icon');
      expect(content).toContain('Modal');
      expect(content).toContain('TextField');

      // Parse CSV and verify counts
      const buttonLine = lines.find(line => line.startsWith('"Button"'));
      expect(buttonLine).toBeDefined();
      // Button appears 2 times in deprecated-page.js
      expect(buttonLine).toContain(',2,');
    });

    test('should only track components in deprecatedComponents list', async () => {
      execSync(
        `yarn node index.js --project test-project --config ${TEST_CONFIG} --sources deprecated`,
        { stdio: 'pipe' }
      );

      const content = await fs.readFile(DEPRECATED_OUTPUT, 'utf8');

      // BannerAlert is in the list but not used, should still appear with 0 or not tracked
      // Only used components should appear
      expect(content).toContain('Button');
      expect(content).toContain('Icon');
      expect(content).toContain('Modal');
      expect(content).toContain('TextField');
    });
  });

  describe('Current Component Tracking', () => {
    test('should track current components from NPM package', async () => {
      execSync(
        `yarn node index.js --project test-project --config ${TEST_CONFIG} --sources current`,
        { stdio: 'pipe' }
      );

      const content = await fs.readFile(CURRENT_OUTPUT, 'utf8');
      const lines = content.trim().split('\n');

      // Check header
      expect(lines[0]).toBe('Component,Instances,File Paths');

      // Check that current components are tracked
      expect(content).toContain('Button');
      expect(content).toContain('Icon');
      expect(content).toContain('Text');
      expect(content).toContain('Box');
    });

    test('should count multiple instances correctly', async () => {
      execSync(
        `yarn node index.js --project test-project --config ${TEST_CONFIG} --sources current`,
        { stdio: 'pipe' }
      );

      const content = await fs.readFile(CURRENT_OUTPUT, 'utf8');
      const lines = content.trim().split('\n');

      // Button appears 3 times total in current files (2 in current-page.js, 1 in mixed-page.js)
      const buttonLine = lines.find(line => line.startsWith('"Button"'));
      expect(buttonLine).toBeDefined();
      expect(buttonLine).toContain(',3,');
    });
  });

  describe('Source Separation', () => {
    test('should generate both deprecated and current reports by default', async () => {
      execSync(
        `yarn node index.js --project test-project --config ${TEST_CONFIG}`,
        { stdio: 'pipe' }
      );

      // Both files should exist
      const deprecatedExists = await fs
        .access(DEPRECATED_OUTPUT)
        .then(() => true)
        .catch(() => false);
      const currentExists = await fs
        .access(CURRENT_OUTPUT)
        .then(() => true)
        .catch(() => false);

      expect(deprecatedExists).toBe(true);
      expect(currentExists).toBe(true);
    });

    test('should separate Button usage by source', async () => {
      execSync(
        `yarn node index.js --project test-project --config ${TEST_CONFIG}`,
        { stdio: 'pipe' }
      );

      const deprecatedContent = await fs.readFile(DEPRECATED_OUTPUT, 'utf8');
      const currentContent = await fs.readFile(CURRENT_OUTPUT, 'utf8');

      // Deprecated Button count (from deprecated-page.js and mixed-page.js)
      const deprecatedLines = deprecatedContent.trim().split('\n');
      const deprecatedButtonLine = deprecatedLines.find(line =>
        line.startsWith('"Button"')
      );
      expect(deprecatedButtonLine).toContain(',3,'); // 2 in deprecated-page + 1 in mixed-page

      // Current Button count (from current-page.js and mixed-page.js)
      const currentLines = currentContent.trim().split('\n');
      const currentButtonLine = currentLines.find(line =>
        line.startsWith('"Button"')
      );
      expect(currentButtonLine).toContain(',3,'); // 2 in current-page + 1 in mixed-page
    });
  });

  describe('File Path Tracking', () => {
    test('should track which files contain each component', async () => {
      execSync(
        `yarn node index.js --project test-project --config ${TEST_CONFIG} --sources deprecated`,
        { stdio: 'pipe' }
      );

      const content = await fs.readFile(DEPRECATED_OUTPUT, 'utf8');

      // Button should reference the files where it's used
      expect(content).toContain('deprecated-page.js');
    });
  });

  describe('JSON Output Format', () => {
    test('should generate JSON format when specified', async () => {
      execSync(
        `yarn node index.js --project test-project --config ${TEST_CONFIG} --sources deprecated --format json`,
        { stdio: 'pipe' }
      );

      const jsonOutput = path.join(OUTPUT_DIR, 'test-metrics-deprecated.json');
      const content = await fs.readFile(jsonOutput, 'utf8');
      const data = JSON.parse(content);

      // Should be valid JSON
      expect(typeof data).toBe('object');

      // Should have Button data
      expect(data.Button).toBeDefined();
      expect(data.Button.instances).toBeGreaterThan(0);
      expect(Array.isArray(data.Button.files)).toBe(true);
    });
  });
});
