# CM Notes Architecture Map

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
        ├── features/automation/AutomationPanel.js
        │     └── features/automation/TaskAutomation.js
        │           └── requires: gm-compat, core/Utils (delegated)
        ├── features/automation/ObsRecorder.js
        ├── ui/Dashboard.js
        ├── ui/InfoPanel.js
        ├── core/WindowManager.js
        └── ui/backup/BackupManager.js (pattern panel)
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
- **Provides**: `app.Automation.AutomationPanel` – Floating UI panel with tabs
- **Tabs**: `NCL`, `EMAIL`, `SMS`, `FTR`
  - Each tab renders content via `renderTabContent(clientId)` and binds events via `bindEvents(w, clientId)`
  - Tab switching triggers `render()` which rebuilds the panel content
- **States**:
  - `activeTab` – tracks which tab is currently shown
  - `nclExploded` – whether NCL manual steps are expanded
- **Key methods**:
  - `init()` – Creates the floating trigger button
  - `create()` – Builds the panel window
  - `render(w, clientId)` – Injects HTML and calls `bindEvents()`
  - `renderTabContent(clientId)` – Returns HTML for the active tab
    - **NCL tab**: Full NCL run button + optional exploded manual steps + **trigger checkbox** to chain after FTR
    - **EMAIL tab**: "New Email" button + template buttons + prefix selectors + **trigger checkbox** to chain after FTR
    - **SMS tab**: SMS template buttons + prefix selectors + **trigger checkbox** to chain after FTR
    - **FTR tab**: FTR result dropdown, custom text, reason, NCL radio, WN dropdown, NCL/SMS/Email trigger checkboxes, live preview, Run/Confirm buttons
  - `bindEvents(w, clientId)` – Attaches click/input handlers for all buttons and FTR controls
  - `renderPrefixSelectors(clientId)` – Mr./Mrs. checkbox row
  - `processPlaceholders(template, clientId)` – Replaces `{{clientName}}`, `{{cmName}}`, etc.
  - `createTemplateEditor()` – Full template manager with rich text editor
- **Data read/writes**:
  - `sn_templates` – Template storage object
  - `sn_templates_email_order` – Array of email template keys (ordered)
  - `sn_templates_sms_order` – Array of SMS template keys (ordered)
  - `cn_form_data_<clientId>.prefix` – Mr./Mrs. prefix selection
  - `sn_auto_trigger_y` – Saved Y position of trigger button
  - `sn_auto_panel_width_<tabName>` – Saved panel width per active tab

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
| `buildFTRComment(clientId, config)` | *Pure function* | Builds formatted FTR comment string: `"FTR CL @ {phone} - {result} {custom} | {reason} | {ncl}"` + optional WN line |
| `runFTR(clientId, config)` | Orchestrator (first phase) | Click Last Activity → fill Subject → fill Comment → store state → return comment |
| `confirmAndSaveFTR()` | Orchestrator (second phase) | Save → if WN: loop WN auto-save → if NCL: runNCL() → sendSMS() → runEmail() |
| `getSignature()` | `a.select` (email from) | Returns HTML signature block with CM contact info |

#### FTR Config Shape
```js
{
  ftrResult: string,        // Full FTR result text (e.g. "Not in services")
  customFtrText?: string,   // Optional text appended after ftrResult
  reason?: string,          // Reason text (hidden if ftrResult contains "LVM")
  nclOption: "NCL" | "No NCL",
  wnResult: string,         // WN result text ("No WN" = explicit no, empty = no WN, other = result)
  triggerNCL: boolean,      // Run NCL automation after FTR save
  triggerSMS: boolean,      // Run SMS automation after FTR save
  triggerEmail: boolean     // Run Email automation after FTR save
}
```

#### FTR Comment Format
```
FTR CL @ <CL phone> - <FTR result> <custom text> | <reason> | Send SMS Email NCL to ask for CL call back  [or " | No NCL"]
Called WN @ <WN phone>, <WN result>                                                 [if WN result selected]
```

### 6. features/automation/ObsRecorder.js
- **Provides**: `app.Automation.ObsRecorder` – Records DOM mutations (for debugging/testing)
- **Requires**: Nothing standalone

### 7. ui/Dashboard.js
- **Provides**: `app.UI.Dashboard` – Main dashboard panel

### 8. ui/InfoPanel.js
- **Provides**: `app.UI.InfoPanel` – Displays scraped form data in a sidebar panel
- **Reads**: `cn_form_data_<clientId>` (Phone, Witness, Email fields used by FTR Logger)

### 9. core/WindowManager.js
- **Provides**: `app.Core.Windows` – Window z-index management, draggable, toggle, close utilities

### 10. ui/backup/BackupManager.js
- **Provides**: Backup/restore UI for CM Notes data

---

## Data Storage Keys (GM_setValue/GM_getValue)

| Key | Type | Description |
|-----|------|-------------|
| `cn_<clientId>` | Object | Client basic data (name, etc.) |
| `cn_form_data_<clientId>` | Object | Client form data (Phone, Witness, Email, prefix) |
| `sn_global_cm1` | string | CM1 name (default: "Kant Nguyen") |
| `sn_global_ext` | string | CM1 extension (default: "1072") |
| `sn_templates` | Object | { email: { key: {name,subject,body} }, sms: { key: {name,body} } } |
| `sn_templates_email_order` | Array | Ordered email template keys |
| `sn_templates_sms_order` | Array | Ordered SMS template keys |
| `sn_auto_trigger_y` | string | Trigger button Y position |
| `sn_auto_panel_width_<tab>` | number | Panel width per active tab |

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