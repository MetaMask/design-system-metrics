const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');
const ExcelJS = require('exceljs');

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
  const readXLSX = async (filePath) => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    return workbook;
  };

  // Helper function to get sheet data as array
  const getSheetData = (workbook, sheetName) => {
    const worksheet = workbook.getWorksheet(sheetName);
    const data = [];
    worksheet.eachRow((row) => {
      data.push(row.values.slice(1)); // slice(1) to remove the empty first element
    });
    return data;
  };

  describe('XLSX File Generation', () => {
    test('should generate XLSX file with five sheets', async () => {
      execSync(
        `yarn node index.js --project test-project --config ${TEST_CONFIG}`,
        { stdio: 'pipe' }
      );

      const exists = await fs
        .access(XLSX_OUTPUT)
        .then(() => true)
        .catch(() => false);

      expect(exists).toBe(true);

      const workbook = await readXLSX(XLSX_OUTPUT);
      const sheetNames = workbook.worksheets.map(ws => ws.name);
      expect(sheetNames).toContain('Migration Progress');
      expect(sheetNames).toContain('Intermediate Migrations');
      expect(sheetNames).toContain('Path-Level Detail');
      expect(sheetNames).toContain('MMDS Usage');
      expect(sheetNames).toContain('No Replacement');
    });
  });

  describe('Migration Progress Sheet', () => {
    test('should have correct headers', async () => {
      execSync(
        `yarn node index.js --project test-project --config ${TEST_CONFIG}`,
        { stdio: 'pipe' }
      );

      const workbook = await readXLSX(XLSX_OUTPUT);
      const data = getSheetData(workbook, 'Migration Progress');
      const headers = data[0];

      expect(headers[0]).toBe('Deprecated Component');
      expect(headers[1]).toBe('Source Paths');
      expect(headers[2]).toBe('MMDS Component');
      expect(headers[3]).toBe('Deprecated Instances');
      expect(headers[4]).toBe('MMDS Instances');
      expect(headers[5]).toBe('Migrated %');
    });

    test('should track Button migration progress', async () => {
      execSync(
        `yarn node index.js --project test-project --config ${TEST_CONFIG}`,
        { stdio: 'pipe' }
      );

      const workbook = await readXLSX(XLSX_OUTPUT);
      const data = getSheetData(workbook, 'Migration Progress');

      // Find Button row
      const buttonRow = data.find(row => row[0] === 'Button');
      expect(buttonRow).toBeDefined();
      expect(buttonRow[2]).toBe('Button'); // MMDS replacement
      expect(buttonRow[3]).toBe(2); // Deprecated instances
      expect(buttonRow[4]).toBe(3); // MMDS instances
      // Migration % should be 3 / (2 + 3) = 60%
      expect(buttonRow[5]).toBe('60.00%');
    });

    test('should track Icon migration progress', async () => {
      execSync(
        `yarn node index.js --project test-project --config ${TEST_CONFIG}`,
        { stdio: 'pipe' }
      );

      const workbook = await readXLSX(XLSX_OUTPUT);
      const data = getSheetData(workbook, 'Migration Progress');

      // Find Icon row
      const iconRow = data.find(row => row[0] === 'Icon');
      expect(iconRow).toBeDefined();
      expect(iconRow[2]).toBe('Icon'); // MMDS replacement
    });
  });

  describe('Path-Level Detail Sheet', () => {
    test('should have correct headers', async () => {
      execSync(
        `yarn node index.js --project test-project --config ${TEST_CONFIG}`,
        { stdio: 'pipe' }
      );

      const workbook = await readXLSX(XLSX_OUTPUT);
      const data = getSheetData(workbook, 'Path-Level Detail');
      const headers = data[0];

      expect(headers[0]).toBe('Component');
      expect(headers[1]).toBe('Specific Path');
      expect(headers[2]).toBe('Instances');
      expect(headers[3]).toBe('File Paths');
    });

    test('should track deprecated components by path', async () => {
      execSync(
        `yarn node index.js --project test-project --config ${TEST_CONFIG}`,
        { stdio: 'pipe' }
      );

      const workbook = await readXLSX(XLSX_OUTPUT);
      const data = getSheetData(workbook, 'Path-Level Detail');

      // Check that deprecated components are tracked
      const components = data.slice(1).map(row => row[0]);
      expect(components).toContain('Button');
      expect(components).toContain('Icon');
    });

    test('should count Button instances by path', async () => {
      execSync(
        `yarn node index.js --project test-project --config ${TEST_CONFIG}`,
        { stdio: 'pipe' }
      );

      const workbook = await readXLSX(XLSX_OUTPUT);
      const data = getSheetData(workbook, 'Path-Level Detail');

      // Button appears 2 times in deprecated-page.js
      const buttonRow = data.find(row => row[0] === 'Button');
      expect(buttonRow).toBeDefined();
      expect(buttonRow[2]).toBe(2);
    });

    test('should track file paths for deprecated components', async () => {
      execSync(
        `yarn node index.js --project test-project --config ${TEST_CONFIG}`,
        { stdio: 'pipe' }
      );

      const workbook = await readXLSX(XLSX_OUTPUT);
      const data = getSheetData(workbook, 'Path-Level Detail');

      // Button should reference the files where it's used
      const buttonRow = data.find(row => row[0] === 'Button');
      expect(buttonRow[3]).toContain('deprecated-page.js');
    });
  });

  describe('MMDS Usage Sheet', () => {
    test('should have correct headers', async () => {
      execSync(
        `yarn node index.js --project test-project --config ${TEST_CONFIG}`,
        { stdio: 'pipe' }
      );

      const workbook = await readXLSX(XLSX_OUTPUT);
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

      const workbook = await readXLSX(XLSX_OUTPUT);
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

      const workbook = await readXLSX(XLSX_OUTPUT);
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

      const workbook = await readXLSX(XLSX_OUTPUT);
      const data = getSheetData(workbook, 'MMDS Usage');

      // Button should reference the files where it's used
      const buttonRow = data.find(row => row[0] === 'Button');
      expect(buttonRow[2]).toContain('current-page.js');
    });
  });

  describe('No Replacement Sheet', () => {
    test('should have correct headers', async () => {
      execSync(
        `yarn node index.js --project test-project --config ${TEST_CONFIG}`,
        { stdio: 'pipe' }
      );

      const workbook = await readXLSX(XLSX_OUTPUT);
      const data = getSheetData(workbook, 'No Replacement');
      const headers = data[0];

      expect(headers[0]).toBe('Component');
      expect(headers[1]).toBe('Path');
      expect(headers[2]).toBe('Instances');
      expect(headers[3]).toBe('File Paths');
    });

    test('should track components with no replacement', async () => {
      execSync(
        `yarn node index.js --project test-project --config ${TEST_CONFIG}`,
        { stdio: 'pipe' }
      );

      const workbook = await readXLSX(XLSX_OUTPUT);
      const data = getSheetData(workbook, 'No Replacement');

      // TextField has no replacement in the test config
      const components = data.slice(1).map(row => row[0]);
      expect(components).toContain('TextField');
    });
  });
});
