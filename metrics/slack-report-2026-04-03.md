### Design System Weekly Update

- **MetaMask Design System (MMDS)**
  - **Mobile**
    - MMDS components available: `55`
      - [New components](https://github.com/MetaMask/metamask-design-system/tree/main/packages/design-system-react-native/src/components): `BottomSheetDialog`, `BoxHorizontal`, `BoxVertical`, `HeaderRoot`, `HeaderStandard`, `TextFieldSearch`
      - [Migrated](https://consensyssoftware.atlassian.net/browse/DSYS-272): `55/52 (106%)`
    - MMDS component instances: `3355`
    - Deprecated component instances: `3033`
    - [MMD vs Deprecated](https://MetaMask.github.io/design-system-metrics/): `52.52% (3355/3033)`

  - **Extension**
    - MMDS components available: `28`
      - [Migrated](https://consensyssoftware.atlassian.net/browse/DSYS-302): `28/48 (58%)`
    - MMDS component instances: `2342`
    - Deprecated component instances: `3234`
    - [MMD vs Deprecated](https://MetaMask.github.io/design-system-metrics/): `42.00% (2342/3234)`

---

#### Untracked Components (Top 5 Replaceable with MMDS)

**Mobile**
Replaceable: `70` components, `1549` instances (`10.0%` of JSX usage)

| Component | Instances | MMDS Replacement | Confidence |
|-----------|-----------|-----------------|------------|
| `Text` | 323 | `Text` | exact |
| `Box` | 199 | `Box` | exact |
| `Image` | 128 | `ImageOrSvg` | medium |
| `Animated` | 101 | `ButtonAnimated` | medium |
| `SkeletonPlaceholder` | 75 | `Skeleton` | high |

Top teams: ramp (159 instances), confirmations (150 instances), mobile-core-ux (112 instances)

**Extension**
Replaceable: `26` components, `391` instances (`4.3%` of JSX usage)

| Component | Instances | MMDS Replacement | Confidence |
|-----------|-----------|-----------------|------------|
| `Box` | 62 | `Box` | exact |
| `PreferredAvatar` | 47 | `AvatarAccount` | medium |
| `ToggleButton` | 40 | `Button` | high |
| `ConfirmInfoRowText` | 34 | `Text` | high |
| `ConfirmInfoAlertRow` | 24 | `BannerAlert` | medium |

Top teams: confirmations (99 instances), core-extension-ux (45 instances), swaps-engineers (38 instances)

---

_Generated: 2026-04-03_