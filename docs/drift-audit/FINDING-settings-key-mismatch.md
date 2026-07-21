FILE(S): popup.js, src/main.js, content.js
TYPE: Logic mismatch (Naming / Data Mismatch)
PATTERN FOUND: `popup.js` sends settings as `{ direction: ..., padding: ... }` when launching the viewer. `content.js` successfully reads `viewerSettings.direction` and `viewerSettings.zoomMode`. However, `src/main.js` looks for `settings.readingDirection` and does not check `zoomMode` at all.
RISK: If the `src/` modules are ever connected (by updating the manifest), the reading direction will silently fall back to `'manga'` for every user because `settings.readingDirection` will be undefined. The user's settings will be silently ignored.
SEVERITY: Critical (Data integrity / Silent fallback)
LIKELY ORIGIN: The Vite refactor session that created `src/main.js` guessed the names of the settings keys instead of verifying against `popup.js`. 
SUGGESTED FIX DIRECTION: Standardize the setting keys across the codebase. Either update `popup.js` to send `readingDirection`, or update `src/main.js` and `src/engine/dynamicSort.js` to expect `direction`. Additionally, port the `zoomMode` logic into `src/main.js`.
