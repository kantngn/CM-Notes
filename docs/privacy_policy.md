# Privacy Policy for KD CM Notes

**Last Updated:** March 2, 2026

## Introduction
**KD CM Notes** ("we," "us," or "our") is a Chrome Extension designed to enhance productivity and case management workflows within Salesforce Lightning environments. We are committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use our extension.

## Data Collection and Storage

### 1. Local Data Storage
KD CM Notes operates on a "local-first" basis. All data generated or saved by the extension—including Client Notes, Global Notes, Reminders, To-Do lists, and Settings—is stored locally on your device using your browser's built-in storage capabilities (`chrome.storage.local` and `IndexedDB`).

*   **We do not operate a backend server.**
*   We do not sync your notes or personal data to any cloud server owned or controlled by the extension developers.
*   Your data remains entirely within your browser instance and your organization's Salesforce environment.

### 2. Data Scraping
The extension includes features (such as the "Info Panel," "Matter Panel," and "Medical Provider Window") that read ("scrape") text from the Salesforce page you are currently viewing.
*   **Purpose:** This data is used solely to populate fields within the extension's interface (e.g., auto-filling a form or displaying client details in a note).
*   **Storage:** Scraped data is stored locally in your browser cache to persist the state of your notes. It is not transmitted to third parties.

## External Services and Network Requests

To provide specific functionality, the extension makes read-only requests to the following third-party services:

*   **National Library of Medicine (NLM) API:** Used by the *Medication Manager* feature. When you search for a medication, your search query is sent to the NLM API to retrieve drug information. Please refer to the NLM Privacy Policy for more details.
*   **GitHub (Raw Content):** The extension fetches a static database file (`SSADatabase.json`) from GitHub to provide contact information for Field Offices (FO) and Disability Determination Services (DDS). This is a read-only request; no user data is sent to GitHub.
*   **Unpkg (CDN):** The extension may load utility libraries (such as `pdf-lib` for generating PDF forms) from `unpkg.com`.

## Permissions

The extension requests the following permissions for operation:
*   **`storage` / `unlimitedStorage`:** To save your notes and settings locally.
*   **`activeTab`:** To interact with the Salesforce page you are currently viewing (for scraping data and automating tasks).
*   **`clipboardWrite`:** To allow you to copy generated reports or summaries to your clipboard.
*   **Host Permissions (`*.lightning.force.com`, `*.my.site.com`):** To inject the extension's interface into your Salesforce environment.

## Data Sharing and Disclosure
We do not sell, trade, or otherwise transfer your personally identifiable information to outside parties. Since we do not collect or store your data on our servers, we have no data to share.

## User Control
You retain full control over your data:
*   **Backup & Restore:** You can manually export your data to a JSON file using the "Backup" feature in the Dashboard. You are responsible for the security of these exported files.
*   **Deletion:** You can clear all extension data by removing the extension from Chrome or clearing your browser's "Local Storage" and "Hosted App Data."

## Changes to This Policy
We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page or within the extension's release notes.

## Contact Us
If you have any questions about this Privacy Policy, please contact the developer:

**Kant Nguyen**
[Insert Contact Email Here]