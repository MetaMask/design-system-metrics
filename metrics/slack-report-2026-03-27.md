### Design System Weekly Update

- **MetaMask Design System (MMDS)**
  - **Mobile**
    - MMDS components available: `49`
      - [Migrated](https://consensyssoftware.atlassian.net/browse/DSYS-272): `49/52 (94%)`
    - MMDS component instances: `3138`
    - Deprecated component instances: `3156`
    - [MMD vs Deprecated](https://MetaMask.github.io/design-system-metrics/): `49.86% (3138/3156)`

  - **Extension**
    - MMDS components available: `28`
      - [Migrated](https://consensyssoftware.atlassian.net/browse/DSYS-302): `28/48 (58%)`
    - MMDS component instances: `2171`
    - Deprecated component instances: `3323`
    - [MMD vs Deprecated](https://MetaMask.github.io/design-system-metrics/): `39.52% (2171/3323)`

---

#### Untracked Components (Top 5 Replaceable with MMDS)

**Mobile**
Replaceable: `67` components, `1540` instances (`10.2%` of JSX usage)

| Component | Instances | MMDS Replacement | Confidence |
|-----------|-----------|-----------------|------------|
| `Text` | 323 | `Text` | exact |
| `Box` | 209 | `Box` | exact |
| `Image` | 128 | `ImageOrSvg` | medium |
| `Animated` | 101 | `ButtonAnimated` | medium |
| `SkeletonPlaceholder` | 75 | `Skeleton` | high |

Top teams: ramp (159 instances), confirmations (150 instances), mobile-core-ux (112 instances)

**Extension**
Replaceable: `26` components, `393` instances (`4.3%` of JSX usage)

| Component | Instances | MMDS Replacement | Confidence |
|-----------|-----------|-----------------|------------|
| `Box` | 64 | `Box` | exact |
| `PreferredAvatar` | 47 | `AvatarAccount` | medium |
| `ToggleButton` | 40 | `Button` | high |
| `ConfirmInfoRowText` | 34 | `Text` | high |
| `ConfirmInfoAlertRow` | 24 | `BannerAlert` | medium |

Top teams: confirmations (101 instances), core-extension-ux (45 instances), swaps-engineers (38 instances)

---

_Generated: 2026-03-27_