# Graph Report - Panpan  (2026-07-21)

## Corpus Check
- 18 files · ~13,717 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 167 nodes · 190 edges · 15 communities (14 shown, 1 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1b17d3b5`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- package.json
- dependencies
- main.js
- 2. The Team (Personnel & Departments)
- manifest.json
- **CORE PRODUCTION TEAM**
- content.js
- **Value Stream: PanPan AI Development Lifecycle**
- default_icon
- ADR 001: Adopt Vite Bundler
- **🛑 Gate 2 Policy (Inspection & UAT)**
- **🛑 Gate 1 Policy (Intake & Triage)**
- Agent Rules for Panpan

## God Nodes (most connected - your core abstractions)
1. `runScanner()` - 8 edges
2. `handleKeydown()` - 7 edges
3. `2. The Team (Personnel & Departments)` - 7 edges
4. `renderCurrent()` - 6 edges
5. `3. Development Methodology: Tiered Complexity` - 6 edges
6. `**CORE PRODUCTION TEAM**` - 6 edges
7. `**Value Stream: PanPan AI Development Lifecycle**` - 6 edges
8. `getState()` - 5 edges
9. `📖 Project Source of Truth & Standard Operating Procedure (SOP)` - 5 edges
10. `startProcessing()` - 4 edges

## Surprising Connections (you probably didn't know these)
- `processImage()` --calls--> `dynamicSort()`  [EXTRACTED]
  src/main.js → src/engine/dynamicSort.js
- `processImage()` --calls--> `extractPanelsFromImage()`  [EXTRACTED]
  src/main.js → src/engine/floodFill.js
- `runScanner()` --calls--> `getState()`  [EXTRACTED]
  src/main.js → src/state/viewerState.js
- `runScanner()` --calls--> `setMangaImages()`  [EXTRACTED]
  src/main.js → src/state/viewerState.js
- `runScanner()` --calls--> `setPanels()`  [EXTRACTED]
  src/main.js → src/state/viewerState.js

## Import Cycles
- None detected.

## Communities (15 total, 1 thin omitted)

### Community 0 - "package.json"
Cohesion: 0.08
Nodes (24): author, bugs, url, description, devDependencies, vite, @vitejs/plugin-react, directories (+16 more)

### Community 1 - "dependencies"
Cohesion: 0.09
Nodes (23): detect-libc, fdir, lightningcss, lightningcss-win32-x64-msvc, nanoid, dependencies, detect-libc, fdir (+15 more)

### Community 2 - "main.js"
Cohesion: 0.21
Nodes (16): dynamicSort(), extractPanelsFromImage(), processImage(), runScanner(), getState(), nextPanel(), prevPanel(), setMangaImages() (+8 more)

### Community 3 - "2. The Team (Personnel & Departments)"
Cohesion: 0.09
Nodes (21): 1. Product Vision & Details, 2. The Team (Personnel & Departments), 3. Development Methodology: Tiered Complexity, 4. PM Handoff & Onboarding Pack, Core Product Tenets, Current Project State, Design & UX Department, Engineering Department (+13 more)

### Community 4 - "manifest.json"
Cohesion: 0.10
Nodes (19): browser_specific_settings, gecko, content_scripts, description, id, strict_min_version, host_permissions, icons (+11 more)

### Community 5 - "**CORE PRODUCTION TEAM**"
Cohesion: 0.17
Nodes (11): **1\. AI Project Manager (The Scope Gatekeeper)**, **2\. AI Systems Architect (The Tech Lead)**, **3\. AI Engineer (The Builder)**, **4\. AI QA / Code Reviewer (The Inspector)**, **5\. Git Master (The Librarian)**, **6\. Codebase Archaeologist (The Drift Detector)**, **7\. Reality Checker (The Validator)**, **AI Team Operational Prompts & Role Boundaries** (+3 more)

### Community 6 - "content.js"
Cohesion: 0.52
Nodes (6): applySettingsUpdate(), dynamicSort(), extractPanelsFromImage(), launchOverlay(), runScanner(), startProcessing()

### Community 7 - "**Value Stream: PanPan AI Development Lifecycle**"
Cohesion: 0.29
Nodes (6): **1\. Suppliers (S)**, **2\. Inputs (I)**, **3\. Process (P)**, **4\. Outputs (O)**, **5\. Customers (C)**, **Value Stream: PanPan AI Development Lifecycle**

### Community 8 - "default_icon"
Cohesion: 0.33
Nodes (6): action, default_icon, default_popup, 128, 16, 48

### Community 9 - "ADR 001: Adopt Vite Bundler"
Cohesion: 0.40
Nodes (4): ADR 001: Adopt Vite Bundler, Consequences, Context, Decision

### Community 10 - "**🛑 Gate 2 Policy (Inspection & UAT)**"
Cohesion: 0.40
Nodes (4): **🛑 Gate 2 Policy (Inspection & UAT)**, **PanPan Definition of Done (DoD)**, **Phase A: Automated / AI QA Checks (Technical Validation)**, **Phase B: User Acceptance Testing (Functional Validation)**

### Community 11 - "**🛑 Gate 1 Policy (Intake & Triage)**"
Cohesion: 0.40
Nodes (4): **🛑 Gate 1 Policy (Intake & Triage)**, **Standard Operating Procedure: Demand Intake**, **Template A: Feature Request**, **Template B: Bug Report**

## Knowledge Gaps
- **84 isolated node(s):** `manifest_version`, `name`, `version`, `description`, `16` (+79 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `package.json`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `handleKeydown()` (e.g. with `bindKeys()` and `unbindKeys()`) actually correct?**
  _`handleKeydown()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `manifest_version`, `name`, `version` to the rest of the system?**
  _84 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._
- **Should `2. The Team (Personnel & Departments)` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._
- **Should `manifest.json` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._