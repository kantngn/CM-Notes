// ==UserScript==
// @name         CM Notes Loader
// @namespace    http://tampermonkey.net/
// @version      1.1.7 beta branch - CL Note UI Improvements
// @description  Modular loader for CM Notes
// @author       Kant Nguyen (Refactored by Gemini)
// @match        https://*.lightning.force.com/*
// @match        https://*.my.site.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @grant        GM_listValues
// @grant        GM_setClipboard
// @grant        GM_deleteValue
// @grant        GM_openInTab
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_xmlhttpRequest
// @resource     STYLES file:///d:/CM%20Notes/src/config/Styles.css
// @require      https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js
// @require      file:///d:/CM%20Notes/src/config/Themes.js
// @require      file:///d:/CM%20Notes/src/core/Utils.js
// @require      file:///d:/CM%20Notes/src/core/Scraper.js
// @require      file:///d:/CM%20Notes/src/core/SSADataManager.js
// @require      file:///d:/CM%20Notes/src/core/PdfManager.js
// @require      file:///d:/CM%20Notes/src/core/WindowManager.js
// @require      file:///d:/CM%20Notes/src/core/AppObserver.js
// @require      file:///d:/CM%20Notes/src/ui/Taskbar.js
// @require      file:///d:/CM%20Notes/src/ui/Dashboard.js
// @require      file:///d:/CM%20Notes/src/ui/panels/ContactForms.js
// @require      file:///d:/CM%20Notes/src/ui/panels/SSDFormViewer.js
// @require      file:///d:/CM%20Notes/src/ui/panels/FeaturePanels.js
// @require      file:///d:/CM%20Notes/src/features/automation/MailResolve.js
// @require      file:///d:/CM%20Notes/src/features/automation/TaskAutomation.js
// @require      file:///d:/CM%20Notes/src/features/client-note/InfoPanel.js
// @require      file:///d:/CM%20Notes/src/features/client-note/SSAPanel.js
// @require      file:///d:/CM%20Notes/src/features/client-note/MatterPanel.js
// @require      file:///d:/CM%20Notes/src/features/client-note/ClientNote.js
// ==/UserScript==

// window.CM_App already populated via @require global declarations

// Initializer
(function () {
    'use strict';
    if (window.self !== window.top) return;  // Exit early if running inside any iframe

    // Inject CSS styles from @resource
    GM_addStyle(GM_getResourceText('STYLES'));

    // Use a timeout to ensure all @require scripts have loaded and populated the namespace
    setTimeout(() => {
        if (window.CM_App && window.CM_App.AppObserver) {
            window.CM_App.AppObserver.init();
        } else {
            console.error("CM_App or its modules not found. Check script loading order and @require URLs.");
        }
    }, 0);
})();
