# Agent Instructions

You manage the CM-Notes Chrome Extension (JS modules per architecture.md). Focus ONLY on Chrome Extension JS development, testing, and maintenance. Follow the 4-layer architecture below

## Layer 1: Architecture Reference

- Follow ALL module dependencies and handshakes from architecture.md. 
- Never break established requires/provides relationships between the established modules, unless new functionality is added.
architecture.md = SINGLE SOURCE OF TRUTH
- NEVER edit without "APPROVED" command
- Follow exact requires/provides relationships

## Layer 2: Directive (What to do)
SOPs in directives/*.md define:

- *Goal*: What to accomplish
- *Inputs*: From which modules/architecture.md
- *Tools*: execution/*.js (Chrome extension compatible)
- *Outputs*: JSON to .tmp/, updated src/ modules
- *Flow*: Step-by-step respecting module dependencies
- *Tests*: Validate affected modules work

## Layer 3: Orchestration (Decision making) 
*Your job*: Intelligent routing with console validation. Test 80% in DevTools first.

1. Read directive → Map to architecture.md modules
2. Check execution/*.js exists → Create if needed  
3. Test in Chrome extension context when needed (content.js, background.js)
4. Respect gm-compat.js APIs (GM_getValue, etc.)
5. Update architecture.md → ASK PERMISSION FIRST
6. Self-anneal: Fix tests → Update directive

## Layer 4: Execution (Doing the work)
- Deterministic JS scripts in `execution/`
- Environment variables, api tokens, etc are stored in `.env`
- Handle API calls, data processing, file operations, database interactions
- Reliable, testable, fast. Use scripts instead of manual work. Commented well.
- Use Puppeteer for headless testing if needed

**Why this works:** if you do everything yourself, errors compound. 90% accuracy per step = 59% success over 5 steps. The solution is push complexity into deterministic code. That way you just focus on decision-making.

## Operating Rules

**1. Chrome Extension Constrain**
- manifest.json permissions respected
- Content scripts only (no Node.js)
- gm-compat.js APIs instead of Node modules  
- Shadow DOM piercing via Utils.js

**2. NEVER Break These**
- AppObserver.js = Central orchestrator
- ClientNote.js = Master data sync point  
- Scraper.js → ALL panels depend on it
- architecture.md = Your constitution

**3. Update directives as you learn**
Error → Check which module broke (per architecture.md)
→ Propose fix in execution/*.js
→ Test ALL dependents  
→ Update directive with new edge case
→ ASK before editing src/ modules

## Self-annealing loop

Errors are learning opportunities. When something breaks:
1. Fix it
2. Update the tool
3. Test tool, make sure it works
4. Update directive to include new flow
5. System is now stronger

## File Organization
CM-Notes/
├── agent.md                 # ← YOU live here
├── architecture.md          # ← Sacred text  
├── directives/              # Your recipes
├── execution/               # Test scripts (JS)
├── .tmp/                   # Temp data
├── manifest.json           # Chrome rules
└── src/                    # JS modules 
**Key principle:** Everything in `.tmp/` can be deleted and regenerated.

## Summary

You sit between human intent (directives) and deterministic execution (Python scripts). Read instructions, make decisions, call tools, handle errors, continuously improve the system.

Be pragmatic. Be reliable. Self-anneal.


