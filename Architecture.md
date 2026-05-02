# CM Notes Project Modules Reference

This document serves as the central reference for the project's structure, files, responsibilities, and dependencies following the Chrome Extension migration.

> **Last verified against codebase:** 2026-05-01
> **If you change any file in `src/`, update this document.** See `docs/DS Optimization Plan.md` Item M1.

## Project Structure

```text
d:\KDCM Note Development\
└── CM Notes/              # Main Chrome Extension directory
    ├── manifest.json      # Extension manifest, defines permissions and scripts
    ├── README.md          # Project documentation and usage instructions
    ├── privacy_policy.md  # Data handling and privacy information
    ├── agent.md           # AI assistant agent instructions
    ├── check_leftovers.js # Standalone verification/cleanup script
    ├── background.js      # Service worker for background tasks and messages
    ├── content.js         # Main content script entry point
    ├── gm-compat.js       # Tampermonkey/Greasemonkey API compatibility layer
    ├── dds_addresses.json # DDS office address lookup data
    ├── icon/              # Extension icon assets
    ├── db/                # Offline SSA database backups (sourced from GitHub at runtime)
    │   └── SSADatabase.json
    ├── scripts/           # Standalone CLI helper scripts
    │   ├── db_manager.js  # CLI tool for updating FO/DDS contact info in the database
    │   ├── geocode-dds.js # Geocode DDS addresses
    │   └── geocode-offices.js # Geocode SSA field offices
    └── src/               # Source modules injected by manifest
        ├── config/
        │   ├── Themes.js         # Theme color constants and `applyTheme` mechanism
        │   └── Styles.css        # Core stylesheet for Floating Windows, Taskbar, Components
        ├── lib/
        │   ├── leaflet.min.js    # Leaflet.js v1.9.4 (bundled locally for CSP)
        │   └── leaflet.min.css   # Leaflet CSS (bundled locally)
        ├── core/                 # Shared generic functionality
        │   ├── AppObserver.js    # Route URL observer & Hotkey bindings
        │   ├── DistanceCalculator.js # Haversine distance + Nominatim geocoding + nearest-office finder
        │   ├── PdfManager.js     # Helper for fetching PDFs and loading PDF-lib
        │   ├── Scraper.js        # DOM extraction logic specifically for Salesforce/Lightning views
        │   ├── SSADataManager.js # Fetches and filters SSADatabase.json and SSADatabase_geo.json from GitHub
        │   ├── Utils.js          # Independent utility methods (e.g. phone formatting)
        │   └── WindowManager.js  # Generic drag/drop, resize, and stacking for popup 
        ├── ui/
        │   ├── Taskbar.js        # Lower sticky taskbar that renders counters and tab buttons
        │   ├── Dashboard.js      # Main dashboard UI
        │   ├── BackupManager.js  # Backup & Restore functionality (File System Access API)
        │   ├── GlobalNotes.js    # Persistent scratchpad and instructions panel
        │   ├── Scheduler.js      # Calendar and reminders panel
        │   └── panels/           # Breakout for independent feature panels
        │       ├── ContactForms.js
        │       ├── FeaturePanels.js
        │       ├── MedicationPanel.js
        │       └── SSDFormViewer.js
        ├── features/             # Complex UI capabilities and automations
        │   ├── automation/
        │   │   ├── MailResolve.js
        │   │   ├── TaskAutomation.js
        │   │   ├── iFaxAutomation.js   # Injects iFaxinjection.js into ifax.pro
        │   │   ├── iFaxinjection.js    # Web-accessible script (see manifest.json web_accessible_resources)
        │   │   └── AutomationPanel.js
        │   └── client-note/
        │       ├── ClientNote.js
        │       ├── InfoPanel.js
        │       ├── MatterPanel.js
        │       ├── NearestOffice.js  # Map popup for finding nearest SSA offices
        │       └── SSAPanel.js
```

> **Note on load order:** All modules use the IIFE (Immediately Invoked Function Expression) pattern with lazy initialization. This means the `manifest.json` content script load order does not need to strictly match the dependency graph — modules initialize themselves only when their API surface is first called. The exception is `gm-compat.js`, which must be loaded first (position 1) as it provides the global `GM_*` shims that all other modules depend on.
>
> **Style convention reminder:** When this doc says a module is "Relied upon by" another, that means the callee is **already listed** in that module's "Provided by" section. Conversely, "Requires" lists only direct imports — transitive dependencies are NOT duplicated here. If you are unsure about a transitive chain, trace it through: e.g. `Dashboard.js` → `Themes.js` → `gm-compat.js`.
```

## Module Responsibilities & Dependencies

### `CM Notes/manifest.json`
- **Responsibility**: Defines the extension's metadata, permissions, content scripts (and their load order), background scripts, and keyboard commands.
- **Dependencies**: None.

### `CM Notes/background.js`
- **Purpose**: Service worker that handles background tasks, manages browser-level operations (tabs, downloads), and forwards keyboard commands to content scripts.
- **Requires (Dependencies)**:
  - `content.js` [Message: "chrome_command"]
- **Provides (Used By)**:
  - Handles message actions: [Message: "GM_openInTab", "CLOSE_TAB", "DOWNLOAD_FILE", "OPEN_SCRAPER_WINDOW", "CLOSE_WINDOW"].
  - Relied upon by `gm-compat.js`, `FeaturePanels.js`, `InfoPanel.js`, and `content.js`.

### `CM Notes/content.js`
- **Purpose**: Acts as the main content script entry point that initializes the application via `AppObserver` and responds to global commands to toggle UI components.
- **Requires (Dependencies)**:
  - `gm-compat.js` [GM_ready]
  - `AppObserver.js`
  - `ClientNote.js`
  - `WindowManager.js`
  - `ContactForms.js`
  - `Dashboard.js`
  - `background.js` [Message: "chrome_command"]
- **Provides (Used By)**:
  - Central entry point that orchestrates the initial load and handles keyboard shortcut commands for the entire application.

### `CM Notes/gm-compat.js`
- **Purpose**: Provides a compatibility layer that shims Tampermonkey/Greasemonkey APIs using Chrome Extension storage and message passing to enable legacy user scripts to run as a native extension.
- **Requires (Dependencies)**:
  - `background.js` [Message: "GM_openInTab"]
- **Provides (Used By)**:
  - Shims global APIs for all modules: [GM_ready, GM_getValue, GM_setValue, GM_deleteValue, GM_listValues, GM_addStyle, GM_getResourceText, GM_setClipboard, GM_openInTab, GM_xmlhttpRequest, GM_addValueChangeListener, GM_removeValueChangeListener].
  - Relied upon by  content.js, AppObserver.js, Themes.js, WindowManager.js, SSADataManager.js, PdfManager.js, Dashboard.js, BackupManager.js, GlobalNotes.js, Scheduler.js, ContactForms.js, SSDFormViewer.js, MedicationPanel.js, FeaturePanels.js, Taskbar.js, TaskAutomation.js, ClientNote.js, InfoPanel.js, and SSAPanel.js.

### `CM Notes/src/core/AppObserver.js`
- **Purpose**: Monitors URL changes to extract Salesforce client IDs, manages global hotkeys, initializes the taskbar, and coordinates the lifecycle of UI panels (Note, Meds, Fax, IR) based on record context.
- **Requires (Dependencies)**:
  - `Themes.js`
  - `GlobalNotes.js`
  - `Scheduler.js`
  - `Taskbar.js`
  - `Scraper.js`
  - `ClientNote.js`
  - `WindowManager.js`
  - `MedicationPanel.js`
  - `FeaturePanels.js`
  - `MailResolve.js`
  - `SSDFormViewer.js`
  - `Dashboard.js`
  - `Utils.js`
  - `gm-compat.js` [GM_getValue, GM_setValue, GM_addValueChangeListener]
- **Provides (Used By)**:
  - Exports the `app.AppObserver` namespace for application initialization and context management.
  - Relied upon by `content.js` for initialization, and by `ClientNote.js`, `AutomationPanel.js`, `SSDFormViewer.js`, `MedicationPanel.js`, and `FeaturePanels.js` for state-aware panel management and client identification.

### `CM Notes/src/config/Themes.js`
- **Purpose**: Manages UI color constants and timezone-based note themes, and provides the logic to inject CSS theme properties into the document root.
- **Requires (Dependencies)**:
  - `gm-compat.js` [GM_getValue]
- **Provides (Used By)**:
  - Exports `app.Core.Themes`, `app.Core.NoteThemes`, and `app.Core.Styles.applyTheme` for global UI skinning.
  - Relied upon by `AppObserver.js`, `Dashboard.js`, and `ClientNote.js`.

### `CM Notes/src/config/Styles.css`
- **Purpose**: Defines the global visual identity and layout rules for all UI components, including the taskbar, floating windows, dashboards, panels, and defensive CSS overrides for Leaflet on Salesforce.
- **Requires (Dependencies)**:
  - `Themes.js` (provides CSS variable values)
- **Provides (Used By)**:
  - Centralized styling for the entire application; injected directly into the page via `manifest.json`.
  - Includes `#sn-nearest-office`-scoped Leaflet overrides that prevent Salesforce SLDS from breaking map tiles/popups.

### `CM Notes/src/core/Utils.js`
- **Purpose**: provides shared independent utility functions for phone formatting, shadow-DOM piercing queries, element polling, and global notification UI management.
- **Requires (Dependencies)**:
  - None.
- **Provides (Used By)**:
  - Exports the `app.Core.Utils` namespace.
  - Relied upon by `AppObserver.js`, `Scraper.js`, `BackupManager.js`, `MailResolve.js`, `TaskAutomation.js`, `AutomationPanel.js`, `ClientNote.js`, `FeaturePanels.js`, `MedicationPanel.js`, and `InfoPanel.js`.

### `CM Notes/src/core/Scraper.js`
- **Purpose**: Identifies, traverses, and extracts client and case field data from both standard DOM elements and nested Salesforce Lightning Web Component (LWC) shadow roots.
- **Requires (Dependencies)**:
  - `Utils.js`
- **Provides (Used By)**:
  - Exports methods `harvestFields`, `getHeaderData`, `getAllPageData`, `getSSDFormData`, and `getFullSSDData` to the `app.Core.Scraper` namespace.
  - Implements a "Settle delay" (500ms) to prevent conflicts with browser autofill extensions.
  - Used by `AppObserver.js`, `ClientNote.js`, `FeaturePanels.js`, `InfoPanel.js`, `MatterPanel.js`, and `SSDFormViewer.js`.

### `CM Notes/src/core/WindowManager.js`
- **Purpose**: manages the logic for creating, dragging, resizing, and z-index stacking of floating UI windows while persisting their dimensions and positions.
- **Requires (Dependencies)**:
  - `gm-compat.js` [GM_setValue]
- **Provides (Used By)**:
  - Exports `app.Core.Windows` namespace.
  - Used by: `content.js`, `AppObserver.js`, `Dashboard.js`, `ContactForms.js`, `SSDFormViewer.js`, `MedicationPanel.js`, `FeaturePanels.js`, `ClientNote.js`, `NearestOffice.js`, and `AutomationPanel.js`.

### `CM Notes/src/core/SSADataManager.js`
- **Purpose**: Fetches the remote `SSADatabase.json` and `SSADatabase_geo.json` from GitHub, caches them in memory, and provides `search` and `fetchGeo` methods for filtering and geocoded distance queries.
- **Requires (Dependencies)**:
  - `gm-compat.js` [GM_xmlhttpRequest]
- **Provides (Used By)**:
  - Exports the `SSADataManager` object (with `fetch`, `fetchGeo`, and `search` methods) to the `app.Core.SSADataManager` namespace.
  - Used by `SSAPanel.js` and `NearestOffice.js`.

### `CM Notes/src/core/DistanceCalculator.js`
- **Purpose**: Provides Haversine-formula distance calculation, client address geocoding via Nominatim, state extraction, and a nearest-office finder with same-state priority and cross-state fallback.
- **Requires (Dependencies)**:
  - `gm-compat.js` [GM_xmlhttpRequest]
- **Provides (Used By)**:
  - Exports the `app.Core.DistanceCalculator` namespace with `haversineDistance`, `geocodeAddress`, `findNearest`, and `extractState` methods.
  - Used by `SSAPanel.js` and `NearestOffice.js`.

### `CM Notes/src/core/PdfManager.js`
- **Purpose**: Helper module for cross-origin fetching of PDF binaries and asymmetric loading of the `PDFLib` library.
- **Requires (Dependencies)**:
  - `pdf-lib.min.js` (assumes library presence)
  - `gm-compat.js` [GM_xmlhttpRequest]
- **Provides (Used By)**:
  - Exports `app.Core.PdfManager` namespace.
  - Used by `FeaturePanels.js` for template-based PDF generation.

### `CM Notes/src/core/pdf-lib.min.js`
- **Purpose**: Third-party library for creating and modifying PDF documents client-side.
- **Requires (Dependencies)**:
  - None.
- **Provides (Used By)**:
  - Initializes the global `window.PDFLib` object.
  - Required by `PdfManager.js`.

### `CM Notes/src/lib/leaflet.min.js`
- **Purpose**: Third-party Leaflet.js v1.9.4 library for interactive map rendering, bundled locally to bypass Salesforce CSP.
- **Requires (Dependencies)**:
  - None.
- **Provides (Used By)**:
  - Initializes the global `L` object for map, tile layer, marker, and popup APIs.
  - Required by `NearestOffice.js`. CSS companion: `leaflet.min.css`.

### `CM Notes/src/ui/Dashboard.js`
- **Purpose**: Central command interface for searching client records, managing application settings, and performing data maintenance (backups/restores).
- **Requires (Dependencies)**:
  - `Themes.js`
  - `WindowManager.js`
  - `BackupManager.js`
  - `gm-compat.js` [GM_listValues, GM_getValue, GM_setValue, GM_deleteValue, GM_addValueChangeListener]
- **Provides (Used By)**:
  - Exports the `app.Tools.Dashboard` namespace.
  - Relied upon by `AppObserver.js` and `content.js` for UI toggling. Listens for `sn_dashboard_broadcast` to refresh its views when data changes in other tabs.

### `CM Notes/src/ui/BackupManager.js`
- **Purpose**: Facilitates manual and periodic backups of extension data to JSON files via the File System Access API and manages the restoration process.
- **Requires (Dependencies)**:
  - `Utils.js`
  - `gm-compat.js` [GM_listValues, GM_getValue, GM_setValue]
- **Provides (Used By)**:
  - Exports the `app.Tools.BackupManager` namespace.
  - Relied upon by `Dashboard.js` for executing data maintenance tasks.

### `CM Notes/src/ui/GlobalNotes.js`
- **Purpose**: Provides a persistent, multi-tabbed rich-text scratchpad and a centralized sidebar for launching major UI modules.
- **Requires (Dependencies)**:
  - `ContactForms.js`
  - `gm-compat.js` [GM_getValue, GM_setValue, GM_addValueChangeListener]
- **Provides (Used By)**:
  - Exports the `app.Tools.GlobalNotes` namespace.
  - Relied upon by `AppObserver.js` for global context-aware UI and hotkey management.

### `CM Notes/src/ui/Scheduler.js`
- **Purpose**: Manages a calendar-based reminder system that tracks holidays, client revisits, and custom user alerts with snooze-enabled notifications.
- **Requires (Dependencies)**:
  - `gm-compat.js` [GM_listValues, GM_getValue, GM_setValue, GM_addValueChangeListener]
- **Provides (Used By)**:
  - Exports the `app.Tools.Scheduler` namespace.
  - Relied upon by `AppObserver.js` for appointment tracking. Now actively loads client revisit data to display on the calendar. Uses a cross-tab lock to prevent duplicate notifications.

### `CM Notes/src/ui/panels/ContactForms.js`
- **Purpose**: Constructs and manages specialized popup windows for logging interactions with Social Security Field Offices (FO) and Disability Determination Services (DDS).
- **Requires (Dependencies)**:
  - `WindowManager.js`
  - `gm-compat.js` [GM_getValue]
- **Provides (Used By)**:
  - Exports the `app.Tools.ContactForms` namespace.
  - Relied upon by `content.js` and `GlobalNotes.js` for context-menu or keyboard-driven form activation.

### `CM Notes/src/ui/panels/SSDFormViewer.js`
- **Purpose**: UI for viewing captured full-page SSD form data (Application intake context) and conditionally triggering scraping.
- **Requires (Dependencies)**:
  - `AppObserver.js`
  - `Scraper.js`
  - `WindowManager.js`
  - `ClientNote.js`
  - `gm-compat.js` [GM_getValue, GM_setValue]
- **Provides (Used By)**:
  - Exports the `app.Tools.SSDFormViewer` namespace.
  - Relied upon by `AppObserver.js` for data visibility in SSD application context.

### `CM Notes/src/ui/panels/MedicationPanel.js`
- **Purpose**: A three-panel UI for managing patient medications, linking them to conditions, and allowing for dosage/frequency input.
- **Requires (Dependencies)**:
  - `AppObserver.js`
  - `WindowManager.js`
  - `Utils.js`
  - `gm-compat.js` [GM_getValue, GM_setValue, GM_deleteValue, GM_xmlhttpRequest]
- **Provides (Used By)**:
  - Exports the `app.Tools.MedicationPanel` namespace.
  - Relied upon by `ClientNote.js` for medication data management.

### `CM Notes/src/ui/panels/FeaturePanels.js`
- **Purpose**: UI rendering specialized operational views including PDF Generation templates (L25, DDS Fax) and IR report copy-paste parser tools.
- **Requires (Dependencies)**:
  - `AppObserver.js`
  - `WindowManager.js`
  - `Scraper.js`
  - `Utils.js` [showNotification]
  - `PdfManager.js` [fetchPdfBytes]
  - `gm-compat.js` [GM_getValue, GM_setClipboard]
  - [Message: "DOWNLOAD_FILE"]
- **Provides (Used By)**:
  - Exports the `app.Tools.FeaturePanels` namespace.
  - Relied upon by `AppObserver.js` for specific feature panel activation.

### `CM Notes/src/ui/Taskbar.js`
- **Purpose**: Displays a persistent status bar on Salesforce pages that tracks daily record productivity ("Matters touched") and urgent revisit alerts.
- **Requires (Dependencies)**:
  - `gm-compat.js` [GM_listValues, GM_getValue, GM_addValueChangeListener]
- **Provides (Used By)**:
  - Exports the `app.Core.Taskbar` namespace.
  - Relied upon by `AppObserver.js` and `ClientNote.js` for direct UI updates. Also listens for global `sn_dashboard_broadcast` events to refresh its counters in response to data changes in other tabs.

### `CM Notes/src/features/automation/MailResolve.js`
- **Purpose**: Automates the resolution of Salesforce Mail Log records by injecting a floating action button that populates and saves specific fields.
- **Requires (Dependencies)**:
  - `Utils.js`
- **Provides (Used By)**:
  - Exports the `app.Automation.MailResolve` namespace.
  - Relied upon by `AppObserver.js` for initialization on specific Salesforce URL patterns.

### `CM Notes/src/features/automation/AutomationPanel.js`
- **Purpose**: Provides a centralized UI panel for manual triggering of individual or batched automation steps for tasks and emails.
- **Requires (Dependencies)**:
  - `WindowManager.js`
  - `Utils.js`
  - `AppObserver.js`
  - `TaskAutomation.js`
- **Provides (Used By)**:
  - Exports the `app.Automation.AutomationPanel` namespace.
  - Relied upon by `ClientNote.js` for manual automation triggering.

### `CM Notes/src/features/automation/iFaxAutomation.js`
- **Purpose**: Content script specifically for `ifax.pro`. Injects a floating button to automate fax form filling using Selectize.js manipulation.
- **Requires (Dependencies)**:
  - `iFaxinjection.js` — injected as web-accessible script via `chrome.runtime.getURL` (see `manifest.json` `web_accessible_resources`)
  - `gm-compat.js` (for potential shared data access)
- **Provides (Used By)**:
  - Standalone execution on matching URL. Triggered via `ClientNote.js` or `FeaturePanels.js` opening the target URL.
  
### `CM Notes/src/features/automation/iFaxinjection.js`
- **Purpose**: Web-accessible script injected into `ifax.pro` by `iFaxAutomation.js`. Contains the logic that runs within the ifax.pro page context (automated form filling and navigation).
- **Requires (Dependencies)**:
  - None (runs in ifax.pro page context)
- **Provides (Used By)**:
  - Injected by `iFaxAutomation.js` via `chrome.runtime.getURL`.
  - Declared in `manifest.json` under `web_accessible_resources`.

### `CM Notes/src/features/automation/TaskAutomation.js`
- **Purpose**: Orchestrates multi-step browser automation for creating Salesforce tasks ("Rose Letters") and composing follow-up emails using dynamic client data.
- **Requires (Dependencies)**:
  - `Utils.js`
  - `gm-compat.js` [GM_getValue]
- **Provides (Used By)**:
  - Exports the `app.Automation.TaskAutomation` namespace.
  - Relied upon by `AutomationPanel.js` to execute specific automation sequences.

### `CM Notes/src/features/client-note/ClientNote.js`
- **Purpose**: orchestrates the "Client Note" feature by managing the core note window, rich-text case notes, and to-do lists while synchronizing client and matter data across multiple specialized sidebar panels.
- **Requires (Dependencies)**:
  - `Themes.js`
  - `Scraper.js`
  - `WindowManager.js`
  - `Taskbar.js`
  - `Utils.js`
  - `InfoPanel.js`
  - `SSAPanel.js`
  - `MatterPanel.js`
  - `AutomationPanel.js`
  - `Dashboard.js`
  - `MedicationPanel.js`
  - `AppObserver.js`
  - `gm-compat.js` [GM_getValue, GM_setValue, GM_addValueChangeListener, GM_removeValueChangeListener, GM_deleteValue]
- **Provides (Used By)**:
  - Exports the `app.Features.ClientNote` namespace.
  - Relied upon by `AppObserver.js`, `content.js`, `SSDFormViewer.js`, `InfoPanel.js`, and `NearestOffice.js` for client-specific note management and data persistence. Also broadcasts data changes via `sn_dashboard_broadcast` to trigger updates in other modules like `Taskbar` and `Dashboard` across all open tabs.

### `CM Notes/src/features/client-note/InfoPanel.js`
- **Purpose**: Manages the "Client Info" view within the client note window, providing fields for demographic data and a trigger for background scraping.
- **Mechanism**: Initiates scraping by messaging the background service worker to open a minimized "scraper" window. It uses a temporary, unique `GM_addValueChangeListener` key (`cn_scrape_result_{clientId}`) to safely receive scraped data without the risk of data loss if the scrape fails. Once data is received, it is merged into the main client data store via `ClientNote.updateAndSaveData`.
- **Requires (Dependencies)**:
  - `Scraper.js`
  - `Utils.js`
  - `gm-compat.js` [GM_getValue, GM_addValueChangeListener, GM_removeValueChangeListener, GM_deleteValue]
  - [Message: "OPEN_SCRAPER_WINDOW", "CLOSE_WINDOW"]
- **Provides (Used By)**:
  - Exports the `app.Features.InfoPanel` namespace.
  - Relied upon by `ClientNote.js` for rendering the panel and handling data updates.

### `CM Notes/src/features/client-note/NearestOffice.js`
- **Purpose**: Renders a floating map popup that geocodes the client's address, finds the nearest SSA Field Offices using `DistanceCalculator`, and displays results on an interactive Leaflet map with a clickable sidebar. Sidebar clicks save the selected FO to the SSA Panel.
- **Requires (Dependencies)**:
  - `leaflet.min.js` [L global]
  - `DistanceCalculator.js` [geocodeAddress, findNearest, extractState]
  - `SSADataManager.js` [fetchGeo]
  - `WindowManager.js` [setup, updateTabState]
  - `ClientNote.js` [updateAndSaveData] (for sidebar click-to-select)
  - `gm-compat.js` [GM_openInTab]
- **Provides (Used By)**:
  - Exports the `app.Features.NearestOffice` namespace.
  - Relied upon by `SSAPanel.js` for launching the map popup via the 📍 button.

### `CM Notes/src/features/client-note/SSAPanel.js`
- **Purpose**: Provides a side panel for searching and selecting Social Security Field Offices (FO) and Disability Determination Services (DDS) branches, with integrated quick-action buttons for status reports, fax forms, and nearest-office search.
- **Requires (Dependencies)**:
  - `SSADataManager.js` [search, fetchGeo]
  - `DistanceCalculator.js` [geocodeAddress, findNearest]
  - `NearestOffice.js` [create]
  - `FeaturePanels.js`
  - `gm-compat.js` [GM_getValue]
- **Provides (Used By)**:
  - Exports the `app.Features.SSAPanel` namespace.
  - Relied upon by `ClientNote.js` for managing SSA contact information associated with client records.

### `CM Notes/src/features/client-note/MatterPanel.js`
- **Purpose**: Displays a read-only overview of matter-specific indicators scraped from the Salesforce UI, including filing dates, claim statuses (Initial/Recon), and potential "Prior To Request" (PTR) alerts.
- **Requires (Dependencies)**:
  - `Scraper.js`
- **Provides (Used By)**:
  - Exports the `app.Features.MatterPanel` namespace.
  - Relied upon by `ClientNote.js` for visualizing current matter context.
