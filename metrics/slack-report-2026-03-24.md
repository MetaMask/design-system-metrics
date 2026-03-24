### Design System Weekly Update

- **MetaMask Design System (MMDS)**
  - **Mobile**
    - MMDS components available: `49`
      - [Migrated](https://consensyssoftware.atlassian.net/browse/DSYS-272): `49/52 (94%)`
    - MMDS component instances: `2814`
    - Deprecated component instances: `3219`
    - [MMD vs Deprecated](https://MetaMask.github.io/design-system-metrics/): `46.64% (2814/3219)`

  - **Extension**
    - MMDS components available: `28`
      - [Migrated](https://consensyssoftware.atlassian.net/browse/DSYS-302): `28/48 (58%)`
    - MMDS component instances: `2083`
    - Deprecated component instances: `3406`
    - [MMD vs Deprecated](https://MetaMask.github.io/design-system-metrics/): `37.95% (2083/3406)`

---

#### Untracked Components (Top 5 Replaceable with MMDS)

**Mobile**
Replaceable: `263` components, `2026` instances (`13.4%` of JSX usage)

| Component | Instances | MMDS Replacement | Confidence |
|-----------|-----------|-----------------|------------|
| `Text` | 339 | `Text` | exact |
| `Box` | 208 | `Box` | exact |
| `Image` | 131 | `ImageOrSvg` | medium |
| `Animated` | 101 | `ButtonAnimated` | medium |
| `SkeletonPlaceholder` | 75 | `Skeleton` | high |


**Extension**
Replaceable: `115` components, `611` instances (`6.8%` of JSX usage)

| Component | Instances | MMDS Replacement | Confidence |
|-----------|-----------|-----------------|------------|
| `Box` | 64 | `Box` | exact |
| `PreferredAvatar` | 47 | `AvatarAccount` | medium |
| `ToggleButton` | 40 | `Button` | high |
| `ConfirmInfoRowText` | 34 | `Text` | high |
| `ConfirmInfoAlertRow` | 24 | `BannerAlert` | medium |


---

_Generated: 2026-03-24_