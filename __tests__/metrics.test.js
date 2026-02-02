const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');
const XLSX = require('xlsx');

const TEST_CONFIG = path.join(__dirname, 'fixtures/test-config.json');
const OUTPUT_DIR = path.join(__dirname, 'output');
const XLSX_OUTPUT = path.join(OUTPUT_DIR, 'test-metrics.xlsx');

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

  // Helper function to read XLSX file
  const readXLSX = (filePath) => {
    const workbook = XLSX.readFile(filePath);
    return workbook;
  };

  // Helper function to get sheet data as array
  const getSheetData = (workbook, sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(sheet, { header: 1 });
  };

  describe('XLSX File Generation', () => {
    test('should generate XLSX file with three sheets', async () => {
      execSync(
        `yarn node index.js --project test-project --config ${TEST_CONFIG}`,
        { stdio: 'pipe' }
      );

      const exists = await fs
        .access(XLSX_OUTPUT)
        .then(() => true)
        .catch(() => false);

      expect(exists).toBe(true);

      const workbook = readXLSX(XLSX_OUTPUT);
      expect(workbook.SheetNames).toContain('Migration Progress');
      expect(workbook.SheetNames).toContain('MMDS Usage');
      expect(workbook.SheetNames).toContain('Deprecated Usage');
    });
  });

  describe('Migration Progress Sheet', () => {
    test('should have correct headers', async () => {
      execSync(
        `yarn node index.js --project test-project --config ${TEST_CONFIG}`,
        { stdio: 'pipe' }
      );

      const workbook = readXLSX(XLSX_OUTPUT);
      const data = getSheetData(workbook, 'Migration Progress');
      const headers = data[0];

      expect(headers[0]).toBe('Deprecated Component');
      expect(headers[1]).toBe('MMDS Component Replacement');
      expect(headers[2]).toBe('Deprecated Instances');
      expect(headers[3]).toBe('MMDS Instances');
      expect(headers[4]).toBe('Migrated %');
    });

    test('should track Button migration progress', async () => {
      execSync(
        `yarn node index.js --project test-project --config ${TEST_CONFIG}`,
        { stdio: 'pipe' }
      );

      const workbook = readXLSX(XLSX_OUTPUT);
      const data = getSheetData(workbook, 'Migration Progress');

      // Find Button row
      const buttonRow = data.find(row => row[0] === 'Button');
      expect(buttonRow).toBeDefined();
      expect(buttonRow[1]).toBe('Button'); // MMDS replacement
      expect(buttonRow[2]).toBe(2); // Deprecated instances
      expect(buttonRow[3]).toBe(3); // MMDS instances
      // Migration % should be 3 / (2 + 3) = 60%
      expect(buttonRow[4]).toBe('60.00%');
    });

    test('should track Icon migration progress', async () => {
      execSync(
        `yarn node index.js --project test-project --config ${TEST_CONFIG}`,
        { stdio: 'pipe' }
      );

      const workbook = readXLSX(XLSX_OUTPUT);
      const data = getSheetData(workbook, 'Migration Progress');

      // Find Icon row
      const iconRow = data.find(row => row[0] === 'Icon');
      expect(iconRow).toBeDefined();
      expect(iconRow[1]).toBe('Icon'); // MMDS replacement
    });
  });

  describe('MMDS Usage Sheet', () => {
    test('should have correct headers', async () => {
      execSync(
        `yarn node index.js --project test-project --config ${TEST_CONFIG}`,
        { stdio: 'pipe' }
      );

      const workbook = readXLSX(XLSX_OUTPUT);
      const data = getSheetData(workbook, 'MMDS Usage');
      const headers = data[0];

      expect(headers[0]).toBe('Component');
      expect(headers[1]).toBe('Instances');
      expect(headers[2]).toBe('File Paths');
    });

    test('should track current components from NPM package', async () => {
      execSync(
        `yarn node index.js --project test-project --config ${TEST_CONFIG}`,
        { stdio: 'pipe' }
      );

      const workbook = readXLSX(XLSX_OUTPUT);
      const data = getSheetData(workbook, 'MMDS Usage');

      // Check that current components are tracked
      const components = data.slice(1).map(row => row[0]);
      expect(components).toContain('Button');
      expect(components).toContain('Icon');
      expect(components).toContain('Text');
      expect(components).toContain('Box');
    });

    test('should count Button instances correctly', async () => {
      execSync(
        `yarn node index.js --project test-project --config ${TEST_CONFIG}`,
        { stdio: 'pipe' }
      );

      const workbook = readXLSX(XLSX_OUTPUT);
      const data = getSheetData(workbook, 'MMDS Usage');

      // Button appears 3 times total in current files (2 in current-page.js, 1 in mixed-page.js)
      const buttonRow = data.find(row => row[0] === 'Button');
      expect(buttonRow).toBeDefined();
      expect(buttonRow[1]).toBe(3);
    });

    test('should track file paths', async () => {
      execSync(
        `yarn node index.js --project test-project --config ${TEST_CONFIG}`,
        { stdio: 'pipe' }
      );

      const workbook = readXLSX(XLSX_OUTPUT);
      const data = getSheetData(workbook, 'MMDS Usage');

      // Button should reference the files where it's used
      const buttonRow = data.find(row => row[0] === 'Button');
      expect(buttonRow[2]).toContain('current-page.js');
    });
  });

  describe('Deprecated Usage Sheet', () => {
    test('should have correct headers', async () => {
      execSync(
        `yarn node index.js --project test-project --config ${TEST_CONFIG}`,
        { stdio: 'pipe' }
      );

      const workbook = readXLSX(XLSX_OUTPUT);
      const data = getSheetData(workbook, 'Deprecated Usage');
      const headers = data[0];

      expect(headers[0]).toBe('Component');
      expect(headers[1]).toBe('Instances');
      expect(headers[2]).toBe('File Paths');
    });

    test('should track deprecated components from local component-library', async () => {
      execSync(
        `yarn node index.js --project test-project --config ${TEST_CONFIG}`,
        { stdio: 'pipe' }
      );

      const workbook = readXLSX(XLSX_OUTPUT);
      const data = getSheetData(workbook, 'Deprecated Usage');

      // Check that deprecated components are tracked
      const components = data.slice(1).map(row => row[0]);
      expect(components).toContain('Button');
      expect(components).toContain('Icon');
      expect(components).toContain('Modal');
      expect(components).toContain('TextField');
    });

    test('should count deprecated Button instances correctly', async () => {
      execSync(
        `yarn node index.js --project test-project --config ${TEST_CONFIG}`,
        { stdio: 'pipe' }
      );

      const workbook = readXLSX(XLSX_OUTPUT);
      const data = getSheetData(workbook, 'Deprecated Usage');

      // Button appears 2 times in deprecated-page.js
      const buttonRow = data.find(row => row[0] === 'Button');
      expect(buttonRow).toBeDefined();
      expect(buttonRow[1]).toBe(2);
    });

    test('should track file paths for deprecated components', async () => {
      execSync(
        `yarn node index.js --project test-project --config ${TEST_CONFIG}`,
        { stdio: 'pipe' }
      );

      const workbook = readXLSX(XLSX_OUTPUT);
      const data = getSheetData(workbook, 'Deprecated Usage');

      // Button should reference the files where it's used
      const buttonRow = data.find(row => row[0] === 'Button');
      expect(buttonRow[2]).toContain('deprecated-page.js');
    });
  });
});
