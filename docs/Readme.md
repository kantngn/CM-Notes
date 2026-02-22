# CM Notes

## Overview
CM Notes is a comprehensive Tampermonkey userscript designed to streamline case management in Salesforce. It features a modular architecture with a persistent sticky note interface, automated data scraping, and productivity tools.

## Features

### 📝 Client Note (Sticky Note)
*   **Persistent Storage:** Notes are saved automatically per client (via `GM_setValue`).
*   **Auto-Scraping:** Automatically pulls Client Name, SSN, DOB, and Address from the Salesforce record.
*   **Timezone Detection:** Auto-detects client timezone based on State/City. Even split timezone cities. 
*   **Medical Popout:** Dedicated window for tracking medical providers and conditions.
*   **Cross-Tab Sync:** Updates reflect immediately across open tabs.

### 🛠️ Tools & Forms
*   **Contact Forms:** Allow searching **FO** (Field Office) and **DDS** contacts with searchbox. 
*   **SSD App Form Scraper:** Scrape SSD App Form page (Client info & medical data).
*   **Dashboard:** A searchable list of all recent client notes and "Revisit" reminders.
*   **IR Report Recap:** Tool to capture and summarize IR Report text from the page (dates, claim levels, medical evidence).

### 🤖 Automation
*   **Mail Log Resolve:** One-click button to resolve mail logs (Alt+M).
*   **NCL Tasks:** Automated task creation and assignment for Non-Contact Letters.
*   **Email Injection:** Auto-fills email body with client-specific templates.

## Installation

1.  Ensure **Tampermonkey** is installed in your browser.
2.  Create a new script in Tampermonkey.
3.  Copy the contents of `CM-Notes.user.js` (or the bundled distribution file) into the editor.
4.  Save the script.

## Usage / Shortcuts

| Shortcut | Function | Description |
| :--- | :--- | :--- |
| **Alt + 1** | Toggle Note | Open/Close the main Client Note window. |
| **Alt + 2** | FO Form | Open the Field Office contact form. |
| **Alt + 3** | DDS Form | Open the DDS contact form. |
| **Alt + Q** | Med Window | Toggle the Medical Providers pop-out. |
| **Alt + Y** | Dashboard | Open the Case Dashboard. |
| **Alt + R** | SSD Viewer | Open the SSD Form Data viewer (on Form pages). |
| **Alt + M** | Mail Resolve | Auto-resolve the current Mail Log record. |

## Architecture
The project is built on a modular namespace architecture (`CM_App`):
*   `Core.js`: Base utilities (Styles, Scraper, Window Manager).
*   `ClientNote.js`: Main note logic.
*   `Tools.js`: Auxiliary forms and dashboard.
*   `Automation.js`: Macros and task logic.
*   `Main.js`: Entry point and observer.

## Build
To bundle the source files into a single distributable:
1.  Run `node build.js` in the project root.
2.  Output will be generated as `CM-Notes.user.js`.