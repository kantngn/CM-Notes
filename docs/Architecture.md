# CM Notes Architecture Map

## Project Structure

```text
d:\KDCM Note Development\
└── CM Notes/              # Main Chrome Extension directory
    ├── manifest.json      # Extension manifest, defines permissions and scripts
    ├── README.md          # Project documentation and usage instructions
    ├── agent.md           # AI assistant agent instructions
    ├── background.js      # Service worker for background tasks and messages
    ├── content.js         # Main content script entry point (bootstraps AppObserver)
    ├── gm-compat.js       # Tampermonkey/Greasemonkey API compatibility layer
    ├── docs/              # Project documentation
    │   ├── Architecture.md    # This file - detailed architecture reference
    │   └── privacy_policy.md  # Data handling and privacy information
    ├── data/              # Static data assets
    │   └── dds_addresses.json # DDS office address lookup data
    ├── icon/              # Extension icon assets
    ├── db/                # Offline SSA database backups (sourced from GitHub at runtime)
    │   ├── SSADatabase.json
    │   ├── SSADatabase_updated.json
    │   └── SSADatabase_geo.json
    ├── scripts/           # Standalone CLI helper scripts
    │   ├── check_leftovers.js # Standalone verification/cleanup script
    │   ├── db_manager.js  # CLI tool for updating FO/DDS contact info in the database
    │   ├── db_search.js   # CLI tool for searching the database
    │   └── [geocode scripts]
    └── src/               # Source modules injected by manifest
        ├── config/
        │   ├── Themes.js         # Theme color constants and `applyTheme` mechanism
        │   └── Styles.css        # Core stylesheet for floating windows, components
        ├── lib/
        │   ├── html2canvas.min.js # Screenshot library (for iFax receipt generation)
        │   ├── leaflet.min.js    # Leaflet.js v1.9.4 (bundled locally for CSP)
        │   ├── leaflet.min.css   # Leaflet CSS stylesheet
        │   ├── obs-ws.js         # OBS WebSocket client library (for ObsRecorder)
        │   ├── obs-ws.min.js     # Minified version
        │   └── pdf-lib.min.js    # PDF-lib library (PDF generation/manipulation)
        ├── core/                 # Shared generic functionality
        │   ├── AppObserver.js    # URL observer, hotkey bindings, module initialization
        │   ├── DistanceCalculator.js # Haversine distance + geocoding + nearest-office
        │   ├── PdfManager.js     # PDF-lib loading and helper methods
        │   ├── Scraper.js        # Primary data extractor: harvestFields (generic label scanner), getAllPageData (API-mapped fields), getSSDFormData (SSD app form), getFullSSDData (two-pass Tab 1+2)
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
        │       ├── FeaturePanels.js       # ⭐ Thin router → delegates to FaxPanel / IRPanel
        │       ├── FaxPanel.js            # ⭐ NEW — PDF Forms panel (extracted from FeaturePanels)
        │       ├── IRPanel.js             # ⭐ NEW — IR Tool panel (extracted from FeaturePanels)
        │       ├── Stamp1696.js           # ⭐ NEW — 1696 Fee Agreement PDF stamping
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
        │   │   ├── iFaxReceiptObserver.js  # Outlook email observer for iFax confirmations
        │   │   └── iFaxinjection.js        # Web-accessible iFax script
        │   └── client-note/
        │       ├── ClientNote.js           # Main client note panel
        │       ├── ProviderPanel.js         # ⭐ Medical Providers panel (compact card layout, text export)
        │       ├── InfoPanel.js            # Main data hub: harvestFields() for core fields, getSSDFormData() for Phone/Address/Email/Witness
        │       ├── NearestOffice.js        # SSA office finder map
        │       ├── SSAPanel.js             # SSA information panel
        │       ├── MatterPanel.js       # MATTER sidebar (harvestFields → 3 sections, days-since)
        │       └── RawHarvestViewer.js      # Floating window with raw harvestFields() output (Alt+Shift+I)
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
        ├── features/client-note/InfoPanel.js (requires: core/Scraper, Utils, gm-compat)
        └── ui/backup/BackupManager.js
```

---

## Module Responsibilities & Data Shapes

### 1. content.js (Bootstrap)
- **Provides**: Entry point via `manifest.json` content_scripts matches
- **Does**: Waits for `CM_App`, then calls `app.Core.AppObserver.init()` with client ID

### 2. features/client-note/ProviderPanel.js (Updated — June 2026)
- **Provides**: `app.Features.ProviderPanel` – Medical Providers popout window with **compact card layout**, expandable details (Address, Phone, First Visit, Doctors), PCP/Old flags, doctor specialty combobox, inline editing, delete mode, text export, and parsing.
- **Requires**: `core/WindowManager.js`, `core/Utils.js`, `core/Scraper.js`, `gm-compat.js`, `ClientNote.js` (calls `updateAndSaveData`)
- **Extracted from**: `ClientNote.toggleMedWindow()` — was ~300 lines, now self-contained
- **Card Layout**:
  - **Collapsed**: Provider name (**bold**, left), Last/Next dates (right), PCP/Old badge, ✏️ edit button before name, PCP/Old checkboxes row
  - **Hover tooltip**: Shows address snippet + doctor names
  - **Click header** → expand details: Address, Phone, First Visit, structured Doctors rows (specialty combobox with 18 specialist options + Dr.), Notes textarea
  - **Edit button** (✏️) → toggles inline `contenteditable` on all detail fields + provider name; enables doctor inputs; switches to ✓ when active
  - **Delete mode** (🗑️ title bar) → red × overlay per card; New Provider button grayed out
  - **PCP checkbox** → highlighted card with colored left border (theme accent) + `PCP` badge
  - **Old checkbox** → muted card (lower opacity) + `Old` badge; both = `Old PCP` badge
  - **Theme-aware**: Uses `--sn-primary`, `--sn-bg-lighter`, `--sn-bg-card`, `--sn-border`, `--sn-primary-dark` CSS variables
- **Key Methods**:
  - `toggle()` – Creates or toggles the medical providers popout window
  - `updateMedWindowUI()` – Refreshes textareas from in-memory state
  - `updateUI(data)` – Updates med properties from scraped data
  - `checkStoredData(clientId)` – Toggles `sn-has-data` class on taskbar Med Prov button
  - `destroy(clientId)` – Removes the window and clears properties
  - `parseMedicalProviders(text)` – Pure parser: unstructured text → structured provider array
- **Storage**: `cn_med_table_<clientId>` (card rows with { facility, address, phone, firstVisit, lastVisit, nextVisit, doctors[], isPCP, isOld, cardNotes }), `def_pos_MED` (window position)

### 2b. features/client-note/MatterPanel.js (NEW — June 2026)
- **Provides**: `app.Features.MatterPanel` – MATTER sidebar panel in ClientNote.
- **Data Source**: `app.Core.Scraper.harvestFields()` — consumes raw label→value pairs from the DOM.
- **Requires**: `core/Scraper.js`, `gm-compat.js`
- **Activation**: Spine button "MATTER" in ClientNote sidebar; `Alt+I` keyboard shortcut.
- **Sections** (all collapsible, start expanded):
  1. **Overview** — Paired rows (Intake/Filed, AOD/DLI, PFD/B-DLI, T16/T2). Dates formatted `mm/dd/yy`. T16/T2 values starting with "TDQ" shown in red.
  2. **IA & Recon** — Single rows with days-since calculation. T2/T16 Decision: "Medically Denied - Not Disabled" → red "Med Denied"; "Not Insured" → purple.
  3. **Last Contact** — Auto-saved to GM storage. Shows date + days-since per row.
- **Field Mapping** (`_fieldMap`): Each logical field tries multiple visible label patterns (exact match → fuzzy contains). Maps labels like "Engagement Date", "Date Filed: App", "AOD", "Last CM1 Update", etc.
- **Date Parsing** (`_parseDate`): Handles ISO, MM/DD/YYYY, Mon DD YYYY, DD-Mon-YYYY formats.
- **Days Calculation** (`_daysSince`): Computes elapsed days from parsed date to today; negative values show "in N days".
- **Special Formatting**:
  - `_fmtT2Decision(val)` — "Med Denied" in `#d32f2f` (red), "Not Insured" in `#7b1fa2` (purple), others in `#1565c0` (blue).
  - `_fmtQual(val)` — Values starting with "TDQ" rendered in red.
  - `_fmtDateFull(str)` — Date → `mm/dd/yy` in blue + days-since in gray.
- **Data Storage**: `sn_contact_data_<clientId>` — `{ lastCt, lastCtAtt, lastIsu, lastIsuAtt, _updated }` saved on each scrape.

### 2c. features/client-note/RawHarvestViewer.js (NEW — June 2026)
- **Provides**: `app.Features.RawHarvestViewer` – Floating window showing ALL raw harvested field pairs.
- **Data Source**: `app.Core.Scraper.harvestFields()` — unfiltered, unstuctured.
- **Requires**: `core/Scraper.js`, `core/WindowManager.js`
- **Activation**: `Alt+Shift+I` keyboard shortcut (global, no spine button).
- **Behavior**:
  - Toggles floating window (380px wide, draggable, max 500px tall).
  - Re-scrapes on each open.
  - Displays label→value pairs in a scrollable list with field count summary.
  - Empty values shown as gray italic `(empty)`.
- **Key Methods**:
  - `toggle()` — Creates or toggles the floating window.
  - `_scrapeAndRender(w)` — Runs `harvestFields()` and renders results.

### 3. core/AppObserver.js
- **Provides**:
  - `app.Core.AppObserver` – tracks current client context
  - `app.AppObserver.getClientId()` → returns the 18-character Salesforce Record ID
  - `app.Core.AppObserver.init(clientId)` – triggers all feature modules
- **Requires**: `gm-compat.js`, `core/Utils.js`
- **CM Check Logic** (`_checkCaseManager`):
  - Compares scraped `cmName` against `sn_global_cm1` using **substring match** (`includes`) — "Case Manager: Kant Nguyen" matches "Kant Nguyen"
  - First attempt scrapes immediately; if empty, retries after `CM_RETRY_DELAY` (1500ms)
  - If mismatch: shows red warning banner + flags record via `_flagNonCM`
  - If match: clears any existing non-CM flag via `_clearNonCM`
  - No notification banner — non-CM state is only shown via the orange taskbar indicator
  - Respected `sn_cm_warning_enabled` toggle: when `false`, skips entirely (no flag, no indicator)
  - Other components check `cn_non_cm_<clientId>` (e.g. IRPanel auto-checks Team Assist)
- **Non-CM Record Flagging** (NEW):
  - `_flagNonCM(clientId, scrapedCM)` – Stores `cn_non_cm_<clientId>` = scraped CM name, adds `.sn-non-cm` CSS class to taskbar
  - `_clearNonCM(clientId)` – Deletes `cn_non_cm_<clientId>` key, removes `.sn-non-cm` class
  - `_updateNonCMIndicator(isNonCM)` – Toggles orange "⚠ Not your case" label above taskbar + orange background
  - Indicator auto-resets on client navigation; re-applied after CM check completes
  - Other components can check `GM_getValue('cn_non_cm_' + clientId)` to detect non-CM records

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
| `getCLPhone(clientId)` | Reads `cn_form_data_<clientId>.Phone` (composite string, legacy) | Returns first CL phone number or "No CL number" |
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
- **Provides**: `app.Tools.Dashboard` – Central command interface for searching client records, viewing fax history, managing settings, and performing data maintenance.
- **Requires**: `gm-compat.js` (GM storage + cross-tab listeners), `core/WindowManager.js` (draggable windows), `core/Scraper.js` (harvestFields for fax log), `core/Utils.js` (notifications), `app.Tools.FaxPanel` (PDF preview), `app.Automation.TaskAutomation` (LA creation)
- **Namespace**: `app.Tools.Dashboard`

#### Core Features
- **Client List** (`recent`/`revisit` tabs): Loads `cn_<clientId>` keys, sorts by timestamp. Revisit tab filters by `revisitActive + revisit date`, sorts by due date ascending. Status filter menu with multi-select checkboxes.
- **Search**: Live search by name, status, or phone number. Phone search strips non-digits; supports US country code stripping (`1` prefix).
- **Todo Preview**: Extracts up to 2 tasks from `item.todos` (JSON), rich HTML (`.sn-todo-item`), or legacy plain text (`> / >x ` checklist format).
- **Keyboard Navigation**: ArrowUp/ArrowDown in search input moves `.sn-list-item.focused` class; Enter opens the focused item in a background tab.
- **Cross-tab Sync**: Listens to `sn_dashboard_ui_state`, `sn_dashboard_broadcast`, `sn_fax_log_broadcast`, `sn_pending_auto_las` for real-time updates from other tabs.

#### Fax Log Tab (`'faxlog'`)
- **Unified View**: Renders all entries from `sn_fax_log`, grouped by `clientId + date`, sorted newest first. Each group header is clickable (opens client record).
- **Status Badges**: `awaiting_report` → blue "📤 Awaiting", `pending_la` → orange "⏳ Confirmed", `failed` → red "❌ Failed", `completed` → green "✅ Done".
- **Download/Preview Buttons**: Shows `📥 Faxed PDF + iFax Report` button + `👁` preview button when entry has a receipt (`hasReceipt` or `receiptMerged`). Uses ID-based lookup against `sn_fax_generated_pdfs`.
- **1696 Entries**: Separate download buttons for the stamped 1696 form (`📄 1696 Form`) and the iFax report (`📥 iFax Report`). Preview buttons for each.
- **Entry Actions**:
  - `✓ LA` — Creates Last Activity in Salesforce for the entry (navigates to client page first if needed)
  - `✅` Mark Complete — Sets status to `completed` without creating an LA
  - `🗑` Delete — Click once to arm (300ms timeout), click again to confirm. Moves to trash bin.
- **Trash Bin**: Stores last 10 deleted entries in memory (`_trashBin`). Renders an undo bar above the fax list. Click `↩ Undo` to restore the entry to `sn_fax_log`.
- **Pending LA Banner**: Persistent orange banner (`sn-fax-la-pending-banner`) in top-right corner showing count of pending auto-LAs. Auto-clears stale entries (cross-referenced against fax log). Click banner body → switches to Fax Log tab. Click × → closes banner.

#### Pending LA Auto-Creation
- **`_tryAutoCreatePendingLAs()`**: Runs on Dashboard init, fax log tab render, URL changes, and GM storage changes. Checks if current SF page matches any `sn_pending_auto_las` entry by matter ID. If match found + TaskAutomation available, calls `clickLastActivity()` → `fillSubject()` → `fillComment()` → `clickSaveButton()`. Removes from pending list after success.
- **Guard**: `_isCreatingLA` flag prevents concurrent runs. Respects `_retryCount >= 3` limit. Removes stale entries where fax log shows `completed` status.
- **URL Polling**: `_urlPollInterval` (2-second interval) detects Salesforce page navigations to trigger auto-LA creation.

#### Settings Tab
- **CM & Contact**: Editable `sn_global_cm1`, `sn_global_ext`, `sn_global_email`. Auto-generates email from CM name (`firstNameLastName@kirkendalldwyer.com`) when CM name changes.
- **CM Warning Toggle**: `sn_cm_warning_enabled` checkbox controls non-CM case warning behavior.
- **UI Theme**: Dropdown selects from `app.Core.Themes` keys. Applies via `app.Core.Styles.applyTheme()`.
- **Timezone-based Note Colors**: Toggle `sn_tz_note_color`. Shows preview of `app.Core.NoteThemes.colors` entries.
- **Default Note Color**: Follow UI Theme checkbox. When unchecked, shows theme color swatches for manual selection.
- **Data Management**: Manual backup (`app.Tools.BackupManager.createManualBackup()`), Restore from backup, Auto-backup configuration (folder selection, schedule time/frequency/weekly-day), Backup Now button, Disable button.
- **Google Drive Sync**: Connect/Disconnect buttons, sync frequency (after local backup/daily/weekly), time/weekly-day selectors, auto-sync toggle. Status indicators for connection state and last sync.

#### State Management
- `activeTab` — `'recent'` | `'revisit'` | `'faxlog'`
- `currentView` — `'list'` | `'faxlog'` | `'settings'`
- `selectedStatuses` — `Set(['All'])` for client list filtering
- `_dataCache` — In-memory cache of all `cn_<clientId>` entries
- `_trashBin` — In-memory array of deleted fax log entries (max 10)
- `_isCreatingLA` — Mutex for auto-LA creation
- `_urlPollInterval` — 2-second interval for Salesforce page navigation detection
- `_outsideClickListener` / `_escapeKeydownHandler` — Closes dashboard on outside click or Escape key

#### Key Methods
- `init()` — Attaches GM storage listeners, polls for URL changes, syncs initial UI state
- `toggle()` — Toggles dashboard visibility via `sn_dashboard_ui_state` GM key
- `_buildAndShow()` — Creates the dashboard DOM and renders content
- `render()` — Dispatches to `renderList()` / `renderFaxLog()` / `renderSettings()` based on `currentView`
- `renderList()` — Renders sorted/filtered client list in recent or revisit mode
- `renderSearchResults()` — Filters `_dataCache` by name/status/phone query
- `createRow(container, item)` — Creates a single client row with status, revisit marker, todo preview
- `renderFaxLog()` — Renders full fax log with grouping, download buttons, status badges, and undo bar
- `renderSettings(container)` — Renders full settings panel with all configuration sections
- `_loadData()` — Reads all `cn_*` keys from GM storage into `_dataCache`
- `updateSidebar()` — Highlights the active sidebar tab
- `updateStatusFilterOptions()` — Builds the status filter dropdown menu
- `updateFocus(items, newIndex)` — Manages `.sn-list-item.focused` class for keyboard nav
- `_downloadFaxPdf(dataset)` — Downloads a fax PDF via background service worker or anchor click
- `_previewFaxPdf(dataset)` — Previews a fax PDF in the floating preview panel
- `_doDownload(pdfBase64, filename)` — Shared download helper (background message or anchor click)
- `_deleteFaxEntry(entryId)` — Moves entry to trash bin, removes from fax log
- `_undoDelete(deletedEntry)` — Restores entry from trash bin to fax log
- `_completeFaxEntry(entryId)` — Sets status to `'completed'`
- `_removePendingLA(entryId)` — Removes entry from `sn_pending_auto_las`
- `_tryAutoCreatePendingLAs()` — Auto-creates LAs for matching pending entries on current page
- `_createLAForEntry(entryId)` — Creates a Last Activity for a specific fax log entry
- `_migrateFaxFilename(filename)` — Strips legacy "To Be Faxed/" prefix from filenames
- `_migrateGeneratedPdfsCache()` — One-time migration of old-format filenames in `sn_fax_generated_pdfs`
- `_updatePendingLABanner()` — Shows/hides the persistent orange pending-LA banner
- `_getFaxDestination(entry)` — Derives DDS/FO from entry's `sentTo` or `faxLabel`
- `_getFaxStatusBadge(entry)` — Returns HTML for the status badge
- `_buildFaxDownloadButtons(entry, generatedPdfs)` — Builds download/preview button HTML
- `_renderAutoBackupStatus(container)` — Updates auto-backup indicator and status text
- `_renderGDriveStatus(container)` — Updates GDrive connection indicator and status text

### 10. ui/panels/FaxPanel.js
- **Provides**: `app.Tools.FaxPanel` – PDF Forms panel for generating and faxing SSA forms. Handles UI generation, PDF form filling (via PDFLib), data refresh, and Last Activity logging for fax actions.
- **Requires**: `core/WindowManager.js` (draggable windows), `core/PdfManager.js` (PDF template loading), `core/Scraper.js` (harvestFields), `core/SSADataManager.js` (DDS fax lookup), `core/Utils.js` (notifications), `gm-compat.js` (storage), `app.Tools.Stamp1696` (1696 processing)
- **Activation**: From FeaturePanels router or Dashboard

#### Panel Structure
- **5 Tabs**: Letter 25, Status DDS, Status FO, 1696 Fee Agreement, Medical
- **Auto-refresh**: Each tab click re-reads fresh `cn_form_data_<clientId>` and `harvestFields()` data
- **Header Controls**: Minimize button, `📝 Log` toggle checkbox, `🔄 Refresh` button (rotating animation)

#### Phone Model
- **Separate Keys**: Reads `cellPhone`, `homePhone`, `altPhone` from `cn_form_data_<clientId>`. No composite `Phone` string.
- **`_getPhones(formData, harvested)`**: Returns `{ cellPhone, homePhone, altPhone }`. Falls back to harvested sidebar data for cell phone when formData is empty.
- **`_updatePhoneFields(phones, updateFields)`**: Maps to L25 fields: Primary Number → `cellPhone` (or `homePhone` fallback), Alt/Home → `altPhone`.

#### Tab Details
- **Letter 25**: Name, SSN, Include Phone/Address checkboxes, dynamic header, primary/alt phone fields, address fields, FO/DDS fax toggle button, "Generate PDF" + "Open iFax" buttons.
- **Status DDS**: DDS name, DDS fax number (auto-looked-up via SSADataManager), name, SSN, DOB, last update, CM1, Ext.
- **Status FO**: Name, SSN, DOB, FO fax number (parsed from `formData.FO_Text`).
- **1696**: Name, SSN, DOB, Address, Phone, page selection checkboxes (Cover[disabled], FA+1696, SUP-1, 827, CPAS[disabled/always]), Save Default button, file selector for IP Contract PDF, Process button.
- **Medical**: Name, SSN, DOB, DDS fax, notes.

#### 1696 Processing
- **Page Selection**: Checkboxes for FA+1696 (Pages 1-5), SUP-1 (Page 6), 827 (Page 7), CPAS (Page 8, always included). Checked state saved/restored via `sn_1696_page_defaults`.
- **`_load1696PageDefaults()` / `_save1696PageDefaults(prefs)`**: Global (not per-client) persistence of page selection defaults.
- **Process Flow**: User selects IP Contract PDF → clicks "Process" → `app.Tools.Stamp1696.process(file, clientData, { includePages })` → previews stamped PDF → stores in `sn_fax_generated_pdfs`.
- **Preview Popup**: Floating panel (`sn-pdf-preview`) with iframe, Download button, and minimize/close controls. Uses `_dataUriToBlobUrl()` for blob URL generation.

#### PDF Generation
- **`_generateFaxPdfBase64(url, fillFn, clientId, clientName, faxType, sentTo)`**: Shared method used by all "Generate PDF" buttons and "Open iFax" flow. Fetches PDF template, fills form fields via `fillFn`, flattens form, returns `{ pdfBase64, fileName }`. Stores entry in `sn_fax_generated_pdfs`.
- **PDF Configs**: `letter25`, `statusfo`, `statusdds` — each with URL + `fillFn` that maps DOM field values to PDFLib form fields.
- **Preview**: Generated PDF shown in floating preview panel instead of new tab.

#### iFax Integration ("Open iFax" flow)
1. Stores metadata in GM temp keys: `sn_temp_fax_number`, `sn_temp_fax_client_name`, `sn_temp_fax_label`, `sn_temp_fax_target`, `sn_temp_fax_client_id`, `sn_temp_fax_type`, `sn_temp_fax_log_activity`, `sn_temp_fax_l25_details`
2. Opens `https://ifax.pro/sent/create/` in a new window immediately (non-blocking)
3. Generates PDF in background via `_generateFaxPdfBase64()` and stores in `sn_temp_fax_blob` / `sn_temp_fax_filename`
4. For 1696: Looks up most recent processed PDF from `sn_fax_generated_pdfs`
5. Shows notification: `"⏳ Fax queued — {faxLabel} for {clientName}"`

#### Log Activity
- **Toggle**: 📝 checkbox in header, persisted via `sn_fax_log_activity`.
- **`_buildDraftLA(faxType, sentTo, container)`**: Builds subject + content following the convention:
  - Subject: `"Submitted to SSA"` or `"Submitted to DDS"`
  - Content: `"Faxed {doc type} to {destination}"` — with Letter 25 details (PN/Address) when applicable.
- **`_tryOpenDraftLA(subject, content)`**: Best-effort opens LA panel on current SF page without saving.

#### Filename Convention
- **`_formatClientName(name)`**: Formats as `"LastName FirstName"` (handles suffixes: Jr., Sr., III, etc.)
- **`_buildFaxFileName(clientName, faxType, sentTo, dateStr, withReceipt)`**: Standardized format:
  - Non-1696: `"{Last First} - Faxed {DocType} to {Dest} - {Date}[ + iFax report].pdf"`
  - 1696: `"{Last First} - {DocType} - Faxed {Date}[ + iFax report].pdf"`
- **Doc Types**: `letter25` → "Letter 25", `statusfo`/`statusdds` → "Status Sheet", `1696` → "1696 Fee Agreement", `medical` → "Medical Update"
- **Destinations**: `FO` → "SSA", `DDS` → "DDS"

#### Key Methods
- `create()` — Creates/toggles the FAX panel window with saved position
- `_loadFaxData(bodyContainer, w, refreshOnly)` — Loads or refreshes fax data into panel body
- `_formatFax(num)` — Formats phone/fax as `xxx-xxx-xxxx`
- `_getPhones(formData, harvested)` — Reads separate phone keys (cellPhone, homePhone, altPhone)
- `_updatePhoneFields(phones, updateFields)` — Updates L25 phone fields with proper mapping
- `_createField(lbl, val, hasCheck, extraClass, checkId)` — Creates a labeled field HTML string
- `_renderFaxForm(container, clientId, data, harvested)` — Renders the entire fax form with 5 tabs
- `_attachFaxEvents(container, clientId, data, formData, ddsName, globalCM1, globalExt)` — Binds all click/input/change handlers
- `_getLogActivityState()` — Returns current log toggle state from GM storage
- `_buildDraftLA(faxType, sentTo, container)` — Builds draft LA subject/content
- `_tryOpenDraftLA(subject, content)` — Best-effort opens LA panel without saving
- `_generateFaxPdfBase64(url, fillFn, clientId, clientName, faxType, sentTo)` — Shared PDF generation (fetch, fill, flatten, return base64)
- `_load1696PageDefaults()` / `_save1696PageDefaults(prefs)` — 1696 page selection defaults
- `_getDefaultSentTo(faxType)` — Returns default destination per fax type
- `_formatClientName(name)` — Formats name as "LastName FirstName" for filenames
- `_buildFaxFileName(clientName, faxType, sentTo, dateStr, withReceipt)` — Standardized PDF filenames
- `_pushGeneratedPdf(pdfEntry)` — Stores PDF in `sn_fax_generated_pdfs` (max 50)
- `_dataUriToBlobUrl(dataUri)` — Converts base64 data URI to blob URL
- `_previewPdf(pdfBase64, fileName)` — Shows PDF in floating preview panel

### 12. features/client-note/InfoPanel.js
- **Provides**: `app.Features.InfoPanel` – Main data hub displaying client demographics, contact info, and parents
- **Data Sources**: harvestFields() for SSN, DOB, POB, Parents (sidebar); getSSDFormData() / cn_form_data_ for Phone, Address, Email, Witness, cellPhone/homePhone/altPhone
- **Phone Model**: Reads separate `cellPhone`/`homePhone`/`altPhone` keys from `cn_form_data_`; renders as labeled "Cell:" / "Home:" / "Alt:" with `tel:` links. No composite Phone string parsing.
- **Reads**: `cn_<clientId>` (save state), `cn_form_data_<clientId>` (SSD form data), `app.Core.Scraper.harvestFields()` (live DOM)

### 13. core/WindowManager.js
- **Provides**: `app.Core.Windows` – Window z-index management, draggable, toggle, close utilities

### 14. ui/backup/BackupManager.js
- **Provides**: Backup/restore UI for CM Notes data

---

## Data Storage Keys (GM_setValue/GM_getValue)

| Key | Type | Module | Description |
|-----|------|--------|-------------|
| `cn_<clientId>` | Object | AppObserver | Client basic data (name, ID, etc.) |
| `cn_form_data_<clientId>` | Object | ClientNote / InfoPanel / ProviderPanel | Client form fields (Address, Phone, Email, Witness, prefix, Medical Provider, Assistive Devices, Condition, cellPhone, homePhone, altPhone). POB/Parents come from harvestFields sidebar — not stored here. |
| `cn_med_table_<clientId>` | Array | ProviderPanel | Medical provider cards: [{ facility, address, phone, firstVisit, lastVisit, nextVisit, doctors[{name,type,notes}], isPCP, isOld, cardNotes }] |
| `sn_contact_data_<clientId>` | Object | MatterPanel | Last Contact section data: { lastCt, lastCtAtt, lastIsu, lastIsuAtt, _updated } |
| `cn_non_cm_<clientId>` | string/boolean | AppObserver | Flag set when record's CM ≠ expected CM; stores scraped CM name (or `true`). Cleared when CM matches. |
| `def_pos_MED` | Object | ProviderPanel | { width, height, top, left } for med popout window |
| `sn_med_two_col` | Boolean | ProviderPanel | Whether provider cards are displayed in 2-column grid (default false) |
| `sn_global_cm1` | string | Global | CM1 name (default: "Kant Nguyen") |
| `sn_global_email` | string | Global / Dashboard | CM1 email (auto-generated from sn_global_cm1; used for OBS guard rail, email fallback in iFax receipt headers) |
| `sn_global_ext` | string | Global | CM1 extension (default: "1072") |
| `sn_global_font_size` | number | AutomationPanel | Font size override (9-24, default 12) |

| **AutomationPanel** | | | |
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
| **Dashboard** | | | |
| `sn_dashboard_ui_state` | Object | Dashboard | { isOpen: boolean } — dashboard open/close state for cross-tab sync |
| `sn_cm_warning_enabled` | Boolean | Dashboard | CM warning toggle (default true) |
| `sn_ui_theme` | string | Dashboard | UI theme name (default "Teal") |
| `sn_tz_note_color` | Boolean | Dashboard | Timezone-based note colors toggle (default true) |
| `sn_note_follow_theme` | Boolean | Dashboard | Note color follows UI theme (default true) |
| `sn_note_default_color` | string | Dashboard | Default note color hex (follows theme if sn_note_follow_theme=true) |
| **FaxPanel** | | | |
| `sn_fax_log_activity` | Boolean | FaxPanel | Log Activity toggle state (default true) |
| `sn_1696_page_defaults` | Object | FaxPanel | 1696 page selection defaults: { fa: bool, sup1: bool, p827: bool } |
| `def_pos_FAX` | Object | FaxPanel | { width, height, bottom, left } for fax panel window position |
| `sn_temp_fax_number` | string | FaxPanel | Temporary fax number passed to iFax page |
| `sn_temp_fax_client_name` | string | FaxPanel | Temporary client name passed to iFax page |
| `sn_temp_fax_label` | string | FaxPanel | Temporary fax label passed to iFax page |
| `sn_temp_fax_target` | string | FaxPanel | Temporary fax target ("FO" or "DDS") |
| `sn_temp_fax_client_id` | string | FaxPanel | Temporary client Salesforce ID for iFax page |
| `sn_temp_fax_type` | string | FaxPanel | Temporary fax type key (letter25, statusfo, statusdds, 1696, medical) |
| `sn_temp_fax_log_activity` | Boolean | FaxPanel | Snapshot of log activity state at fax submission time |
| `sn_temp_fax_l25_details` | string | FaxPanel | L25 details for LA content ("PN and Address", "PN", or "Address") |
| `sn_temp_fax_blob` | string | FaxPanel | Temporary PDF base64 blob for auto-upload (set async after window.open) |
| `sn_temp_fax_filename` | string | FaxPanel | Temporary PDF filename for auto-upload |
| `sn_fax_pdf_cache_migrated` | Boolean | Dashboard | Migration flag for old-format PDF filenames in sn_fax_generated_pdfs |
| **FaxPanel / iFaxReceiptObserver (shared)** | | | |
| `sn_fax_log` | Array | Both | Fax history log: [{ clientId, clientName, faxType, faxNumber, fileName, status, receiptContent, emailDate, hasReceipt, receiptMerged, pdfBase64, logActivity, timestamp, ... }] |
| `sn_fax_log_broadcast` | number | Both | Timestamp broadcast for log change detection |
| `sn_fax_generated_pdfs` | Array | Both | Generated PDF cache: [{ pdfBase64, fileName, clientId, clientName, type (fax\|receipt), faxType, hasReceipt, timestamp }] (max 50) |
| `sn_pending_auto_las` | Array | Both | Pending auto-LA entries: [{ entryId, clientId, clientName, faxLabel, subject, content, receiverFax, logActivity, timestamp, _retryCount }] (max 50) |
| `sn_ifax_report_toast` | Object | iFaxReceiptObserver | Toast notification for SF tab: { id, clientId, clientName, faxLabel, status, timestamp } |
| `sn_ifax_observer_trigger_y` | string | iFaxReceiptObserver | 📠 trigger button Y position |
| `sn_ifax_label_dismissed` | number | iFaxReceiptObserver | Timestamp when fax info label was dismissed (24h dismiss) |
| `sn_ifax_auto_mode` | Boolean | iFaxReceiptObserver | Auto-processing mode toggle (default false) |

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

## iFax Auto-Upload Workflow (May 2026)

The FaxPanel and iFaxAutomation modules now support automatic PDF upload to iFax.pro when a file is generated and iFax is opened.

### Log Activity Toggle
- **Location**: FaxPanel header, 📝 Log checkbox next to the title
- **Storage**: `sn_fax_log_activity` (boolean, default `true`)
- **Behavior**: When unchecked, `_logFaxEntry()` and `_createFaxLastActivity()` are skipped — no Last Activity entries are created in Salesforce
- **Persistence**: State is saved to GM storage immediately on toggle

### Blob Storage for Auto-Upload
When a PDF is generated via any "Generate PDF" button (Letter 25, Status FO, Status DDS) or via the 1696 IP Contract processor, the resulting PDF bytes are stored in GM storage as a base64 data URI:

```
FaxPanel.js (setupPdfBtn / 1696 processBtn)
  ↓
GM_setValue('sn_fax_pending_upload', {
    pdfBase64: string,     // data:application/pdf;base64,...
    fileName: string,      // "To Be Faxed/Letter 25 - ClientName - Date.pdf"
    clientId: string,      // Salesforce record ID
    timestamp: number       // Date.now()
})
```

Only the **most recently generated** PDF is stored — each new generation overwrites the previous.

### Auto-Upload Sequence (`iFaxAutomation.js`)
When the user opens `https://ifax.pro/sent/create/` (via an "Open iFax" button), the content script runs:

```
iFaxAutomation.init()
  └─ [500ms delay] → run()
       └─ Injects iFaxinjection.js (Selectize auto-fill for DID, destination, notification)
       └─ [onload + 1000ms] → _checkPendingUpload()
            └─ Checks GM_getValue('sn_fax_pending_upload')
            └─ If blob exists:
                 ├─ fetch(base64) → convert to Blob
                 └─ _automateIfaxUpload(blob)
                      ├─ Step 1: Scrape DOM tokens (csrf, destination, did, notification)
                      ├─ Step 2: POST /sent/upload/ via fetch with FormData
                      │          (X-CSRFToken + X-Requested-With headers)
                      ├─ Step 3: Parse JSON response → get uid
                      └─ Step 4: Native form POST /sent/create/ with hidden <form>
                                 (includes orig_files: `${uid},` — trailing comma required)
                                 → Browser follows 302 redirect to preview page
```

**Key Design Decisions**:
- Step 3 (form submit) uses native `<form>.submit()` instead of `fetch()` because the backend issues a 302 redirect. `fetch()` would follow the redirect with `X-Requested-With: XMLHttpRequest`, causing a 500 error.
- The 1-second delay after injection script load ensures Selectize.js fields are fully populated before scraping.
- On error, the blob is **not** deleted — allowing the user to retry by refreshing the iFax page.
- On success, the form submit triggers a navigation, destroying the content script context (expected).

---

## iFax Receipt Observer (`iFaxReceiptObserver.js`)

Runs as a content script on `https://outlook.cloud.microsoft/mail/*`. Observes the Outlook Web App inbox for iFax confirmation/failure emails, extracts fax metadata, matches against the unified fax log (FIFO), generates a PDF receipt via background page capture, and stores a pending Last Activity log entry.

**Requires**: `gm-compat.js`, `pdf-lib.min.js` (window.PDFLib), `background.js` (CAPTURE_PRINT_PAGE message handler)

### Trigger Button (Two-Zone Design)
- **Main area** "📠" — Click to process the current email immediately. Shows temporary status icons during processing (⏳) and after completion (✅ or ❌).
- **Badge** "≡ N" — Shows count of awaiting_report fax log entries matching today's fax number. Click to open a modal picker listing all matching entries for manual selection.
- **Draggable**: Drag by the outer edges to reposition vertically. Position saved to `sn_ifax_observer_trigger_y`.
- **Right-click** the 📠 button to toggle Auto-mode (⚡ indicator when ON). State persisted in `sn_ifax_auto_mode`.

### Auto-Processing Mode
- **Toggle**: Right-click 📠 button. Visual feedback via result popup (⚡ Auto-mode ON / 📠 Manual mode).
- **Behavior**: When ON, iFax receipt emails are processed automatically as soon as they're detected in the reading pane (no manual click needed). Uses a 1.5s debounce timer to let the email render fully.
- **Dedup**: `_lastAutoProcessedKey` + `_processedSubjects` Set prevent re-processing the same email across auto-mode toggles and tab switches.
- **Initial Scan**: When enabling auto-mode, immediately scans the email list for unread iFax emails — doesn't wait for the next alarm cycle.

### Smart Polling (Background Alarm Driven)
- **No local timer**: The background `chrome.alarms` IS the polling timer. No independent setTimeout chains — avoids Chrome's background tab timer throttling.
- **Phases**:
  - **Fast phase**: 3-minute interval for the first 15 minutes after a new fax entry is logged.
  - **Slow phase**: 5-minute interval for the remaining 15 minutes (up to 30 min total).
  - **Done**: Stops after 30 minutes. Restarts from fast phase on the next new fax entry.
- **Folder Detection** (`isInIFaxFolder()`): Checks if the currently selected folder via `[aria-current="true"]` or `[aria-selected="true"]` tree items contains "ifax". If not in iFax folder + auto-mode off, polling pauses. Shows a floating "⚠️ Not in iFax folder" warning toast (auto-hides after 5s, once per polling cycle).
- **Auto-Check on unread emails** (`autoCheckForIFaxEmails()`): Scans all unread items matching `UNREAD_SELECTOR` with the trigger phrase. Clicks each matching email, waits for body content via `waitForBodyContent(5000)` (progressive setTimeout), confirms trigger phrase, marks as processed with `data-sn-ifax-processed` attribute + `_processedSubjects` Set. Uses `_autoCheckRunning` flag to prevent concurrent scans.

### Processing Flow (`_extractAndProcessImpl`)
```
_extractAndProcessImpl(autoMode)
  ├─ Reads email body → checks for TRIGGER_PHRASE
  ├─ Parses: sender fax / receiver fax, success/failure, date/time
  ├─ FIFO matching (oldest awaiting_report first by receiver fax)
  │   ├─ Match found → uses client name, fax label, filename
  │   ├─ No match + autoMode=true → silently skip (user can pick via ≡ N badge)
  │   └─ No match + autoMode=false → shows fax picker modal (filterable by name/number)
  ├─ FAILURE: Updates fax log entry status to 'failed' → stops
  ├─ SUCCESS:
  │   ├─ Builds print HTML via buildPrintHtml(readingPane) — clean Outlook-style header
  │   ├─ Sends CAPTURE_PRINT_PAGE message to background service worker
  │   ├─ Background opens print-template.html, captures screenshot via captureVisibleTab
  │   ├─ Embeds screenshot PNG into PDF via PDFLib
  │   ├─ 1696: Receipt saved as separate entry (type: 'receipt'), fax PDF preserved
  │   └─ Non-1696: Receipt merged into original fax PDF, filename → "{original} + iFax report.pdf"
  ├─ Updates fax log: status = 'pending_la', stores email headers, receipt data
  ├─ If logActivity enabled + autoMode + client match:
  │   ├─ Creates pending auto-LA entry in sn_pending_auto_las
  │   └─ Avoids duplicates by entryId
  ├─ Broadcasts sn_ifax_report_toast for Dashboard notification
  ├─ Copies email body to clipboard
  └─ markCurrentEmailAsRead() — clicks Outlook "Mark as read" button
```

### Receipt PDF Generation (`generateReceiptPdf`)
- **No longer uses html2canvas** — replaced with background page capture.
- **Flow**:
  1. `buildPrintHtml(readingPane)` — Builds clean HTML from the Outlook reading pane. Renders Outlook-style header (logo, From/Date/To table, subject, horizontal rules) with the email body HTML. Uses `chrome.runtime.getURL('icon/outlook.svg')` for the Outlook logo.
  2. Sends `{ type: 'CAPTURE_PRINT_PAGE', html, title }` to the background service worker.
  3. Background opens `print-template.html` with `?capture=1` (toolbar hidden), sets the HTML content, waits for render, calls `captureVisibleTab`, returns PNG data URL.
  4. PDFLib embeds the PNG into a new PDF page (scaled to fit 600×780 within a 612×792 page).
  5. For non-1696: merges receipt page into the original fax PDF from `sn_fax_generated_pdfs`.
  6. For 1696: saves receipt as a separate `type: 'receipt'` entry.
- **Test button**: "📸 Test PDF" debug button (bottom-right corner) for testing the full capture → PDF flow independently.

### Outlook Email Header Extraction (`extractOutlookHeaders`)
Reads the reading pane DOM to extract From, Sent, To, Subject fields. Enhanced with:
- **Multiple CSS fallback strategies** for each field (Outlook Web's DOM changes frequently).
- **Diagnostic logging**: Dumps all `[aria-label*="To"]` elements and recipient-well candidates to console for debugging.
- **Subject**: `[role="heading"][aria-level="1"]` → `h1[aria-label]` → `[data-content="subject"]` → `.ms-ConversationHeader-title` → `[class*="subject"]`.
- **From**: sender persona name → Persona card primary text → `[aria-label^="From"]` (strips "From, " prefix).
- **To**: recipient well name → `[aria-label^="To "]` → `[data-content="to"]` → fallback to `sn_global_email` → email body scraping.
- **Sent**: `[aria-label^="Sent"]` → `[data-content="sent"]` → `.ms-MessageHeader-sent` → date/sent class selectors.

### Manual Match Modal (`showFaxPickerModal`)
Shown when auto-match fails and user clicks the ≡ N badge. Features:
- **Dark-themed modal** overlay with card (520px, max 80vh)
- **Search filter input** pre-filled with receiver fax digits — filters by client name or fax number (partial digit match)
- **Entry list**: Each entry shows client name, fax label, timestamp (relative time), fax number, status badge. Click selects the entry and returns it.
- **Cancel button** to dismiss.

### Data Storage Keys
| Key | Type | Description |
|-----|------|-------------|
| `sn_fax_log` | Array | Shared fax history log (FaxPanel + iFaxReceiptObserver) |
| `sn_fax_log_broadcast` | number | Broadcast timestamp for cross-tab sync |
| `sn_fax_generated_pdfs` | Array | Cached PDF blobs (fax + receipt), max 50 entries |
| `sn_pending_auto_las` | Array | Pending Last Activity entries for SF tab, max 50 |
| `sn_ifax_report_toast` | Object | One-shot toast notification data |
| `sn_ifax_observer_trigger_y` | string | 📠 trigger button Y position |
| `sn_ifax_label_dismissed` | number | Label dismissal timestamp |
| `sn_ifax_auto_mode` | Boolean | Auto-processing mode toggle (default false) |

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