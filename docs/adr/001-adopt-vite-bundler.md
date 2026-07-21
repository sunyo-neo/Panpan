# ADR 001: Adopt Vite Bundler

## Context
`content.js` exceeds acceptable length for AI context windows. It heavily mixes DOM manipulation, state, and complex core logic making it difficult to maintain and refactor.

## Decision
Implement Vite build step to enforce Bounded Contexts (Core Domain, State Management, UI Adapters) and modularize the codebase.

## Consequences
- Requires `npm run build` prior to extension loading.
- Development requires running Vite to bundle the extension assets correctly before loading the unpacked extension into Chrome.
