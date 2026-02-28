# CM Notes Project Modules Reference

This document serves as the central reference for the project's structure, files, responsibilities, and dependencies following the ES6 migration and module refactoring plan.

## Project Structure

```text
d:\CM Notes\
├── build.js                  # Builds the Tampermonkey script
├── modules.md                # This reference file
├── refactor-roadmap.md       # Roadmap for codebase refactoring
├── db/                       # Contains database files (e.g. SSADatabase.json)
└── src/
    ├── Main.js               # Entry point, orchestrates and initializes UI based on URLs
    ├── config/
    │   ├── Themes.js         # Theme color constants and `applyTheme` mechanism
    │   └── Styles.css        # Core stylesheet for Floating Windows, Taskbar, Components
    ├── core/                 # Shared generic functionality
    │   ├── AppObserver.js    # (Planned) Route URL observer & Hotkey bindings
    │   ├── PdfManager.js     # Helper for fetching PDFs and loading PDF-lib
    │   ├── Scraper.js        # DOM extraction logic specifically for Salesforce/Lightning views
    │   ├── SSADataManager.js # Fetches and filters the SSADatabase.json for UI forms
    │   ├── Utils.js          # Independent utility methods (e.g. phone formatting)
    │   └── WindowManager.js  # Generic drag/drop, resize, and stacking for popup windows
    ├── ui/
    │   ├── Taskbar.js        # Lower sticky taskbar that renders counters and tab buttons
    │   └── panels/           # (Planned) Breakout for independent feature panels
    ├── features/             # (Planned) Complex UI capabilities
    └── templates/            # (Planned) Extracted HTML string literals
```

## Module Responsibilities & Dependencies

### `src/config/Themes.js`
- **Responsibility**: Houses UI color constants and specific definitions for Note Themes. Contains the logic `applyTheme` to inject CSS properties to `:root`.
- **Dependencies**: None.

### `src/config/Styles.css`
- **Responsibility**: Contains decoupled styles for generic components, dashboards, taskbars, and note panels.
- **Dependencies**: Loaded via the primary build or entrypoint.

### `src/core/Utils.js`
- **Responsibility**: Simple independent functions required by multiple files (e.g., parsing/formatting phone strings).
- **Dependencies**: None.

### `src/core/Scraper.js`
- **Responsibility**: Read-only extraction of data fields spanning standard elements and Salesforce LWC Shadow DOM elements. Includes recursive algorithms for retrieving deeply nested data.
- **Dependencies**: `src/core/Utils.js` (for formatting acquired phone numbers).

### `src/core/WindowManager.js`
- **Responsibility**: Manages the life-cycle of custom internal popup windows. Applies event listeners for snapping, dragging, and double-click functionality to header components. 
- **Dependencies**: Frequently interacts with `ui/Taskbar.js` buttons functionality.

### `src/core/SSADataManager.js`
- **Responsibility**: Remote request helper bridging UI interaction with the Github-hosted JSON Database entries.
- **Dependencies**: `GM_xmlhttpRequest`.

### `src/core/PdfManager.js`
- **Responsibility**: Contains logic for invoking external unpkg scripts (`PDFLib`) and retrieving Blob representations.
- **Dependencies**: Assumes `PDFLib` object presence.

### `src/Tools.js`
- **Responsibility**: Acts as an entry point for the extracted UI modules, assigning them to `CM_App.Tools`.
- **Dependencies**: `src/ui/Dashboard.js`, `src/ui/panels/ContactForms.js`, `src/ui/panels/SSDFormViewer.js`, `src/ui/panels/FeaturePanels.js`.

### `src/ui/Dashboard.js`
- **Responsibility**: The main dashboard UI showing recent and revisit clients, search capability, and configuration options (colors, data import/export).
- **Dependencies**: `app.Core.Themes`, `app.Core.Windows`, GM API tools.

### `src/ui/panels/ContactForms.js`
- **Responsibility**: Specific data-entry popups for processing FO and DDS contacts and tracking status flags.
- **Dependencies**: `app.Core.Windows`.

### `src/ui/panels/SSDFormViewer.js`
- **Responsibility**: UI for viewing captured full-page SSD form data (Application intake context) and conditionally triggering scraping.
- **Dependencies**: `app.AppObserver`, `app.Core.Scraper`, `app.Core.Windows`, `app.Features.ClientNote`.

### `src/ui/panels/FeaturePanels.js`
- **Responsibility**: UI rendering specialized operational views including PDF Generation templates (L25, DDS Fax) and IR report copy-paste parser tools.
- **Dependencies**: `app.AppObserver`, `app.Core.Windows`, `app.Core.Scraper`, `app.Core.PdfManager` (via `loadPdfLib` and `fetchPdfBytes`).

### `src/ui/Taskbar.js`
- **Responsibility**: Orchestrates building the bottom-aligned status indicator components representing currently active monitored tasks limits.
- **Dependencies**: GM API tools (`GM_listValues`, `GM_getValue`).
