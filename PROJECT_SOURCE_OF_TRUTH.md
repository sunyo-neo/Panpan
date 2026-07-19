# 📖 Project Source of Truth & Standard Operating Procedure (SOP)

**Last verified against codebase:** 2026-07-20
**Owner:** Senior Project Manager

This document serves as the central source of truth for our development methodology, process scaling, team structure, and product vision. It is designed as a complete onboarding pack for incoming Product Managers and team members.

---

## 1. Product Vision & Details

### The Vision
To build a premium, distraction-free, and highly performant manga/comic reading browser extension. The viewer should feel native, instantaneous, and invisible—getting out of the user's way so they can focus entirely on the content.

### Core Product Tenets
- **Simplicity Over Features**: We are aggressive about scope protection. Before adding any new visual effect or feature, ask: *"Does the existing UI already solve this problem?"* If yes, reject the addition.
- **Performance First**: The viewer must maintain 60fps. We prioritize hardware-accelerated CSS (opacity, transforms) and strictly avoid heavy repaints (e.g., complex clip-paths or layout thrashing).
- **Intuitive Navigation**: The experience is keyboard-first and frictionless, heavily utilizing paradigms like Hybrid Mode (macro/micro navigation) and Immersive Reading Mode.

---

## 2. The Team (Personnel & Departments)
We use specialized agents and skills (via slash commands) to ensure the right expertise is applied to the right problem at the right time.

### Engineering Department
- `/Senior Developer`: Implementation specialist for complex logic, architecture, and core functionality.
- `/Frontend Developer`: Specialist in UI implementation, CSS, ARIA accessibility, and client-side interactions.

### Design & UX Department
- `/UX Researcher`: Analyzes user behavior, beta feedback, and provides data-driven insights.
- `/UX Architect`: Defines structural UX foundations, layout systems, and component architecture.
- `/UI Designer`: Creates the visual design system and pixel-perfect user interfaces.

### Quality Assurance (QA)
- `/Code Reviewer`: Checks for correctness, maintainability, performance, and security.

### First Touch (Ideation & Validation)
- `/Feedback Synthesizer`: Extracts actionable product insights from user feedback.
- `/Rapid Prototyper`: Builds ultra-fast proof-of-concepts to validate ideas with working software before heavy engineering.

### Management
- `/Senior Project Manager`: Converts specs to tasks, protects scope, acts as the gatekeeper, and enforces this SOP.

### Specialists
- `/Minimal Change Engineer`: Fixes bugs with minimum-viable diffs; explicitly prevents scope creep and refactor avalanches.
- `/Reality Checker`: Provides evidence-based certification; acts as the final gatekeeper requiring overwhelming visual proof for production readiness.

---

## 3. Development Methodology: Tiered Complexity
The core philosophy of this project is that **process should scale with risk, not visibility**. We do not apply heavy architectural planning to trivial changes.

### The Golden Rule: Code-First Fact Finding
**Before any planning document is written**, the PM or developer MUST probe the codebase (a 10-15 minute technical spike). We must know the reality of the code (e.g., existing permissions, current state variables, architecture constraints) before debating abstractions or designing features.

> [!NOTE]
> **Tier Promotion:** Feature classification is fluid. A feature might initially be classified as a simple Tier 2, but after higher management discussion or if the goals become more ambitious, it can be promoted to a higher tier requiring more rigorous process and validation.

### Tier 1 — Trivial
- **Definition:** 1 file change, minor bug fixes, CSS tweaks, no new concepts.
- **Process:** Just code it. Write a clear commit message. Skip planning entirely.

### Tier 2 — Small
- **Definition:** 2-3 files, well-understood patterns, localized and contained changes.
- **Process:** One clarifying question (if needed) → Compact Task File → Code Execution.

### Tier 3 — Medium
- **Definition:** Cross-cutting concerns, new browser APIs (like `chrome.storage`), new permissions, user data persistence.
- **Process:** Decision Document (identifying the 1-2 mandatory product decisions required, e.g. "Local vs. Sync") → PM Task File → Code Execution.

### Tier 4 — Large/Risky
- **Definition:** New core architecture, major feature additions, irreversible user data schema changes.
- **Process:** Full Lifecycle (UX Research → UI Design → Architecture Plan → Task Lists → Execution → Reality Checker Certification).

---

## 4. PM Handoff & Onboarding Pack

Welcome, new Product Manager. If you are reading this, you are taking the helm of the extension.

### Your Role Expectation
You are the **Gatekeeper of Scope**. Your primary job is to convert ambiguous specs into actionable, realistic tasks. You represent the user, but you must aggressively protect the app's simplicity. 
- Say **NO** to gold-plating.
- Rely on the Tiered Complexity SOP to match process to risk.
- Do not let the team build abstract plans without reading the code first.

### Current Project State
* **Completed & Shipped**:
  - **Hybrid Mode**: Dual-axis navigation (Pages vs Panels) with Buffer State.
  - **Immersive Reading Mode**: Auto-hiding HUD and debounce logic.
  - **Dynamic Panel Scaling**: 3-mode zoom logic (Fill, Dynamic, Page Scale) with `Z` hotkey and ARIA segmented control.
* **Currently In-Progress / Blocked**:
  - **Feature**: Save Settings.
  - **Status**: Blocked at Tier 3 Decision Gate.
  - **Action Required**: The PM must decide if settings are saved via `chrome.storage.local` (this device only) or `chrome.storage.sync` (all devices) before writing the task list.

### Key Architecture Map
- `manifest.json`: The extension brain. Controls permissions (e.g., `activeTab`, `scripting`) and injections.
- `popupui.html` & `popup.js`: The settings UI. Translates user preferences into a `START_VIEWER` payload sent to the active tab.
- `content.js`: The core application injected into the host page.
  - `applyCoordinates()`: Contains the 3-mode scaling math and layout engine.
  - `handleKeydown()`: Keyboard navigation and hotkeys.
  - `renderCurrent()`: State rendering and cross-page navigation locking.
  - *Note*: Avoid inline styles where possible; rely on hardware-accelerated CSS state classes (e.g., `.hud-hidden`, `.is-buffer-mode`).
