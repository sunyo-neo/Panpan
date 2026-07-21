# SOP: AI-Driven Git Workflow & Version Control

**Process Owner:** Git Master  
**Collaborators:** AI Project Manager, Panda (UAT)  
**Core Philosophy:** Trunk-Based Development with Short-Lived Quarantine Branches.  

In a solo-developer AI environment, Pull Requests are not used for traditional "peer review" (which would be Overprocessing). Instead, they act as a mandatory Error-Proofing (Poka-Yoke) mechanism to visually inspect AI output before it touches the stable product.

---

## The 4-Step Git Flow

### 1. `main` is Sacred (The Golden Master)
The `main` branch must always contain 100% working, stable code. It is the ultimate fallback. If an AI agent hallucinates or corrupts a file, `main` remains perfectly safe and deployable.

### 2. The Quarantine Branch (Poka-Yoke Containment)
When the AI Project Manager approves a task, the Git Master must create an isolated feature branch (e.g., `feat/add-hybrid-legend` or `fix/panel-padding`) branching off the default development branch.

**Purpose:** This acts as a physical quarantine zone. All code written by the AI Engineer is strictly contained to this branch, safeguarding the Golden Master.

### 3. The Pull Request as an "Inspection Desk" (Gate 2)
Even when executing a Single-Piece Flow (one issue at a time), the Git Master MUST open a Pull Request when the AI QA agent finishes Phase A of the Definition of Done.

**Purpose:** The PR gives Panda a clean, isolated view of the "diff" (exactly what lines were added/removed). If the AI Engineer hallucinates and deletes 400 lines of CSS to add a 10px margin, Panda can visually detect the anomaly and reject the PR without even needing to run the code.

### 4. Merge and Delete (Single-Piece Flow)
Once Panda performs manual User Acceptance Testing (UAT) on the branch and explicitly approves it:
- The Git Master merges the PR into the target branch (`development` / `main`).
- The Git Master immediately deletes the feature branch to prevent repository clutter.
- The pipeline is cleared to pull the next single issue.

---

## Rules of Engagement

- **No Direct Commits:** No AI agent, under any circumstances, is permitted to commit directly to the `main` branch.
- **Naming Conventions:** All branches must follow standard prefix naming (`feat/`, `fix/`, `chore/`).
- **Commit Standards:** All commits must follow Conventional Commits formatting so the repository history reads cleanly.
