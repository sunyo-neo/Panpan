FILE(S): manifest.json, vite.config.js, content.js, src/main.js
TYPE: Dead code / Half-fix migration
PATTERN FOUND: `vite.config.js` was added to build `src/main.js` and `popupui.html` into a `dist/` folder. However, `manifest.json` was never updated to point to the `dist/` folder for its `content_scripts`. It still points to the old monolithic `content.js` file at the root of the project.
RISK: The entire `src/` directory (the new architecture) is dead code in production. Any features or fixes made to `src/` will not appear in the browser extension. Any fixes made to `content.js` will not exist in the new architecture.
SEVERITY: Critical (Architecture drift)
LIKELY ORIGIN: Two different edit sessions. One built the initial monolithic extension. A later session (commit 1b17d3b) refactored the project to use Vite and modules, but failed to update `manifest.json` to complete the migration.
SUGGESTED FIX DIRECTION: Decide which version of the extension is the source of truth. If the Vite build is intended, update `manifest.json` to load from `dist/content.js` and delete the root `content.js`. If the monolithic build is intended, remove Vite and the `src/` directory.
