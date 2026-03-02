# CM Notes Project Modules Reference

This document serves as the central reference for the project's structure, files, responsibilities, and dependencies following the Chrome Extension migration.

## Project Structure

```text
d:\CM Notes\
├── refactor-roadmap.md       # Roadmap for codebase refactoring
├── modules.md                # This reference file
├── db/                       # Contains database files (e.g. SSADatabase.json)
├── docs/                     # Documentation files
├── release/                  # Release builds and versions
└── chrome-extension/         # Main Chrome Extension directory
    ├── manifest.json         # Extension manifest, defines permissions and scripts
    ├── background.js         # Service worker for background tasks and messages
    ├── content.js            # Main content script entry point
    ├── gm-compat.js          # Tampermonkey/Greasemonkey API compatibility layer
    └── src/                  # Source modules injected by manifest
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
        │   └── panels/           # Breakout for independent feature panels
        │       ├── ContactForms.js
        │       ├── FeaturePanels.js
        │       ├── MedicationPanel.js
        │       └── SSDFormViewer.js
        │   ├── Dashboard.js      # Main dashboard UI
        ├── features/             # Complex UI capabilities and automations
        │   ├── automation/
        │   │   ├── MailResolve.js
        │   │   └── TaskAutomation.js
        │   └── client-note/
        │       ├── ClientNote.js
        │       ├── InfoPanel.js
        │       ├── MatterPanel.js
        │       └── SSAPanel.js
```

## Module Responsibilities & Dependencies

### `chrome-extension/manifest.json`
- **Responsibility**: Defines the extension's metadata, permissions, content scripts (and their load order), background scripts, and keyboard commands.
- **Dependencies**: None.

### `chrome-extension/background.js`
- **Responsibility**: Service worker that runs in the background. It listens for extension commands (keyboard shortcuts) and forwards them as messages to the active tab's content script.
- **Dependencies**: Chrome Extension API.

### `chrome-extension/content.js`
- **Responsibility**: Main content script entry point. It waits for the `GM_*` shim cache to be ready, then initializes the app via `AppObserver.init()`. It also listens for commands forwarded from the background script to trigger UI actions like toggling the Client Note or opening forms.
- **Dependencies**: `app.AppObserver`, `app.Features.ClientNote`, `app.Tools.ContactForms`, `app.Tools.Dashboard`.

### `chrome-extension/gm-compat.js`
- **Responsibility**: Provides a compatibility layer that shims Tampermonkey/Greasemonkey APIs (like `GM_getValue`, `GM_setValue`, `GM_xmlhttpRequest`) using Chrome Extension APIs (`chrome.storage.local`, `fetch`). This allows the legacy scripts to run with minimal modifications.
- **Dependencies**: Chrome Extension API (`chrome.storage`).

### `chrome-extension/src/core/AppObserver.js`
- **Responsibility**: Central orchestrator. Monitors URL changes, handles keyboard shortcuts, loads the taskbar, and coordinates the initialization/destruction of UI elements based on the parsed Salesforce `clientId`. Also handles **SSD Auto-Scraping** triggers on specific form pages.
- **Dependencies**: UI Modules (`Taskbar`, `Dashboard`, `ClientNote`, `ContactForms`, `SSDFormViewer`, `FeaturePanels`, `MailResolve`) and Core Modules (`Styles`, `Windows`, `Scraper`).

### `chrome-extension/src/config/Themes.js`
- **Responsibility**: Houses UI color constants and specific definitions for Note Themes. Contains the logic `applyTheme` to inject CSS properties to `:root`.
- **Dependencies**: None.

### `chrome-extension/src/config/Styles.css`
- **Responsibility**: Contains decoupled styles for generic components, dashboards, taskbars, and note panels.
- **Dependencies**: Injected via `manifest.json`.

### `chrome-extension/src/core/Utils.js`
- **Responsibility**: Shared independent functions and DOM utilities required by multiple files (e.g., parsing/formatting phone strings, shadow-DOM piercing queries, polling for elements).
- **Dependencies**: None.

### `chrome-extension/src/core/Scraper.js`
- **Responsibility**: Read-only extraction of data fields spanning standard elements and Salesforce LWC Shadow DOM elements. Includes recursive algorithms for retrieving deeply nested data.
- **Dependencies**: `src/core/Utils.js` (for formatting acquired phone numbers).

### `chrome-extension/src/core/WindowManager.js`
- **Responsibility**: Manages the life-cycle of custom internal popup windows. Applies event listeners for snapping, dragging, and double-click functionality to header components. 
- **Dependencies**: Frequently interacts with `ui/Taskbar.js` buttons functionality.

### `chrome-extension/src/core/SSADataManager.js`
- **Responsibility**: Remote request helper bridging UI interaction with the Github-hosted JSON Database entries.
- **Dependencies**: `GM_xmlhttpRequest` (via `gm-compat.js`).

### `chrome-extension/src/core/PdfManager.js`
- **Responsibility**: Contains logic for invoking external unpkg scripts (`PDFLib`) and retrieving Blob representations.
- **Dependencies**: Assumes `PDFLib` object presence.

### `chrome-extension/src/ui/Dashboard.js`
- **Responsibility**: The main dashboard UI showing recent and revisit clients, search capability, and configuration options (colors, data import/export).
- **Dependencies**: `app.Core.Themes`, `app.Core.Windows`, GM API tools.

### `chrome-extension/src/ui/panels/ContactForms.js`
- **Responsibility**: Specific data-entry popups for processing FO and DDS contacts and tracking status flags.
- **Dependencies**: `app.Core.Windows`.

### `chrome-extension/src/ui/panels/SSDFormViewer.js`
- **Responsibility**: UI for viewing captured full-page SSD form data (Application intake context) and conditionally triggering scraping.
- **Dependencies**: `app.AppObserver`, `app.Core.Scraper`, `app.Core.Windows`, `app.Features.ClientNote`.

### `chrome-extension/src/ui/panels/MedicationPanel.js`
- **Responsibility**: A three-panel UI for managing patient medications, linking them to conditions, and allowing for dosage/frequency input.
- **Dependencies**: `app.AppObserver`, `app.Core.Windows`.

### `chrome-extension/src/ui/panels/FeaturePanels.js`
- **Responsibility**: UI rendering specialized operational views including PDF Generation templates (L25, DDS Fax) and IR report copy-paste parser tools.
- **Dependencies**: `app.AppObserver`, `app.Core.Windows`, `app.Core.Scraper`, `app.Core.PdfManager` (via `loadPdfLib` and `fetchPdfBytes`).

### `chrome-extension/src/ui/Taskbar.js`
- **Responsibility**: Orchestrates building the bottom-aligned status indicator components representing currently active monitored tasks limits.
- **Dependencies**: GM API tools (`GM_listValues`, `GM_getValue`).

### `chrome-extension/src/features/automation/MailResolve.js`
- **Responsibility**: UI/automation for quickly marking "Mail Log" items as resolved within Salesforce.
- **Dependencies**: `app.Core.Utils`.

### `chrome-extension/src/features/automation/TaskAutomation.js`
- **Responsibility**: Complex DOM bot that automates creating NCL tasks and sending emails from Salesforce.
- **Dependencies**: GM API tools (`GM_getValue`), `app.Core.Utils`.

### `chrome-extension/src/features/client-note/ClientNote.js`
- **Responsibility**: The main module for the "Client Note" feature. Orchestrates the rendering of the core client note window, header, note-taking area, to-do lists, color theming, and side panels.
- **Dependencies**: `src/features/client-note/InfoPanel.js`, `src/features/client-note/SSAPanel.js`, `src/features/client-note/MatterPanel.js`, GM API tools, `app.Core.Windows`, `app.Core.Themes`.

### `chrome-extension/src/features/client-note/InfoPanel.js`
- **Responsibility**: Renders and handles the "Client Info" side panel within the Client Note window. Handles direct data updates and opens the SSD App scraper.
- **Dependencies**: GM API tools, `app.Core.Scraper`, `ClientNote.updateAndSaveData`.

### `chrome-extension/src/features/client-note/SSAPanel.js`
- **Responsibility**: Renders and handles the "SSA Contacts" side panel. Provides FO and DDS office search capabilities, auto-fills location details, and triggers fax forms or SC/VA status reports.
- **Dependencies**: GM API tools, `app.Core.SSADataManager`, `ClientNote.updateAndSaveData`, `app.Tools.FeaturePanels`.

### `chrome-extension/src/features/client-note/MatterPanel.js`
- **Responsibility**: Renders the "Matter Details" side panel within the Client Note, displaying read-only scraped indicators such as filing dates, PTR status, and CM1/ISU statuses.
- **Dependencies**: `app.Core.Scraper`, `ClientNote.updateIndicators`.
