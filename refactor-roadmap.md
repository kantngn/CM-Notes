# CM Notes Refactoring Roadmap & Structure Map

## 1. High-Level Structure Map

### Major Modules & Responsibilities
The codebase is currently structured as an IIFE-based module system attaching properties to a global `CM_App` (aliased as `app`).

- **`Core.js`**
  - **Namespace Setup**: Initializes the core `app` structures.
  - **Themes / Styles**: Handles CSS variables and dynamic style injection.
  - **Scraper**: Reads data from the Salesforce/Lightning DOM, extracting form fields, client info, and SSD data.
  - **Utils**: Helper functions (e.g., phone formatters).
  - **Taskbar / Windows**: Manages generic floating window UI (draggable, resizable, tab focus).
- **`ClientNote.js`**
  - **ClientNote**: The largest UI component. Manages the main Client Note floating window, side panels (Info, SSA Contacts, Matter Details), color schemes, and syncing scraped data with saved form data.
- **`Tools.js`**
  - **ContactForms**: Generates specific data-entry forms (FO, DDS).
  - **SSDFormViewer**: UI for viewing captured full-page SSD form data.
  - **Dashboard**: Searchable list of recent/revisit clients, and a settings panel for configuring the script.
  - **FeaturePanels**: UI for generating PDFs (Fax templates) and other minor tools (IR).
- **`Automation.js`**
  - **MailResolve**: UI/automation for a specific "Mail Log" Salesforce page.
  - **TaskAutomation**: Complex DOM manipulation bot that automates creating NCL tasks and sending emails automatically.
- **`Main.js`**
  - **Script Header**: Tampermonkey metadata and `@require` links.
  - **AppObserver**: Central orchestrator. Monitors URL changes, handles keyboard shortcuts, loads the taskbar, and coordinates the initialization/destruction of UI elements based on the parsed Salesforce `clientId`.

## 2. Refactoring Roadmap

### A. Proposed New Project Structure
Moving forward, the project should migrate towards a modern Javascript bundler (like Vite, Webpack, or Rollup) to allow standard ES6 `import`/`export` and keep individual files small. 

\`\`\`text
src/
├── index.js                  # Entry point (Main.js equivalent)
├── config/
│   ├── Themes.js             # Theme constants
│   └── Styles.css            # Extracted CSS instead of JS strings
├── core/
│   ├── Utils.js              # Formatting and generic helpers
│   ├── Scraper.js            # DOM extraction logic
│   ├── WindowManager.js      # 'Windows' dragging/resizing logic
│   └── AppObserver.js        # Route/URL observer and hotkeys
├── ui/
│   ├── Taskbar.js
│   ├── Dashboard.js
│   └── panels/
│       ├── FeaturePanels.js
│       ├── ContactForms.js
│       └── SSDFormViewer.js
├── features/
│   ├── client-note/          # Breaking down ClientNote.js
│   │   ├── ClientNote.js     # Main wrapper
│   │   ├── InfoPanel.js
│   │   ├── SSAPanel.js
│   │   └── MatterPanel.js
│   └── automation/
│       ├── MailResolve.js
│       └── TaskAutomation.js
└── templates/                # Store HTML template strings externally
\`\`\`

### B. Order of Splitting (Minimizing Dependencies)

To safely refactor without breaking existing functionality, we should pull out the most independent concepts ("leaf nodes") first, and refactor the central orchestrators ("root nodes") last.

1. **Extract Constants & CSS (`Core.js`)**
   - **Why**: `Themes` and `Styles` have zero dependencies. Moving CSS to actual `.css` files (or isolated JS files) immediately clears visual clutter.
   - **Files**: `Themes.js`, `Styles.css`.
2. **Extract Independent Utilities (`Core.js`)**
   - **Why**: generic tools like `Utils` and `Scraper` don't depend on UI logic; they only depend the DOM.
   - **Files**: `Utils.js`, `Scraper.js`.
3. **Extract Window Management (`Core.js`)**
   - **Why**: The `Windows` module is heavily relied on by all UI panels. Isolating it creates a clean API for the rest of the UI files.
   - **Files**: `WindowManager.js`.
4. **Refactor and Split Minor UI Panels (`Tools.js`)**
   - **Why**: Panels like `ContactForms`, `SSDFormViewer`, and `FeaturePanels` are relatively isolated. They can be cleanly separated into their own files.
   - **Files**: `ContactForms.js`, `SSDFormViewer.js`, `FeaturePanels.js`.
5. **Split Automations (`Automation.js`)**
   - **Why**: Automation logic interacts directly with the Salesforce DOM and is mostly decoupled from the floating windows.
   - **Files**: `TaskAutomation.js`, `MailResolve.js`.
6. **Break Down the Monolith (`ClientNote.js`)**
   - **Why**: At 1700+ lines, `ClientNote.js` should be refactored *after* the base UI and Window modules are stable.
   - **Action**: Split the side panels (`InfoPanel`, `SSAPanel`, `MatterPanel`) and header UI away from the base note text area.
7. **Refactor Entry Point (`Main.js` / `Dashboard`)**
   - **Why**: `AppObserver` ties everything together. Once all modules are using ES6 imports, rewrite the entry point to bind the global event listeners and initialize the `Dashboard` and `Taskbar`.
