# Drift Audit Registry - PanPan

## Findings

| Finding | Files | Type | Severity | Status |
|---|---|---|---|---|
| Vite migration unlinked | manifest.json, vite.config.js, src/main.js, content.js | Half-fix migration (Dead Code) | Critical | Open |
| Settings Key Mismatch | popup.js, src/main.js | Logic mismatch | Critical | Open |
| Dropped GET_PROBE_DATA handler | src/main.js, content.js | Logic mismatch | Moderate | Open |
| Duplicated Image Processing | content.js, src/engine/ | Structural duplication | Moderate | Open |

## Eras

| Era | Approx. date range | Dominant pattern | Files following it |
|---|---|---|---|
| Era 1 (Initial & Features) | Commits 85b7b77 - 264bafc | Monolithic Vanilla JS, inline functions | content.js, popup.js, popupui.html, manifest.json |
| Era 2 (Vite Refactor) | Commit 1b17d3b | ES Modules, Componentized, Vite Build | src/*, vite.config.js, package.json |

*Note: The codebase is currently running in a mixed state. The UI and manifest load Era 1 files, while Era 2 files sit unused in `src/`.*

## Responsibilities

| Responsibility | Implementations found | Are they consistent? |
|---|---|---|
| Main Extension Entry Point | content.js, src/main.js | No — `manifest.json` points to the old `content.js`, ignoring `src/main.js` and the Vite build output. |
| Viewer Settings Handling | content.js, src/main.js | No — `content.js` successfully reads `viewerSettings.direction` and `zoomMode`. `src/main.js` looks for `readingDirection` and ignores `zoomMode`. |
| Page Probing (Telemetry) | content.js, src/main.js | No — `src/main.js` completely dropped the `GET_PROBE_DATA` handler that `popup.js` expects. |
| Panel Slicing & Sorting | content.js, src/engine/ | Duplicate implementation. Mostly consistent in logic, but duplicated across the monolithic file and the modularized folder. |

## Risk Priority

### Critical (Breaks core functionality if deployed)
- **Vite migration unlinked:** If a developer makes changes to `src/`, they will not see them in the extension. If they make changes to `content.js`, they are modifying legacy code that the Vite refactor intended to replace.
- **Settings Key Mismatch:** If the Vite migration is finalized (by pointing the manifest to `dist/content.js`), the viewer will ignore the user's `direction` setting (due to the `readingDirection` key mismatch) and `zoomMode` setting.

### Moderate (Breaks auxiliary features)
- **Dropped GET_PROBE_DATA handler:** If the Vite migration is finalized, the popup will fail to fetch telemetry/probe data and error out.

### Cosmetic / Technical Debt
- **Duplicated Image Processing:** `content.js` and `src/engine/` contain essentially identical copies of `extractPanelsFromImage` and `dynamicSort`.
