const {
  mapComponent,
  isMmdsPackage,
  formatReplacementDisplay,
  getReplacementOptions,
  buildLegacyReplacementEntry,
  extractGuidanceSnippet,
} = require('../scripts/lib/component-mapper');

const MMDS = {
  react: ['Button', 'TextButton', 'Icon', 'Skeleton'],
  reactNative: [
    'AvatarAccount',
    'AvatarFavicon',
    'AvatarIcon',
    'AvatarNetwork',
    'AvatarToken',
    'Button',
    'Skeleton',
    'TextButton',
    'Text',
  ],
};

describe('component-mapper', () => {
  test('maps mobile Skeleton from components-temp hint to MMDS Skeleton', () => {
    const result = mapComponent(
      {
        name: 'Skeleton',
        project: 'mobile',
        deprecationMessage:
          '@deprecated Please update your code to use `Skeleton` from `app/component-library/components-temp/Skeleton`.',
      },
      MMDS,
    );

    expect(result).toMatchObject({
      component: 'Skeleton',
      package: '@metamask/design-system-react-native',
    });
  });

  test('maps mobile Avatar to multiple avatar components', () => {
    const result = mapComponent(
      {
        name: 'Avatar',
        project: 'mobile',
        deprecationMessage:
          '@deprecated Please update your code to use the individual avatar components from `@metamask/design-system-react-native` such as `AvatarAccount`, `AvatarFavicon`, `AvatarIcon`, `AvatarNetwork`, or `AvatarToken`.',
      },
      MMDS,
    );

    expect(result.component).toBe('AvatarAccount');
    expect(result.package).toBe('@metamask/design-system-react-native');
    expect(getReplacementOptions(result)).toEqual([
      'AvatarAccount',
      'AvatarFavicon',
      'AvatarIcon',
      'AvatarNetwork',
      'AvatarToken',
    ]);
  });

  test('maps mobile ButtonLink to TextButton and Button', () => {
    const result = mapComponent(
      {
        name: 'ButtonLink',
        project: 'mobile',
        deprecationMessage:
          '@deprecated ButtonLink has been replaced by design-system components. Use `TextButton` for inline links. Use `Button` with `variant={ButtonVariant.Tertiary}` for standalone link-style buttons.',
      },
      MMDS,
    );

    expect(formatReplacementDisplay(result)).toBe('TextButton · Button');
  });

  test('buildLegacyReplacementEntry uses guidance when no MMDS mapping exists', () => {
    const entry = buildLegacyReplacementEntry(null, '@deprecated Legacy component with no mapped target yet.');

    expect(entry.replacement).toBeNull();
    expect(entry.replacementOptions).toEqual([]);
    expect(entry.guidance).toContain('Legacy component with no mapped target yet');
  });

  test('isMmdsPackage identifies design-system packages', () => {
    expect(isMmdsPackage('@metamask/design-system-react-native')).toBe(true);
    expect(isMmdsPackage('component-library')).toBe(false);
  });

  test('extractGuidanceSnippet trims long deprecation prose', () => {
    const snippet = extractGuidanceSnippet(
      '* @deprecated Please update your code to use `Accordion` from `@metamask/design-system-react-native`. The API may have changed — compare props before migrating. @see README',
      40,
    );

    expect(snippet.endsWith('…')).toBe(true);
    expect(snippet.length).toBeLessThanOrEqual(40);
  });
});
