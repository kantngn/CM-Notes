# CM Notes Architecture Map

## Project Structure

```text
d:\KDCM Note Development\
└── CM Notes/              # Main Chrome Extension directory
    ├── manifest.json      # Extension manifest, defines permissions and scripts
    ├── README.md          # Project documentation and usage instructions
    ├── privacy_policy.md  # Data handling and privacy information
    ├── Architecture.md    # This file - detailed architecture reference
    ├── agent.md           # AI assistant agent instructions
    ├── check_leftovers.js # Standalone verification/cleanup script
    ├── background.js      # Service worker for background tasks and messages
    ├── content.js         # Main content script entry point (bootstraps AppObserver)
    ├── gm-compat.js       # Tampermonkey/Greasemonkey API compatibility layer
    ├── dds_addresses.json # DDS office address lookup data
    ├── icon/              # Extension icon assets
    ├── db/                # Offline SSA database backups (sourced from GitHub at runtime)
    │   ├── SSADatabase.json
    │   ├── SSADatabase_updated.json
    │   └── SSADatabase_geo.json
    ├── scripts/           # Standalone CLI helper scripts
    │   ├── db_manager.js  # CLI tool for updating FO/DDS contact info in the database
    │   ├── db_search.js   # CLI tool for searching the database
    │   └── [geocode scripts]
    └── src/               # Source modules injected by manifest
        ├── config/
        │   ├── Themes.js         # Theme color constants and `applyTheme` mechanism
        │   └── Styles.css        # Core stylesheet for floating windows, components
        ├── lib/
        │   ├── leaflet.min.js    # Leaflet.js v1.9.4 (bundled locally for CSP)
        │   ├── leaflet.min.css   # Leaflet CSS stylesheet
        │   ├── obs-ws.js         # OBS WebSocket client library (for ObsRecorder)
        │   └── obs-ws.min.js     # Minified version
        ├── core/                 # Shared generic functionality
        │   ├── AppObserver.js    # URL observer, hotkey bindings, module initialization
        │   ├── DistanceCalculator.js # Haversine distance + geocoding + nearest-office
        │   ├── PdfManager.js     # PDF-lib loading and helper methods
        │   ├── Scraper.js        # DOM extraction for Salesforce/Lightning
        │   ├── SSADataManager.js # SSA database fetching and filtering
        │   ├── Utils.js          # Shared utilities (phone formatting, delays, etc.)
        │   └── WindowManager.js  # Draggable windows, z-index management
        ├── ui/
        │   ├── Taskbar.js        # Sticky taskbar with tab buttons and counters
        │   ├── Dashboard.js      # Main dashboard panel
        │   ├── BackupManager.js  # Backup & Restore (File System Access API)
        │   ├── GlobalNotes.js    # Persistent scratchpad
        │   ├── Scheduler.js      # Calendar and reminders
        │   └── panels/           # Independent feature panels
        │       ├── ContactForms.js
        │       ├── FeaturePanels.js
        │       ├── MedicationPanel.js
        │       └── SSDFormViewer.js
        ├── features/             # Complex UI and automation features
        │   ├── automation/
        │   │   ├── TaskAutomation.js       # NCL, Email, SMS, FTR automation orchestrator
        │   │   ├── AutomationPanel.js      # UI panel with FTR/MANUAL tabs ⭐ Updated
        │   │   ├── ObsRecorder.js          # OBS recording + Communicator integration ⭐ New
        │   │   ├── BatchResolve.js         # Batch processing tool for datatables
        │   │   ├── MailResolve.js          # Email resolution automation
        │   │   ├── MacroRecorder.js        # Macro recorder/player for generic form automation
        │   │   ├── iFaxAutomation.js       # iFax integration
        │   │   └── iFaxinjection.js        # Web-accessible iFax script
        │   └── client-note/
        │       ├── ClientNote.js           # Main client note panel
        │       ├── InfoPanel.js            # Client data display
        │       ├── MatterPanel.js          # Matter-related info
        │       ├── NearestOffice.js        # SSA office finder map
        │       └── SSAPanel.js             # SSA information panel
```

## Guardrails
- `manifest.json` content_scripts define which pages get injected
- Content scripts live in `content.js` → bootstraps `AppObserver`
- `gm-compat.js` provides `GM_getValue`/`GM_setValue` shim (inject before content)
- Shadow DOM piercing via `Utils.js` (`queryDeep`, `queryAllDeep`, `waitForElement`)
- All modules attach to `window.CM_App` namespace

---

## Module Dependency Graph

```
content.js
  └── core/AppObserver.js       (requires: gm-compat, core/Utils)
        ├── core/WindowManager.js
        ├── features/automation/AutomationPanel.js (requires: WindowManager, Utils, gm-compat)
        │     └── features/automation/TaskAutomation.js (requires: Utils, gm-compat)
        ├── features/automation/ObsRecorder.js (requires: lib/obs-ws.js, WindowManager, Utils, gm-compat)
        ├── features/automation/BatchResolve.js (requires: WindowManager, Utils, gm-compat)
        ├── features/automation/MacroRecorder.js (requires: Utils, gm-compat)
        ├── ui/Dashboard.js
        ├── ui/InfoPanel.js (requires: Utils, gm-compat)
        └── ui/backup/BackupManager.js
```

---

## Module Responsibilities & Data Shapes

### 1. content.js (Bootstrap)
- **Provides**: Entry point via `manifest.json` content_scripts matches
- **Does**: Waits for `CM_App`, then calls `app.Core.AppObserver.init()` with client ID

### 2. core/AppObserver.js
- **Provides**:
  - `app.Core.AppObserver` – tracks current client context
  - `app.AppObserver.getClientId()` → returns the 18-character Salesforce Record ID
  - `app.Core.AppObserver.init(clientId)` – triggers all feature modules
- **Requires**: `gm-compat.js`, `core/Utils.js`

### 3. core/Utils.js
- **Provides**:
  - `app.Core.Utils.delay(ms)` → Promise delay
  - `app.Core.Utils.queryDeep(sel, root)` → querySelector that pierces Shadow DOM
  - `app.Core.Utils.queryAllDeep(sel, root)` → querySelectorAll that pierces Shadow DOM
  - `app.Core.Utils.waitForElement(sel, maxMs)` → polls DOM until element exists
  - `app.Core.Utils.showNotification(msg, opts)` → toast notification
- **Requires**: Nothing (vanilla JS DOM helpers)

### 4. features/automation/AutomationPanel.js
- **Provides**: `app.Automation.AutomationPanel` – Floating UI panel with tabs for task automation
- **Requires**: `WindowManager.js` (draggable windows), `Utils.js` (notifications), `gm-compat.js` (GM storage + listeners)
- **Active Tabs**: `FTR`, `MANUAL` (contains NCL/EMAIL/SMS sub-tabs)
  - Each tab renders content via `renderTabContent(clientId)` and binds events via `bindEvents(w, clientId)`
  - Tab switching triggers full `render()` which rebuilds panel and re-attaches listeners
- **State Management**:
  - `activeTab` – current tab (FTR or MANUAL)
  - `nclExploded` – NCL manual steps visibility
  - `_valueListenerId` – cleanup ID for GM_addValueChangeListener (prevents memory leaks)
- **Key Methods**:
  - `init()` – Seeds templates (defensive merge) and creates floating trigger
  - `create()` – Builds panel window with saved dimensions
  - `render(w, clientId)` – Re-renders HTML content and rebinds all events
  - `renderTabContent(clientId)` – Returns HTML for active tab:
    - **FTR tab**: CL/WN result dropdowns, custom text input, direction/target selectors, live preview, FTR result selector, trigger checkboxes (NCL/Email/SMS)
    - **MANUAL tab**: NCL section (full + exploded steps), Email (new + templates), SMS (templates), prefix selectors
  - `bindEvents(w, clientId)` – Attaches all click/change/input handlers; manages GM_addValueChangeListener cleanup
  - `renderPrefixSelectors(clientId)` – Mr./Mrs. mutually-exclusive checkboxes
  - `processPlaceholders(template, clientId)` – Replaces `{{clientName}}`, `{{cmName}}`, `{{cmExt}}`, `{{cmPhone}}`
  - `createTemplateEditor()` – Full template CRUD UI with:
    - Drag-drop reordering of email/SMS templates
    - RTE toolbar (bold, italic, lists, link) for email body
    - Placeholder reference guide
    - Template name editing
- **Memory Management**:
  - `_valueListenerId` stored and cleaned up before re-render to prevent listener stacking
  - Font size style element uses stable ID (`sn-fs-auto-content`)
  - Removed dead code (`ftrConfirmBtn`), fixed variable shadowing in MANUAL tab
- **Data Storage**:
  - `sn_templates` – { email: { key: {name, subject, body} }, sms: { key: {name, body} } }
  - `sn_templates_email_order` – Array of email template keys (user-ordered)
  - `sn_templates_sms_order` – Array of SMS template keys (user-ordered)
  - `cn_form_data_<clientId>.prefix` – "Mr." or "Mrs." (persisted per client)
  - `sn_auto_trigger_y` – Trigger button Y position
  - `sn_auto_panel_width_<tab>` – Saved width for FTR vs MANUAL tabs
  - `def_pos_AUTO` – Saved panel position/size (hold close button 0.4s to save)
  - `sn_global_font_size` – Font size override (9-24px, default 12)
  - `sn_ftr_trigger_states` – { ncl: bool, sms: bool, email: bool } (hold trigger label 0.5s to save)

### 5. features/automation/TaskAutomation.js
- **Provides**: `app.Automation.TaskAutomation` – DOM automation engine
- **Delegates to Utils**: `delay`, `queryDeep`, `queryAllDeep`, `waitForElement`

#### NCL Methods
| Method | Selectors Used | Behavior |
|--------|---------------|----------|
| `ncl_step1()` | `button[title="New Task"]`, `input[aria-label="Subject"]` | Clicks New Task, fills Subject with "Rose Letter 01 - NC to Client" |
| `ncl_step2()` | `label` (Due Date), `div[data-target-selection-name="sfdc:RecordField.Task.Type"]`, `a.select`, `a[role="option"]` | Sets Due Date to today, sets Type to "Send Letter" |
| `ncl_step3()` | `.assistiveText`, `input.uiInputTextForAutocomplete`, `a[role="option"]`, `button[name="SaveEdit"]` | Clears assignee, types "Rose", selects "Rose Robot - CM 1", saves |
| `runNCL(clientId)` | Orchestrator | Calls step1 → step2 → step3 sequentially |

#### Email Methods
| Method | Selectors Used | Behavior |
|--------|---------------|----------|
| `email_step1()` | `button[title="Email"][value="SendEmail"]`, `input[placeholder="Enter Subject..."]` | Opens email composer, waits for subject field |
| `email_step2(clientId)` | `ul[aria-label="Bcc"]`, `ul[aria-label="To"]`, `input` | Clears BCC, fills "To" with client email |
| `email_step3(clientId, template)` | `input[placeholder="Enter Subject..."]`, `iframe[title="Email Body"]`, `iframe.cke_wysiwyg_frame`, `body.cke_editable` | Fills subject, injects HTML body into CKEditor, appends signature |
| `runEmail(clientId, template)` | Orchestrator | Calls step1 → step2 → step3 sequentially |
| `clickSendEmail()` | `button.slds-button_brand[title="Send"]` | Clicks Send button |

#### SMS Methods
| Method | Selectors Used | Behavior |
|--------|---------------|----------|
| `sendSMS(clientId, template)` | `a[data-label="SMS"]`, `textarea.slds-textarea`, `svg[data-key="send"]` | Clicks SMS tab, fills textarea with template body |
| `clickSendSMS()` | `svg[data-key="send"]` (closest button), `button.slds-button_brand` | Clicks Send button in SMS component |

#### FTR (Failed to Reach) Logger Methods *(NEW)*
| Method | Selectors Used | Behavior |
|--------|---------------|----------|
| `getCLPhone(clientId)` | Reads `cn_form_data_<clientId>.Phone` | Returns first CL phone number or "No CL number" |
| `getWNPhone(clientId)` | Reads `cn_form_data_<clientId>.Witness` | Returns first WN phone number or "No WN number" |
| `clickLastActivity()` | `button[title="Last Activity"]` | Clicks Last Activity button, waits for publisher |
| `fillSubject(text)` | `input.slds-combobox__input[aria-label="Subject"]` | Fills Subject input with dispatch events |
| `fillComment(text)` | `textarea.uiInputTextArea` | Fills Comment textarea with dispatch events |
| `clickSaveButton(waitMs)` | `button.cuf-publisherShareButton.slds-button--brand` | Clicks Salesforce Save button |
| `buildFTRComment(clientId, config)` | *Pure function* | Builds formatted FTR comment string: `"FTR CL @ {phone} - {result} {custom}"` + optional WN line |
| `runFTR(clientId, config)` | Orchestrator (first phase) | Click Last Activity → fill Subject → fill Comment → store state → return comment |
| `confirmAndSaveFTR()` | Orchestrator (second phase) | Save → if WN: loop WN auto-save → if NCL: runNCL() → sendSMS() → runEmail() |
| `getSignature()` | `a.select` (email from) | Returns HTML signature block with CM contact info |

#### FTR Config Shape
```js
{
  ftrResult: string,        // Full FTR result text (e.g. "Not in services")
  customFtrText?: string,   // Optional text appended after ftrResult
  nclOption: "NCL" | "No NCL",
  wnResult: string,         // WN result text ("No WN" = explicit no, empty = no WN, other = result)
  triggerNCL: boolean,      // Run NCL automation after FTR save
  triggerSMS: boolean,      // Run SMS automation after FTR save
  triggerEmail: boolean     // Run Email automation after FTR save
}
```

#### FTR Comment Format
```
FTR CL @ <CL phone> - <FTR result> <custom text>
Called WN @ <WN phone>, <WN result>                                                 [if WN result selected]
```

### 6. features/automation/ObsRecorder.js
- **Provides**: `app.Automation.ObsRecorder` – OBS Studio recording controller with Communicator auto-tracking
- **Requires**: `lib/obs-ws.js` (OBS WebSocket library), `WindowManager.js`, `Utils.js`, `gm-compat.js`
- **Guard Rail**: Only initializes for "Kant Nguyen" (checks `sn_global_cm1` + `sn_global_email`)
- **Core Features**:
  - **OBS Connection**: obs-websocket (default 127.0.0.1:4455) for recording control
  - **Companion App Integration**: WebSocket to companion_app.py on `localhost:8027`
    - Receives JSON events: `{event: CALL_RINGING|CALL_CONNECTED|CALL_HOLD|CALL_RESUMED|CALL_END, number, duration}`
    - Exponential backoff reconnect (5s → 10s → 20s → 40s → 60s cap)
    - Cleanup on page unload via `beforeunload`/`pagehide` handlers
  - **Auto-Track**: Toggle checkbox to enable/disable call-based recording automation
  - **Call Direction Detection**:
    - Automation panel visible → `To` (outgoing, user initiated)
    - CALL_RINGING before CALL_CONNECTED → `From` (incoming)
    - CALL_CONNECTED without CALL_RINGING → `To` (outgoing, dialed)
  - **Client Phone Matching**: Auto-detects call target (CL/DDS/Other) by matching digits
  - **Filename**: `{YYYY-MM-DD HH:MM} - {ClientName} - Call {From/To} {CL/DDS/SSA}`
  - **Elapsed Timer**: Formatted display (HH:MM:SS) while recording
- **OBS Methods**:
  - `doConnect()` – Initiates OBS WebSocket connection
  - `doStart()` – Starts recording, caches client name, begins elapsed timer
  - `doPause()` – Pauses recording
  - `doResume()` – Resumes paused recording
  - `doStop()` – Stops recording, saves file with generated filename
  - `doDisconnect()` – Closes OBS connection
  - `updateStatus()` – Polls OBS for recording/paused state
- **Companion Methods**:
  - `connectCompanion()` – Establishes WebSocket with error/close handlers
  - `handleCompanionMessage(event)` – Processes call events; auto-records if enabled
  - `_detectCompanionDirection(number)` – Logic for From/To determination
  - `_isClientPhoneNumber(number)` – Phone digit matching
  - `_stripPhone(num)` – Extract digits only
  - `_cancelReconnectTimer()` – Cleanup pending reconnect
  - `_scheduleCompanionReconnect()` – Schedule retry with exponential backoff
  - `disconnectCompanion()` – Close WebSocket, cancel timers
  - `updateCompanionUI()` – Sync checkbox/status indicator
- **Panel Methods**:
  - `init()` – Load config, create trigger, connect companion
  - `create()` – Build panel window
  - `render(w)` – Render UI with status, direction selectors, filename preview
  - `bindEvents(w)` – Attach button/checkbox handlers
  - `showSettings(w)` – Expand settings section for host/port/password
- **Filename/Timer Methods**:
  - `getClientName()` – Lookup client by phone number from all GM keys
  - `getDateStr()` – Format timestamp for filename
  - `getRecordId()` – Extract Salesforce record ID from page
  - `buildFilename()` – Generate full filename string
  - `buildFilenamePreview(clientName)` – Show preview
  - `startElapsedTimer()` – Begin 1s interval updates
  - `stopElapsedTimer()` – Clear interval
  - `formatElapsed(seconds)` – Convert to HH:MM:SS
- **Trigger Management**:
  - Two-sided floating trigger (left or right, configurable)
  - Draggable; saves Y position on drag
  - Expands/contracts on hover
- **Data Storage**:
  - `sn_obs_config` – { host, port, password }
  - `sn_obs_auto_track` – Boolean (auto-record enabled)
  - `sn_obs_trigger_y` – Saved Y position
  - `sn_obs_panel_y` – Saved panel Y position
  - `sn_obs_filename_customized` – Boolean (direction/target explicitly set)
  - `sn_global_email` – Used for guard rail check

### 7. features/automation/MacroRecorder.js
- **Provides**: `app.Automation.MacroRecorder` – Macro recorder and playback engine for Salesforce Lightning form automation.
- **Requires**: `core/Utils.js` (DOM traversal, polling), `core/WindowManager.js` (draggable windows), `gm-compat.js` (storage).
- **Standalone Panel**: Floating trigger button (`🎬`) + draggable panel (300px wide). Activated via `Alt+M` keyboard shortcut or clicking the trigger.
- **Trigger Management**: Two-sided floating trigger (left/right, draggable); saves position and side to GM storage.
- **Core Features**:
  - **Recording Mode**: Captures user interactions (clicks, combobox selections, removes, field clears) via capture-phase event listeners.
  - **Selector Extraction**: Builds multi-strategy selectors from stable HTML attributes (`aria-label`, `title`, `data-target-selection-name`, `role+text`, `name`, `placeholder`, `data-key`) — never uses coordinates or fragile DOM paths. Also captures `tagName`, `cssPath` (positional path via `_buildUniqueCSSPath`), and validates uniqueness during recording.
  - **Smart Step Merging**: Automatically pairs a combobox trigger click with the subsequent option click into a single `select` step.
  - **Remove Detection**: Recognizes "X" clear buttons by title, aria-label, or icon content.
  - **Clear Detection**: Monitors input changes: when a non-empty text/date field becomes empty, records a `clear` step.
  - **Playback Engine**: Uses **scored multi-attribute matching** (`_findBestMatch`) instead of OR-based first-match. Collects ALL candidates matching ANY recorded attribute, then scores each against ALL attributes. Returns the element with the highest combined score. Falls back to CSS path → shadow DOM piercing → polling.
  - **Macro Storage**: Named macros stored in `sn_macros` GM key with URL pattern detection for auto-suggest.
- **New Selector Methods**:
  - `_buildUniqueCSSPath(el, maxDepth)` – Generates a positional CSS path using `tag:nth-of-type(n)[attr]` walking up the DOM tree (max 5 levels). Uses IDs where available; appends stable attributes (`aria-label`, `title`, `name`) at each level for precision.
  - `_validateSelectorsUniqueness(selectors, el)` – Checks if the best attribute selector matches exactly one element. Logs a warning if multiple matches exist (common in Salesforce with repeated components).
  - `_scoreElement(selectors, candidate)` – Scores a candidate against all recorded attributes. Each attribute has a weight: `aria-label`=100, `title`=90, `dataTarget`=85, `dataKey`=75, `name`=70, `placeholder`=60, `innerText`=50/25, `selectedValue`=45, `role`=40, `iconName`=35, `tagName`=30, `cssPath`=20 (suffix bonus). Higher score = better match.
  - `_findBestMatch(selectors)` – Collects candidates from ALL available selector attributes (uses CSS attribute selectors, role+text, and cssPath). Scores each via `_scoreElement` and returns the best match. Also queries shadow DOM if no light-DOM candidates found.
- **Panel Methods**:
  - `init()` – Creates the floating 🎬 trigger button (called from AppObserver at startup).
  - `toggle()` – Opens/closes the macro panel. Also called by `Alt+M`.
  - `create()` – Builds panel window, calls `render()`.
  - `render(w)` – Renders Record/Stop buttons, status line, and macro list with play/delete.
  - `bindEvents(w)` – Attaches Record/Stop/Cancel/Play/Delete handlers.
- **Action Types**:
  | Type | Description | Example |
  |------|-------------|--------|
  | `click` | Click a button/link | `{ type: "click", selectors: { title: "Edit Addressed To", cssPath: "div.slds-form-element > button[title=..." }, waitAfter: 800 }` |
  | `select` | Select from combobox (auto-paired) | `{ type: "select", selectors: { ariaLabel: "Addressed To", tagName: "button" }, value: "KD", waitAfter: 200 }` |
  | `remove` | Click a clear/remove (X) button | `{ type: "remove", selectors: { title: "Remove", cssPath: "..." }, waitAfter: 500 }` |
  | `clear` | Clear a text/date input field | `{ type: "clear", selectors: { name: "Date__c", tagName: "input" }, waitAfter: 300 }` |
  | `delay` | Wait for a duration | `{ type: "delay", ms: 1500 }` |
  | `waitFor` | Wait for an element to appear | `{ type: "waitFor", selectors: { title: "SaveEdit", cssPath: "..." }, timeout: 5000 }` |
- **Scored Matching Weights**:
  | Attribute | Weight | Notes |
  |-----------|--------|-------|
  | `aria-label` | 100 | Most reliable semantic attribute |
  | `title` | 90 | Tooltip text, often unique |
  | `data-target-selection-name` | 85 | Salesforce Lightning field ref |
  | `data-key` / `data-value` | 75 | Lightning combobox item key |
  | `name` | 70 | Form field name attribute |
  | `placeholder` | 60 | Input placeholder text |
  | `innerText` (exact) | 50 | Full text content match |
  | `innerText` (partial) | 25 | Text substring match |
  | `selectedValue` | 45 | Combobox option text |
  | `role` | 40 | ARIA role attribute |
  | `iconName` | 35 | Lightning icon identifier |
  | `tagName` | 30 | Element tag (input, button, etc.) |
  | `cssPath` (suffix) | 20 | Positional path bonus |
- **Data Storage**:
  - `sn_macros` – Object: `{ macroName: { steps: Array, urlPattern: string, created: number, updated: number } }`
  - Recording state is session-only (not persisted).

### 8. features/automation/BatchResolve.js
- **Provides**: `app.Automation.BatchResolve` – Generic batch processing tool for Salesforce lightning-datatable pages.
- **Requires**: `core/Utils.js` (DOM traversal, notification), `core/WindowManager.js` (draggable windows), `gm-compat.js` (GM storage + listeners).
- **Core Features**:
  - **Table Parsing**: Reads `data-label` from headers/cells, pierces Shadow DOM to extract full text, handles injected content.
  - **Filtering**: Multi-condition UI filters (equals, contains, empty, etc.) on extracted data columns.
  - **Queue Management**: Processes selected entries asynchronously with user-defined concurrency limit (1-5).
  - **Inter-window Communication**: Spawns background windows (`OPEN_SCRAPER_WINDOW` message to background script) and waits for result via `GM_addValueChangeListener` (e.g. from `MailResolve.js`).
- **Data Structures**:
  - `entry`: `{ id, url, data (parsed columns), index, status, error }`
  - `filter`: `{ column, operator, value }`
  - `queue`: `{ maxConcurrent, activeSlots, queue, paused, _listeners, _timeouts, stop(), pause(), resume(), _fillSlots() }`

### 9. ui/Dashboard.js
- **Provides**: `app.UI.Dashboard` – Main dashboard panel

### 10. ui/InfoPanel.js
- **Provides**: `app.UI.InfoPanel` – Displays scraped form data in a sidebar panel
- **Reads**: `cn_form_data_<clientId>` (Phone, Witness, Email fields used by FTR Logger)

### 11. core/WindowManager.js
- **Provides**: `app.Core.Windows` – Window z-index management, draggable, toggle, close utilities

### 12. ui/backup/BackupManager.js
- **Provides**: Backup/restore UI for CM Notes data

---

## Data Storage Keys (GM_setValue/GM_getValue)

| Key | Type | Module | Description |
|-----|------|--------|-------------|
| `cn_<clientId>` | Object | AppObserver | Client basic data (name, ID, etc.) |
| `cn_form_data_<clientId>` | Object | ClientNote | Client form fields (Phone, Witness, Email, Meds, prefix) |
| `sn_global_cm1` | string | Global | CM1 name (default: "Kant Nguyen") |
| `sn_global_email` | string | Global | CM1 email for OBS guard rail |
| `sn_global_ext` | string | Global | CM1 extension (default: "1072") |
| `sn_global_font_size` | number | AutomationPanel | Font size override (9-24, default 12) |
| **AutomationPanel** | | | |
| `sn_templates` | Object | AutomationPanel | { email: { key: {name, subject, body} }, sms: { key: {name, body} } } |
| `sn_templates_email_order` | Array | AutomationPanel | Ordered email template keys |
| `sn_templates_sms_order` | Array | AutomationPanel | Ordered SMS template keys |
| `sn_ftr_trigger_states` | Object | AutomationPanel | { ncl: bool, sms: bool, email: bool } |
| `sn_auto_trigger_y` | string | AutomationPanel | Trigger button Y position |
| `sn_auto_panel_width_FTR` | number | AutomationPanel | Panel width when FTR tab active |
| `sn_auto_panel_width_MANUAL` | number | AutomationPanel | Panel width when MANUAL tab active |
| `def_pos_AUTO` | Object | AutomationPanel | { width, height, top, left, right } (hold close btn 0.4s to save) |
| **BatchResolve** | | | |
| `sn_batch_concurrency` | number | BatchResolve | Max concurrent background windows (1-5) |
| `sn_batch_trigger_<id>` | Object | BatchResolve | Trigger signal to content script: `{ entryId, recordId, url, timestamp }` |
| `sn_batch_result_<id>` | Object | BatchResolve | Result payload from child window: `{ success, skipped, error }` |
| **MacroRecorder** | | | |
| `sn_macros` | Object | MacroRecorder | `{ macroName: { steps: Array, urlPattern, created, updated } }` |
| `sn_macro_trigger_y` | string | MacroRecorder | Trigger button Y position |
| `sn_macro_trigger_side` | string | MacroRecorder | Trigger side ("left" or "right") |
| **ObsRecorder** | | | |
| `sn_obs_config` | Object | ObsRecorder | { host: string, port: number, password: string } |
| `sn_obs_auto_track` | Boolean | ObsRecorder | Auto-record enabled flag |
| `sn_obs_trigger_y` | string | ObsRecorder | Trigger button Y position |
| `sn_obs_panel_y` | string | ObsRecorder | Panel Y position |
| `sn_obs_filename_customized` | Boolean | ObsRecorder | Direction/target explicitly set (session-only, not persisted) |

## FTR Logger Workflow

```
User selects FTR result ↓
Live preview updates in panel ↓
User clicks "▶ Run FTR Logger" ↓
  → clickLastActivity()
  → fillSubject("Call to Client/FTR")
  → fillComment(buildFTRComment())
  → store _ftrState
  → Show "Confirm & Save" button ↓
User reviews Salesforce fields, clicks "✅ Confirm & Save" ↓
  → clickSaveButton()
  → [if WN enabled] clickLastActivity() → fillComment() → auto-save ↓
  → [if NCL option = "NCL"] runNCL() → sendSMS() → runEmail() (sequential)

---

## OBS Companion Auto-Tracking Workflow

The ObsRecorder auto-track feature integrates with a companion Python app (companion_app.py) running on `localhost:8027`. The companion app monitors Bicom Communicator for call events and sends them to the extension via WebSocket.

```
Companion App (localhost:8027)
    ↓ Call Event (JSON)
    {event: "CALL_CONNECTED", number: "+1-555-123-4567", duration: 0}
    ↓
ObsRecorder.js (connectCompanion)
    ├─ handleCompanionMessage() event dispatcher
    │   ├─ CALL_RINGING → _firstRingTime = now
    │   ├─ CALL_CONNECTED → [if auto-track enabled] doStart()
    │   ├─ CALL_HOLD → doPause()
    │   ├─ CALL_RESUMED → doResume()
    │   └─ CALL_END → doStop() + rename file
    │
    └─ Direction Detection: _detectCompanionDirection(number)
        ├─ if CALL_RINGING before CALL_CONNECTED → Direction = "From" (incoming)
        ├─ if CALL_CONNECTED without CALL_RINGING → Direction = "To" (outgoing)
        └─ Automation panel visible → Override to "To"
```

### Auto-Track Behavior
When auto-track is **enabled** and a call connects:
1. OBS recording starts automatically
2. Filename is generated: `YYYY-MM-DD HH:MM - {ClientName} - Call {From/To} {ClientType}`
3. Elapsed timer begins updating (HH:MM:SS)
4. If call is placed on hold → pause recording
5. If call is resumed → resume recording
6. When call ends → stop recording and rename file with final filename

### Reconnection Logic
If the companion WebSocket connection drops:
- Exponential backoff: 5s → 10s → 20s → 40s → 60s (capped)
- `_companionWsIdentity` token prevents stale reconnects from overwriting active state
- Connection attempt continues until page unload
- Page unload handlers (beforeunload/pagehide) clean up WebSocket and pending timers

### Data Storage
- `sn_obs_auto_track` – Boolean persisted across sessions
- `sn_obs_config` – OBS host/port/password (default: 127.0.0.1:4455)
- Call events not stored; only session-scoped (elapsed time, direction)

---

## Code Quality & Memory Leak Prevention

Recent code improvements ensure robust long-lived connections and efficient resource management:

### 1. Listener Lifecycle Management
**Pattern**: Clean up listeners before re-registering.

```javascript
// AutomationPanel.js - GM_addValueChangeListener cleanup
if (this._valueListenerId != null) {
    GM_removeValueChangeListener(this._valueListenerId);
    this._valueListenerId = null;
}
this._valueListenerId = GM_addValueChangeListener('cn_form_data_' + clientId, (name, old, newVal, remote) => {
    // Handle form data changes...
});
```

**Why**: Switching tabs or re-rendering the panel would otherwise stack multiple listeners, consuming memory and causing duplicate triggers.

### 2. Identity Tokens for Stale Callback Prevention
**Pattern**: Each WebSocket connection gets a unique ID. Callbacks check the ID before touching state.

```javascript
// ObsRecorder.js - Companion WebSocket with identity token
const wsId = Math.random();
this._companionWsIdentity = wsId;
conn.onclose = () => {
    if (this._companionWsIdentity !== wsId) return; // Stale callback, ignore
    // Process close, schedule reconnect...
};
```

**Why**: Rapid reconnects can cause race conditions where old connection callbacks execute after new ones, corrupting state.

### 3. Exponential Backoff for Reconnects
**Pattern**: Cap retry intervals to prevent thundering herd and server abuse.

```javascript
// ObsRecorder.js - Exponential backoff (5s → 10s → 20s → 40s → 60s cap)
_scheduleCompanionReconnect() {
    this._companionReconnectMs = Math.min(60000, (this._companionReconnectMs || 2500) * 2);
    this._companionReconnectTimer = setTimeout(() => {
        this.connectCompanion();
    }, this._companionReconnectMs);
}
```

**Why**: Quick retries overwhelm the server; exponential backoff with cap ensures graceful degradation.

### 4. Scored Multi-Attribute Element Resolution
**Pattern**: Instead of OR-based first-match (try attribute A, then B, then C — return first hit), use AND-based scoring: collect ALL candidates matching ANY attribute, score each against ALL attributes, return the best match.

```javascript
// MacroRecorder.js - Scored matching replaces first-match-wins
_findBestMatch(selectors) {
  // Collect candidates from ALL available selector attributes
  const candidateSet = new Set();
  for (const attr of ['ariaLabel', 'title', 'dataTarget', 'name']) {
    const els = document.querySelectorAll(`[${attr}="${selectors[attr]}"]`);
    els.forEach(el => candidateSet.add(el));
  }
  // Score each candidate — highest score wins
  let bestEl = null, bestScore = -1;
  for (const candidate of candidateSet) {
    const score = this._scoreElement(selectors, candidate);
    if (score > bestScore) { bestScore = score; bestEl = candidate; }
  }
  return bestEl;
}
```

**Why**: In Salesforce (and other complex SPAs), multiple elements share the same `aria-label` or `title` (e.g., repeated form fields). OR-based matching picks the first DOM match, which may be wrong. Scored matching considers ALL attributes simultaneously and picks the element that matches the MOST recorded properties.

### 5. Stable DOM Element IDs
**Pattern**: Use static IDs instead of timestamps.

```javascript
// AutomationPanel.js - Stable ID for font-size style element
const fsStyleId = 'sn-fs-auto-content';  // NOT: 'sn-fs-' + Date.now()
```

**Why**: Dynamic IDs (e.g., `Date.now()`) create orphaned style elements on every render, leaking DOM memory.

### 5. Defensive Data Structure Validation
**Pattern**: Check structure keys, not just existence.

```javascript
// AutomationPanel.js - init() defensive template seeding
const stored = GM_getValue('sn_templates', {});
const defaultTemplates = { email: {}, sms: {} };
const merged = {
    email: (stored.email && typeof stored.email === 'object') ? stored.email : {},
    sms: (stored.sms && typeof stored.sms === 'object') ? stored.sms : {}
};
```

**Why**: Malformed stored data (e.g., string instead of object) can crash template rendering.

### 6. Resource Cleanup on Page Unload
**Pattern**: Unsubscribe WebSockets, clear timers.

```javascript
// ObsRecorder.js - Page unload handlers
window.addEventListener('beforeunload', () => {
    this.disconnectCompanion();
    this.stopElapsedTimer();
});
window.addEventListener('pagehide', () => {
    this._cancelReconnectTimer();
});
```

**Why**: Lingering connections and timers survive navigation, wasting resources and causing stale updates.

### Code Review Issues Fixed (AutomationPanel.js)
| Line | Issue | Category | Fix |
|------|-------|----------|-----|
| 29-31 | Defensive template merge missing structure validation | Logic | Validate `stored.email` and `stored.sms` are objects before use |
| 368-374 | GM_getValue called 3× for same key | Logic | Cache `trigStates = GM_getValue('sn_ftr_trigger_states', {})` once |
| 383-397 | `templates` and `getOrderedItems` redeclared in MANUAL tab (shadowing) | Shadowing | Remove duplicate const; use outer scope variables |
| 476, 483 | GM_addValueChangeListener stacks on tab switch (memory leak) | Memory Leak | Store `_valueListenerId`; cleanup before re-register |
| 504 | `ftrConfirmBtn` DOM query with no usage | Dead Code | Remove unused query |
| 736 | Font-size style element ID regenerated each render | Fragile IDs | Change from `'sn-fs-' + Date.now()` to `'sn-fs-auto-content'` |

---

## Extension Development Best Practices

### 1. Shadow DOM Piercing
Use `Utils.queryDeep()` to reach elements inside Shadow DOM subtrees:

```javascript
const el = app.Core.Utils.queryDeep('lightning-record-form', document);
```

### 2. Lifecycle Patterns
- **Content Script Init**: Waits for `window.CM_App` namespace, then calls `AppObserver.init(clientId)`
- **Module Init**: Each module's `init()` should be idempotent and cache initialization state
- **Cleanup**: Always remove listeners and close connections on page unload/navigation

### 3. GM Storage Patterns
- Prefix keys with context (e.g., `sn_templates` for application, `cn_form_data_<clientId>` for per-client)
- Use defensive merges to handle corrupted or missing data
- Store serializable data only (objects, arrays, strings, booleans)

### 4. WebSocket Connection Patterns
- Use identity tokens to prevent stale callback race conditions
- Implement exponential backoff with a reasonable cap (e.g., 60s)
- Clean up connections and pending timers on page unload
- Log connection state transitions for debugging

### 5. Floating UI Patterns
- Draggable windows use `WindowManager` for z-index management
- Tab-based panels should cache active tab in GM storage
- Panel dimensions and positions should be saved and restored
- Hold-to-confirm gestures (0.4-0.5s) prevent accidental triggers

### 6. Testing & Debugging
- Use `app.Core.Utils.showNotification()` for user feedback during automation
- Log WebSocket state transitions and call events for connection debugging
- Check guard rails (e.g., `if (this.cm1Name !== 'Kant Nguyen') return;`) before initializing restricted features
- Validate DOM selections with `querySelectorAll` before acting on assumed existence