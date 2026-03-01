# CM Notes Project Modules Reference

This document serves as the central reference for the project's structure, files, responsibilities, and dependencies following the ES6 migration and module refactoring plan.

## Project Structure

```text
d:\CM Notes\
├── build.js                  # Builds the Tampermonkey script
├── modules.md                # This reference file
├── refactor-roadmap.md       # Roadmap for codebase refactoring
├── db/                       # Contains database files (e.g. SSADatabase.json)
├── legacy/                   # Original monolithic source files (Core.js, etc.) preserved for reference
└── src/
    ├── index.js              # Entry point script, imports and routes to AppObserver
    ├── config/
    │   ├── Themes.js         # Theme color constants and `applyTheme` mechanism
    │   └── Styles.css        # Core stylesheet for Floating Windows, Taskbar, Components
    ├── core/                 # Shared generic functionality
    │   ├── AppObserver.js    # Route URL observer & Hotkey bindings
    │   ├── PdfManager.js     # Helper for fetching PDFs and loading PDF-lib
    │   ├── Scraper.js        # DOM extraction logic specifically for Salesforce/Lightning views
    │   ├── SSADataManager.js # Fetches and filters the SSADatabase.json for UI forms
    │   ├── Utils.js          # Independent utility methods (e.g. phone formatting)
    │   └── WindowManager.js  # Generic drag/drop, resize, and stacking for popup windows
    ├── ui/
    │   ├── Taskbar.js        # Lower sticky taskbar that renders counters and tab buttons
    │   └── panels/           # (Planned) Breakout for independent feature panels
    ├── Automation.js         # Entry point for automation logic, exported to CM_App.Automation
    ├── Tools.js              # Entry point for UI panels and dashboards
    ├── features/             # Complex UI capabilities and automations
    │   └── automation/
    │       ├── MailResolve.js
    │       └── TaskAutomation.js
    └── templates/            # (Planned) Extracted HTML string literals
```

## Module Responsibilities & Dependencies

### `src/core/AppObserver.js`
- **Responsibility**: Central orchestrator. Monitors URL changes, handles keyboard shortcuts, loads the taskbar, and coordinates the initialization/destruction of UI elements based on the parsed Salesforce `clientId`. Also handles **SSD Auto-Scraping** triggers on specific form pages.
- **Dependencies**: UI Modules (`Taskbar`, `Dashboard`, `ClientNote`, `ContactForms`, `SSDFormViewer`, `FeaturePanels`, `MailResolve`) and Core Modules (`Styles`, `Windows`, `Scraper`).

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

### `src/Automation.js`
- **Responsibility**: Acts as an entry point for automation scripts, attaching them to `CM_App.Automation`.
- **Dependencies**: `src/features/automation/MailResolve.js`, `src/features/automation/TaskAutomation.js`.

### `src/features/automation/MailResolve.js`
- **Responsibility**: UI/automation for quickly marking "Mail Log" items as resolved within Salesforce.
- **Dependencies**: None.

### `src/features/automation/TaskAutomation.js`
- **Responsibility**: Complex DOM bot that automates creating NCL tasks and sending emails from Salesforce.
- **Dependencies**: GM API tools (`GM_getValue`).

### `src/ClientNote.js`
- **Responsibility**: Acts as an entry point for the ClientNote feature module, assigning it to `CM_App.Features.ClientNote`.
- **Dependencies**: `src/features/client-note/ClientNote.js`.

### `src/features/client-note/ClientNote.js`
- **Responsibility**: The main module for the "Client Note" feature. Orchestrates the rendering of the core client note window, header, note-taking area, to-do lists, color theming, and side panels.
- **Dependencies**: `src/features/client-note/InfoPanel.js`, `src/features/client-note/SSAPanel.js`, `src/features/client-note/MatterPanel.js`, GM API tools, `app.Core.Windows`, `app.Core.Themes`.

### `src/features/client-note/InfoPanel.js`
- **Responsibility**: Renders and handles the "Client Info" side panel within the Client Note window. Handles direct data updates and opens the SSD App scraper.
- **Dependencies**: GM API tools, `app.Core.Scraper`, `ClientNote.updateAndSaveData`.

### `src/features/client-note/SSAPanel.js`
- **Responsibility**: Renders and handles the "SSA Contacts" side panel. Provides FO and DDS office search capabilities, auto-fills location details, and triggers fax forms or SC/VA status reports.
- **Dependencies**: GM API tools, `app.Core.SSADataManager`, `ClientNote.updateAndSaveData`, `app.Tools.FeaturePanels`.

### `src/features/client-note/MatterPanel.js`
- **Responsibility**: Renders the "Matter Details" side panel within the Client Note, displaying read-only scraped indicators such as filing dates, PTR status, and CM1/ISU statuses.
- **Dependencies**: `app.Core.Scraper`, `ClientNote.updateIndicators`.
