const {
  classifyName,
  buildExceptionIndex,
  buildAlignmentReport,
  familyIsAligned,
} = require('../scripts/lib/alignment-inventory');

const exceptions = {
  excludeFromInventory: ['PureBlackProvider'],
  helpers: ['BoxRow', 'BoxColumn'],
  families: [
    {
      id: 'sheet-dialog',
      label: 'Sheet / dialog chrome',
      rationale: 'Modal vs BottomSheet',
      react: ['Modal'],
      reactNative: ['BottomSheet'],
    },
    {
      id: 'floating-chrome',
      label: 'Floating web chrome',
      rationale: 'Popover is web-native',
      react: ['Popover'],
      reactNative: [],
    },
  ],
};

describe('classifyName', () => {
  const { byName } = buildExceptionIndex(exceptions);

  test('default is required_shared', () => {
    expect(classifyName('Button', byName)).toEqual({ kind: 'required_shared' });
  });

  test('helpers are helper_excluded', () => {
    expect(classifyName('BoxRow', byName)).toEqual({ kind: 'helper_excluded' });
  });

  test('family members are platform_exception', () => {
    expect(classifyName('Modal', byName)).toEqual({
      kind: 'platform_exception',
      familyId: 'sheet-dialog',
    });
    expect(classifyName('BottomSheet', byName)).toEqual({
      kind: 'platform_exception',
      familyId: 'sheet-dialog',
    });
  });

  test('excluded names are excluded', () => {
    expect(classifyName('PureBlackProvider', byName).kind).toBe('excluded');
  });
});

describe('familyIsAligned', () => {
  const family = exceptions.families[0];

  test('aligned when each platform has its members', () => {
    expect(familyIsAligned(family, new Set(['Modal']), new Set(['BottomSheet']))).toBe(true);
  });

  test('not aligned when a required platform member is missing', () => {
    expect(familyIsAligned(family, new Set(['Modal']), new Set())).toBe(false);
  });

  test('empty platform list is not required', () => {
    const floating = exceptions.families[1];
    expect(familyIsAligned(floating, new Set(['Popover']), new Set())).toBe(true);
  });
});

describe('buildAlignmentReport', () => {
  const report = buildAlignmentReport({
    react: ['Button', 'Modal', 'Popover', 'PureBlackProvider', 'Text'],
    reactNative: ['Button', 'BottomSheet', 'BoxRow', 'Card', 'Text'],
    reactConnect: ['Button'],
    reactNativeConnect: ['Button', 'BottomSheet'],
    exceptions,
    date: '2026-09-07',
    generatedAt: '2026-09-07T00:00:00.000Z',
  });

  test('drops excluded inventory names', () => {
    expect(report.components.map((c) => c.name)).not.toContain('PureBlackProvider');
  });

  test('does not treat Modal or BottomSheet as required gaps', () => {
    const modal = report.components.find((c) => c.name === 'Modal');
    const sheet = report.components.find((c) => c.name === 'BottomSheet');
    expect(modal.classification).toBe('platform_exception');
    expect(sheet.classification).toBe('platform_exception');
    expect(modal.missingOn).toEqual([]);
    expect(sheet.missingOn).toEqual([]);
  });

  test('Card missing on React is an open gap', () => {
    const card = report.components.find((c) => c.name === 'Card');
    expect(card.classification).toBe('required_shared');
    expect(card.missingOn).toEqual(['react']);
    expect(report.queue.map((q) => q.name)).toContain('Card');
  });

  test('Popover missing on RN is not a gap', () => {
    const popover = report.components.find((c) => c.name === 'Popover');
    expect(popover.missingOn).toEqual([]);
  });

  test('BoxRow is helper_excluded', () => {
    expect(report.components.find((c) => c.name === 'BoxRow').classification).toBe('helper_excluded');
  });

  test('Code Connect infers Figma as linked, not a required-platform gap', () => {
    expect(report.figmaStatus).toBe('code-connect');
    expect(report.components.find((c) => c.name === 'Button').figma).toBe('linked');
    expect(report.components.find((c) => c.name === 'BottomSheet').figma).toBe('linked');
    expect(report.components.find((c) => c.name === 'Text').figma).toBe('unknown');
    expect(report.summary.figmaLinked).toBe(2);
    expect(report.components.every((c) => !c.missingOn.includes('figma'))).toBe(true);
  });

  test('figmaUrl is stored when Code Connect maps provide one', () => {
    const withUrls = buildAlignmentReport({
      react: ['Button'],
      reactNative: ['Button'],
      reactConnect: { Button: 'https://www.figma.com/design/abc/MMDS?node-id=1-2' },
      reactNativeConnect: [],
      exceptions,
      date: '2026-09-07',
      generatedAt: '2026-09-07T00:00:00.000Z',
    });
    expect(withUrls.components[0].figmaUrl).toBe('https://www.figma.com/design/abc/MMDS?node-id=1-2');
  });

  test('required coverage counts only required_shared items present on both code platforms', () => {
    // required: Button, Text, Card — Button+Text covered, Card missing React → 2/3
    expect(report.summary.requiredSharedCount).toBe(3);
    expect(report.summary.openGaps).toBe(1);
    expect(report.summary.missingOnReact).toBe(1);
    expect(report.summary.requiredCoverage).toBe(66.7);
  });

  test('Code Connect coverage uses existing code platforms as slots', () => {
    expect(report.summary.codeConnectSlots).toBeGreaterThan(0);
    expect(report.components.find((c) => c.name === 'Button').codeConnectReact).toBe(true);
    expect(report.components.find((c) => c.name === 'Text').codeConnectReact).toBe(false);
  });
});

describe('extractFigmaUrl', () => {
  const { extractFigmaUrl } = require('../scripts/lib/alignment-inventory');

  test('reads the figma.connect URL', () => {
    const src = `
      figma.connect(
        Button,
        'https://www.figma.com/design/1D6tnzXqWgnUC3spaAOELN/MMDS-Components?node-id=1%3A304',
        { props: {} },
      );
    `;
    expect(extractFigmaUrl(src)).toBe(
      'https://www.figma.com/design/1D6tnzXqWgnUC3spaAOELN/MMDS-Components?node-id=1%3A304',
    );
  });

  test('returns null when there is no connect URL', () => {
    expect(extractFigmaUrl('export const Button = () => null;')).toBeNull();
  });
});
