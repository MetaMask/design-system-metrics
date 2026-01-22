# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.0] - 2026-01-22

### Added

- **Mobile Components**: Added 10 missing components to mobile deprecatedComponents list:
  - BadgeNotifications
  - HeaderBase
  - ListItemMultiSelect
  - ListItemSelect
  - RadioButton
  - SelectButton
  - SelectOption
  - SelectValue
  - SensitiveText
  - Skeleton
- **Documentation**: Added Future Feature Ideas section to README
  - Props Audit concept
  - Team Adoption Metrics using CODEOWNERS

### Changed

- **Mobile Components**: Updated to 110 deprecated components (from 100)

### Fixed

- **CHANGELOG**: Corrected inaccuracies in version history
  - Removed duplicate 2.0.0 entry
  - Fixed dates and component counts
  - Clarified that 2.1.0 did not include the 10 mobile components

## [2.1.0] - 2026-01-22

### Added

- **Documentation**: CHANGELOG.md created with full version history from 1.0.0 through 2.1.0

## [2.0.0] - 2026-01-21

### 🎉 Major Refactor

This release represents a complete architectural overhaul to better align with migration tracking goals.

### Added

- **Explicit Component Lists**: Introduced `deprecatedComponents` and `currentComponents` arrays per project
- **Missing Components**: Added 5 components to Extension tracking:
  - FileUploader
  - LottieAnimation
  - Skeleton
  - SensitiveText
  - Textarea (restored)
- **Comprehensive Test Suite**: Added Jest test suite with 8 passing tests
  - Test fixtures for deprecated, current, and mixed usage
  - Tests for source separation and file path tracking
  - JSON output format testing
- **Test Scripts**: Added `yarn test` and `yarn test:watch` commands
- **Jest Configuration**: Added jest.config.js for proper test execution

### Changed

- **BREAKING**: Simplified from 4 projects to 2 (extension and mobile only)
- **BREAKING**: Removed `design-system-react` and `design-system-react-native` project configs
- **BREAKING**: Split `components` array into `deprecatedComponents` and `currentComponents`
- **Architecture**: Local `/component-library` imports now map to `deprecatedComponents`
- **Architecture**: NPM package imports now map to `currentComponents`
- **Extension Components**: Now tracks 47 deprecated + 24 current components
- **Mobile Components**: Now tracks 100 deprecated + 25 current components
- **Component Lists**: Updated to match actual folder structure and NPM package exports
- Removed AvatarAccount from Extension deprecatedComponents (only exists in NPM package)

### Fixed

- Component lists now accurately reflect the actual local component-library folders
- Test expectations now match actual component usage patterns
- All 8 tests passing

### Documentation

- Updated README.md with new architecture
- Clarified two-project structure (extension and mobile)
- Documented `deprecatedComponents` vs `currentComponents` mental model

## [1.0.2] - 2024-10-04

### Security

- Dependency updates via Dependabot

## [1.0.1] - 2024-10-04

### Fixed

- Added missing component
- Updated dependencies

### Security

- Updated brace-expansion
- Updated cross-spawn

## [1.0.0] - 2024-10-04 - Initial Release

### Added

- Initial CLI tool for design system metrics
- Support for Extension and Mobile projects
- CSV and JSON output formats
- Component usage tracking via AST parsing
- Babel-based JSX parsing
- Commander-based CLI interface

---

## Migration Guide: v1.x → v2.0.0

### Breaking Changes

If you were using v1.x, here's what changed:

#### 1. Configuration Structure

**Before (v1.x):**
```json
{
  "projects": {
    "extension": {
      "components": ["Button", "Icon", ...]
    }
  }
}
```

**After (v2.0.0):**
```json
{
  "projects": {
    "extension": {
      "deprecatedComponents": ["Button", "Icon", ...],
      "currentComponents": ["Button", "Icon", ...]
    }
  }
}
```

#### 2. Removed Projects

The following projects were removed:
- `design-system-react`
- `design-system-react-native`

To audit the design system packages themselves, run the tool directly in those repositories.

#### 3. Output Files

Output file naming remains the same:
- `{project}-component-metrics-deprecated.csv`
- `{project}-component-metrics-current.csv`

### Benefits of Upgrading

- ✅ Clearer separation between deprecated and current components
- ✅ More accurate component lists matching actual codebase
- ✅ Better migration tracking (old vs new)
- ✅ Comprehensive test coverage
- ✅ Simpler, more focused architecture

---

[2.0.0]: https://github.com/georgewrmarshall/design-system-metrics/compare/v1.0.1...v2.0.0
[1.0.1]: https://github.com/georgewrmarshall/design-system-metrics/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/georgewrmarshall/design-system-metrics/releases/tag/v1.0.0
