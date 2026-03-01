# KD CM Notes – Chrome Extension

Chrome Extension (Manifest V3) version of the CM Notes Tampermonkey userscript.

## Install

1. Open **`chrome://extensions/`** in Chrome
2. Enable **Developer mode** (toggle, top-right)
3. Click **Load unpacked**
4. Select: `d:\CM Notes\chrome-extension\`
5. Navigate to any `*.lightning.force.com` or `*.my.site.com` page

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+1` | Toggle Client Note |
| `Alt+2` | FO Contact Form |
| `Alt+3` | DDS Contact Form |
| `Alt+4` | Med Provider Window |
| `Alt+5` | Fax Forms Panel |
| `Alt+6` | IR Tool Panel |
| `Alt+Y` | Toggle Dashboard |
| `Alt+Q` | Info Tab Toggle |
| `Alt+W` | Med Window Toggle |
| `Alt+E` | SSA Tab Toggle |
| `Alt+S` | SSD Form Viewer (on form pages) |
| `Alt+M` | Mail Resolve |
| `` Alt+` `` | SSD Data Fetch |

## Data Migration

To migrate your Tampermonkey data:
1. Open Dashboard (Alt+Y) → Settings → **Export / Backup Data**
2. Install this extension
3. Open Dashboard → Settings → **Import Data** → paste the JSON

## Architecture

```
chrome-extension/
├── manifest.json       # MV3 manifest
├── gm-compat.js        # GM_* → chrome.storage shim
├── background.js       # Service worker (tab opening, commands)
├── content.js          # Entry point (init after cache ready)
└── src/                # All modules (same structure as Tampermonkey)
    ├── config/         # Themes.js, Styles.css
    ├── core/           # AppObserver, Scraper, Utils, etc.
    ├── ui/             # Taskbar, Dashboard, panels/
    └── features/       # automation/, client-note/
```
