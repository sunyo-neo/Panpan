# Graph Report - C:\Users\SunflowerBee\Documents\Panpan\graphify-data  (2026-07-21)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 36 nodes · 38 edges · 7 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `baad1402`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5

## God Nodes (most connected - your core abstractions)
1. `startProcessing()` - 4 edges
2. `icons` - 4 edges
3. `default_icon` - 4 edges
4. `permissions` - 4 edges
5. `dynamicSort()` - 3 edges
6. `extractPanelsFromImage()` - 3 edges
7. `action` - 3 edges
8. `gecko` - 3 edges
9. `applySettingsUpdate()` - 2 edges
10. `runScanner()` - 2 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Communities (7 total, 0 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.25
Nodes (7): content_scripts, description, host_permissions, manifest_version, name, version, https://kagane.to/*

### Community 1 - "Community 1"
Cohesion: 0.52
Nodes (6): applySettingsUpdate(), dynamicSort(), extractPanelsFromImage(), launchOverlay(), runScanner(), startProcessing()

### Community 2 - "Community 2"
Cohesion: 0.33
Nodes (6): action, default_icon, default_popup, 128, 16, 48

### Community 3 - "Community 3"
Cohesion: 0.50
Nodes (4): browser_specific_settings, gecko, id, strict_min_version

### Community 4 - "Community 4"
Cohesion: 0.50
Nodes (4): icons, 128, 16, 48

### Community 5 - "Community 5"
Cohesion: 0.50
Nodes (4): permissions, activeTab, scripting, storage

## Knowledge Gaps
- **18 isolated node(s):** `manifest_version`, `name`, `version`, `description`, `16` (+13 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `action` connect `Community 2` to `Community 0`?**
  _High betweenness centrality (0.175) - this node is a cross-community bridge._
- **Why does `icons` connect `Community 4` to `Community 0`?**
  _High betweenness centrality (0.116) - this node is a cross-community bridge._
- **What connects `manifest_version`, `name`, `version` to the rest of the system?**
  _18 weakly-connected nodes found - possible documentation gaps or missing edges._