# Core Architecture & Refactoring Plan

## Overview
Refactoring `Mono 3.4.js` into a modular structure to improve maintainability while keeping complexity low. The goal is to separate **Core Utilities** (Dependencies) from **Features** (Business Logic).

## Module Heatmap

### 1. `Core.js` (The Foundation)
*   **Responsibility:** Shared utilities, UI window management, and Data fetching.
*   **Components:**
    *   `Styles`: The CSS block (moved to a constant or init function).
    *   `Windows`: Window management (Drag, Resize, Toggle, z-index).
    *   `Scraper`: DOM extraction logic (Header, Sidebar, SSD Forms).
    *   `SSADataManager`: Fetching/Searching external SSA JSON.

### 2. `ClientNote.js` (Primary Feature)
*   **Responsibility:** The main sticky note functionality.
*   **Components:**
    *   `ClientNote`: Main logic, UI rendering, State persistence (`GM_getValue/setValue`), Timezone logic, Medical Popout.

### 3. `Tools.js` (Secondary Features)
*   **Responsibility:** Smaller, independent UI tools.
*   **Components:**
    *   `ContactForms`: FO and DDS contact form generators.
    *   `SSDFormViewer`: Read-only viewer for scraped SSD data.
    *   `Dashboard`: Searchable list of saved client notes.

### 4. `Automation.js` (Background/Action Tasks)
*   **Responsibility:** Automated actions and macros.
*   **Components:**
    *   `TaskAutomation`: NCL Task creation, Email injection.
    *   `MailResolve`: Mail Log resolution button.

### 5. `Main.js` (Entry Point)
*   **Responsibility:** Initialization and Routing.
*   **Components:**
    *   `AppObserver`: URL polling, Client ID detection, Taskbar rendering.
    *   `Init`: Assembling the modules.

## Refactoring Protocol

1.  **Extraction**: Move code blocks into separate files/variables as defined above.
2.  **Global Namespace**: Ensure modules are accessible to `Main.js`. Use a namespace object `const App = { Core: {}, Features: {} }` if concatenating, or ensure order of execution if using `@require`.
3.  **Dependency Order**:
    1.  `Core.js` (Must load first)
    2.  `Automation.js`
    3.  `Tools.js`
    4.  `ClientNote.js`
    5.  `Main.js` (Must load last)

## Best Practices for Transition

*   **Shared State**: Continue using `GM_getValue` / `GM_setValue` as the source of truth for persistence across modules.
*   **Event Bus**: Use `document.dispatchEvent` or specific DOM events for communication between modules (e.g., `ClientNote` updating `Dashboard`) to reduce direct coupling.
*   **Error Handling**: Wrap module initializations in `try-catch` blocks in `Main.js` so one failing module doesn't crash the whole app.