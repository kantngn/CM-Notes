# SOP: Development Protocol


## Language & Environment
* **Language:** Strictly use **Vanilla JavaScript (ES6+)**. Do NOT use TypeScript (no `: string`, no `interface`, no `public/private` keywords).
* **Target:** Browser / Tampermonkey Environment.
* **Compatibility:** All code must run directly in a browser console without a build step, unless a bundler (like Vite) is explicitly mentioned.

## Protocol: Direct & Precise

For every task, follow this internal reasoning chain before outputting:

### 1. Review Problem
Identify the specific technical hurdle or request.

### 2. Find Core Reason
Determine the underlying dependency, logic flaw, or architectural requirement.

### 3. Suggest Direction
Propose the most efficient technical path before writing code.

---

## Communication Rules

### Zero Fluff
- No conversational filler, apologies, or encouragement.
- Output actionable statements only.
- Avoid hedging language ("might", "could potentially", "perhaps").

### Inline Critique
- If a user request contradicts best practices or existing architecture in GEMINI.md, point it out immediately.
- Provide the specific conflict and necessary correction.
- Do not proceed with contradictory implementation without explicit re-approval.

### State of Truth
- Always verify the project structure against GEMINI.md before proposing file changes.
- Cross-reference module boundaries, dependency chains, and data flow.
- Flag deviations from the proposed modular structure.

### Automate
- Never ask the user to manually move code. 
- Use @project context to identify the logic, propose the new file structure.
- Upon approval, execute the delete-from-monolith and create-new-module operations automatically.

---

## Code Quality Standards

### Modularity
- Maintain existing module boundaries (as defined in GEMINI.md).
- Do not leak logic across folders.
- Each feature owns its state persistence and rendering.
- Core layers (storage, DOM, config) remain dependency-free of features.

### Technical Accuracy
- Use the most efficient Windows/JS/Salesforce APIs available.
- Prefer native DOM APIs over jQuery or custom wrappers (legacy avoided).
- Reference GM_* API documentation for Tampermonkey capabilities.
- Validate all external data inputs (page structure, date formats, color values).

### DRY Logic
- Minimize boilerplate. If a logic pattern repeats, suggest a utility helper.
- Example: If 3+ modules need "safe GM_getValue with schema check", create StorageManager abstraction.
- Exception: Small feature-specific templates (e.g., FO form HTML) are acceptable inline if <50 lines.

---

## Implementation Checklist

Before writing code:
- [ ] Verify request aligns with GEMINI.md structure
- [ ] Identify cross-module dependencies (if any)
- [ ] Check for DRY violations in proposed approach
- [ ] Confirm Salesforce API/selector correctness
- [ ] Define cleanup/teardown logic (event listeners, DOM references)

Before submitting code:
- [ ] No console.log left behind
- [ ] Error handling for null/undefined inputs
- [ ] Event listener cleanup on module destroy
- [ ] Comments only for non-obvious logic
- [ ] Filename matches module responsibility (e.g., StorageManager.ts, not helper.ts)
