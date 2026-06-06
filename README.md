# KD CM Notes: Instruction Guide

**Welcome to KD CM Notes.** This tool is designed to streamline the workflow for CMs at KD. While Salesforce (SF) is a powerful platform, its expansive UI can lead to repetitive, mundane tasks that slow you down. **KD CM Notes bridges this gap**, helping you bypass UI friction and focus on what matters most: your clients.

---

## 🏛️ Core Functionality
The pillars that power your daily workflow.

1.  **Client Notes:** Central hub for tracking your claim's journey. Grasp every situation at a glance and know what is pending next.
2.  **Fax Forms:** Generate pre-filled PDF forms (Letter 25, Status to FO/DDS, 1696 Fee Agreements) in seconds.
3.  **Data Parsing:** Auto-extract medical provider details, IR report data, and case fields into structured tables.
4.  **Workflow Automation:** FTR Logger, NC Letters, Email, SMS, and macro-based form automation.
5.  **Call Recording:** OBS Studio integration with auto-track — start/pause/resume/stop recordings on Communicator call events, with auto-generated filenames and client phone matching.
6.  **Scheduler:** Integrated calendar tracking holidays, client revisits, and custom reminders.

---

## 📝 Client Note Workspace (`Alt + 1`)
- **Information Panel (`Alt + Q`):** View SSN, DOB, contact info, parents. Click **Fetch** (`Alt + E`) to sync from SSD Apps.
- **SSA Contact Panel (`Alt + W`):** Find Field Offices (FO) and DDS branches. Powered by a **community-contributed database** hosted on GitHub — contact info, phone numbers, and fax numbers for every FO and DDS office, with inline editing and push-to-master sync for authorized users. Use **Map View** (📍) to find offices with shorter wait times. Geocoding via **OpenStreetMap Nominatim API**; distance calculated using the **Haversine formula** (great-circle distance in miles).
- **DDS Panel (`Alt + D`):** Dedicated DDS office search within the sidebar, with notes field per client.
- **DDS Editor (`Alt + Shift + D`):** Standalone panel for viewing and editing ALL DDS entries across the master database, with direct push-to-GitHub for admins.
- **Matter Panel:** Read-only overview of filing dates, claim statuses (Initial/Recon), and PTR alerts.
- **CASE DATA Sidebar (`Alt + I`):** Scraped case data for at-a-glance overview — IA & Recon decisions with days-since calculations, and a persistent Last Contact log.
- **Dynamic Formatting:** Highlight text to access the formatting toolbar. 
- **Follow-ups (📅):** Set revisit dates via the **Revisit** button; you'll be reminded automatically on that date.

---

## 🏥 Medical Provider Panel  & Medication Panels
### Medical Provider (`Alt + 2`) — Compact Card Layout
- **Card View:** Each provider shown as a compact card — **bold name** (left), Last/Next dates (right), PCP/Old badges.
- **Expandable Details:** Click a card header to reveal Address, Phone, First Visit, structured Doctors rows (specialty combobox with 18 specialist options), and Notes.
- **PCP / Old Flags:** Checkboxes per card — PCP highlights with colored border; Old mutes the card. Both = "Old PCP" badge.
- **Inline Editing (✏️):** Toggle edit mode to edit provider name and all detail fields directly.
- **Delete Mode (🗑️):** Enables red × overlay per card; New Provider button grayed out.
- **Parsing & Export:** Data auto-parsed from SSD Apps; click **Raw** to toggle source view. Supports text export.
- **2-Column Grid:** Optional layout toggle.

### Medication Manager (`Alt + 3`)
- **Predictive Search:** Find drug names by typing the first few characters — powered by the **NIH RxTerms API** (`clinicaltables.nlm.nih.gov`).
- **Organization:** Categorize by prescription, condition, or supplements. Drag-and-drop to reorder.

---

## 🦾 Automations & Tools

### Automation Tool (🤖) — FTR & MANUAL Tabs
- **FTR Logger:** Select CL/WN outreach results, add custom text, choose direction/target, and preview the formatted comment. Review in Salesforce before confirming. Optionally trigger NCL, Email, and SMS after save.
- **MANUAL Tab:** NCL step-by-step with exploded view, Email composer (new + template library with drag-drop ordering, RTE toolbar), SMS templates, and Mr./Mrs. prefix selectors.
- **Template Editor:** Full CRUD with drag-drop reorder, rich text toolbar (bold, italic, lists, link), and placeholder reference (`{{clientName}}`, `{{cmName}}`, `{{cmExt}}`, `{{cmPhone}}`).
- **Font Size:** Adjustable 9–24px globally.
- **Hold-to-Save:** Hold the close button (0.4s) or trigger label (0.5s) to persist panel position / trigger states.

### Macro Recorder (`Alt + M`)
- **Recording Mode:** Captures clicks, combobox selections, removes, and field clears in Salesforce Lightning forms.
- **Smart Step Merging:** Auto-pairs combobox clicks with option selection.
- **Playback:** Scored multi-attribute matching — finds the best-matching element even when labels are duplicated across the page.
- **Named Macros:** Save macros with URL patterns for auto-suggest.

### Mail Resolver (`Alt + A`)
Open a mail log needing resolution and press `Alt + A` to automate the process instantly.

### Batch Resolve
Generic batch processing for Salesforce lightning-datatable pages — multi-condition filtering, configurable concurrency (1–5), and inter-window communication via background script.

### Fax Forms (`Alt + 4`)
Preparation area for outgoing PDFs. Review and edit fields before exporting. Supports auto-upload to iFax.pro — the most recently generated PDF is stored and auto-uploaded when iFax is opened.

### IR Tool (`Alt + 5`)
Specialized report parser that extracts facility names and addresses directly from the page.

### 1696 Fee Agreement (`Alt + 6`)
PDF stamping tool for SSA-1696 Fee Agreement forms.

### OBS Recorder (🎬 Trigger)
OBS Studio recording controller with companion app integration for Communicator calls. Auto-detects call direction (From/To), matches client phone numbers, generates filenames (`{Date} - {Client} - Call {Direction} {Type}`), and supports auto-track (start/pause/resume/stop on call events).

### iFax Receipt Observer (📠 Trigger)
Runs on Outlook Web (cloud.microsoft). Auto-processes iFax confirmation/failure emails:
- Parses sender/receiver fax numbers, success/failure status, date/time
- Matches against the unified fax log by receiver fax
- Generates PDF receipts (merged with original fax PDF, or standalone for 1696 forms)
- Creates pending Last Activity entries for Salesforce
- Background alarm (2 min) ensures processing even in background tabs

---

## 🌐 Workspace Features
- **Interactive Taskbar:** Sticky bottom bar showing active panels, daily "Matters touched" counters, and a ⚠ orange indicator when viewing a non-CM record.
- **Non-CM Flagging:** Automatically detects when the current record belongs to another CM — shows an orange warning label above the taskbar.
- **Dynamic Theming:** Note colors shift based on the client's local timezone.
- **Dashboard (`Alt + T` / 📝):** Search saved notes, configure settings (⚙️), manage backups, and view iFax toast notifications.
- **Global Note (`Alt + ~`):** Multi-tabbed sidebar for persistent data like Attorney IDs or EINs.
- **Backup Manager:** Backup & restore all CM Notes data via the File System Access API.
- **Raw Harvest Viewer (`Alt + Shift + I`):** Floating window showing every raw label→value pair harvested from the page — useful for debugging.
- **Instructions (`Alt + H`):** This guide, accessible from the Global Notes sidebar.

---

## ⌨️ Keyboard Shortcut Reference

| Shortcut | Action |
| :--- | :--- |
| **`Alt + 1`** | Toggle Client Note Window |
| **`Alt + 2`** | Toggle Medical Provider Window |
| **`Alt + 3`** | Toggle Medication Manager |
| **`Alt + 4`** | Toggle Fax Forms Panel |
| **`Alt + 5`** | Toggle IR Tool Panel |
| **`Alt + 6`** | Toggle 1696 Fee Agreement Panel |
| **`Alt + Q`** | Toggle Info Panel (inside Client Note) |
| **`Alt + W`** | Toggle SSA Panel (inside Client Note) |
| **`Alt + A`** | Run Mail Resolver Automation |
| **`Alt + S`** | Toggle SSD Form Viewer (on form pages only) |
| **`Alt + D`** | Toggle DDS Panel (inside Client Note) |
| **`Alt + Shift + D`** | Toggle DDS Editor (standalone) |
| **`Alt + E`** | Fetch SSD Data |
| **`Alt + F`** | Toggle FTR Logger Panel |
| **`Alt + I`** | Toggle CASE DATA Sidebar (ScrapeInspector) |
| **`Alt + Shift + A`** | Toggle Raw Harvest Viewer |
| **`Alt + M`** | Toggle Macro Recorder |

| **`Alt + ~`** | Toggle Global Notes Panel |
| **`Alt + L`** | Toggle Scheduler / Calendar |
| **`Alt + T`** | Toggle Dashboard |
| **`Alt + H`** | Show Help / Instructions Panel |

---
