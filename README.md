# KD CM Notes – Chrome Extension

This is a comprehensive Chrome Extension (Manifest V3) designed to enhance productivity and case management workflows within Salesforce Lightning environments. It provides a suite of integrated tools, including advanced note-taking, data scraping, automation, and workflow management panels.

## Install

1. Open **`chrome://extensions/`** in Chrome
2. Enable **Developer mode** (toggle, top-right)
3. Click **Load unpacked**
4. Select the `d:\CM Notes\chrome-extension\` directory
5. Navigate to any `*.lightning.force.com` or `*.my.site.com` page

## Core Features

### Client Note Window
The central hub for case-specific information. It automatically loads when a client record is viewed.

*   **Rich Text Editing**: A floating toolbar appears when you select text, allowing for bold, italics, underline, color changes, and bullet points.
*   **To-Do Lists**: Create checklist items directly within your notes.
*   **Dynamic Theming**: The note's color automatically changes based on the client's timezone, providing an at-a-glance indicator of their local time. This can be customized or disabled in the Dashboard settings.
*   **Pinning**: Pin the note window to keep it open even when navigating away from the client's page.
*   **Side Panels**:
    *   **Info Panel**: Displays key client data like SSN, DOB, and contact information. Features a powerful **Fetch Data** button that can open a background tab to scrape and import comprehensive client details automatically.
    *   **SSA Panel**: Search for Field Office (FO) and DDS office contact information directly from an integrated database. It provides quick actions, such as opening a fax form for specific states.
    *   **Matter Panel**: Shows read-only scraped data from the page, including important dates, PTR status, and CM1/ISU statuses.

### Medical Provider Window
A powerful two-panel interface for managing detailed medical information.

*   **Raw Text & Parsed Table**: Paste raw medical provider text into one panel and use the "Parse" button to automatically extract and populate a structured table.
*   **Editable Table**: Manually edit or add provider names, addresses, phone numbers, and visit dates.
*   **Conditions & Devices**: Includes dedicated text areas for tracking medical conditions and assistive devices.
*   **Expandable View**: Can be expanded for a larger, more focused view of medical data.

### Medication Manager
A dedicated window for tracking a client's medications.

*   **Drug Search**: Search for medications using the National Library of Medicine (NLM) API.
*   **Categorization**: Group medications into custom categories (e.g., "Prescribed by Dr. Smith," "For Back Pain").
*   **Drag & Drop**: Easily re-organize medications between categories.
*   **Details**: Add dosage, frequency, and other details for each medication.

### Dashboard
The main control center for the extension, accessible from the taskbar.

*   **Client Search**: Quickly search through all clients with saved notes.
*   **Revisit & Recent Lists**: View lists of clients flagged for a revisit or those recently accessed.
*   **Settings**: Configure UI themes, note color preferences, and default CM information.
*   **Data Management**: Manually create backups of all extension data or restore from a backup file.

### PDF & Automation Tools

*   **Fax Forms Panel**: Generate pre-filled PDF documents for common tasks, such as "Letter 25," "Status to DDS," and "Status to FO."
*   **IR Tool**: Select an "Initial Review" report on the page to generate a concise, copy-paste-ready summary of the case status, medical evidence requests, and CE appointments.
*   **NCL Task Automation**: A button within the Client Note (`NCL`) automates the process of creating a "Rose Letter 01" task and a follow-up email.

### Global UI

*   **Taskbar**: A persistent bar at the bottom of the screen showing which windows are open, data-saved status, and counters for daily activity.
*   **Global Notes & Scheduler**: A slide-out panel on the left for persistent, cross-client notes and a calendar-based reminder system.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `` Alt+` `` | Toggle Global Notes Panel |
| `Alt+1` | Toggle Client Note Window |
| `Alt+2` | Toggle Medical Provider Window |
| `Alt+3` | Toggle Medication Manager |
| `Alt+4` | Toggle Fax Forms Panel |
| `Alt+5` | Toggle IR Tool Panel |
| `Alt+Q` | Toggle Info Panel (within Client Note) |
| `Alt+W` | Toggle SSA Panel (within Client Note) |
| `Alt+E` or `Alt+F` | Fetch SSD Data (from Client Note Info Panel) |
| `Alt+A` | Run Mail Resolver Automation |
| `Alt+S` | Toggle SSD Form Viewer (on form pages) |
| `Alt+L` | Toggle Scheduler Panel |
| `Alt+T` | Toggle Dashboard |
| `Alt+H` | Show Help/Instructions Panel |
 → Settings → **Restore from Backup** → select the JSON file

