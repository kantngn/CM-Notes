// Function & Dependency Manifest
// This file provides a summary of each module, including:
// - Namespace/Export: How functions are accessed (e.g., window.KD_App.Core).
// - Function Signatures: A list of all functions, their parameters, and return types.
// - Internal Dependencies: Which functions in this file call functions from other files?
// - State Hooks: Which GM_getValue/setValue keys does this file interact with?

// ==========================================
// 1. Core.js
// ==========================================
const CoreManifest = {
    namespace: 'window.CM_App.Core',
    functions: [
        {
            name: 'Styles.init',
            signature: '() => void',
            description: 'Initializes CSS styles using GM_addStyle.',
            internalDependencies: [],
            stateHooks: [],
        },
        {
            name: 'Scraper.getHeaderData',
            signature: '() => object',
            description: 'Scrapes header data from the document.',
            internalDependencies: [],
            stateHooks: [],
        },
        {
            name: 'Scraper.getSidebarData',
            signature: '() => object',
            description: 'Scrapes sidebar data from the document.',
            internalDependencies: [],
            stateHooks: [],
        },
         {
            name: 'Scraper.getSSDFormData',
            signature: '() => object',
            description: 'Scrapes all relevant data from the SSD App form.',
            internalDependencies: [],
            stateHooks: [],
        },
        {
            name: 'Scraper.getFullSSDData',
            signature: '() => object',
            description: 'Combines data from both tabs within the SSD App form, activating the medical tab.',
            internalDependencies: [],
            stateHooks: [],
        },
        {
            name: 'Windows.bringToFront',
            signature: '(el: HTMLElement) => void',
            description: 'Brings a window element to the front by adjusting its z-index.',
            internalDependencies: [],
            stateHooks: [],
        },
        {
            name: 'Windows.toggle',
            signature: '(id: string) => boolean',
            description: 'Toggles the display of a window element by its ID.',
            internalDependencies: [],
            stateHooks: [],
        },
        {
            name: 'Windows.updateTabState',
            signature: '(id: string) => void',
            description: 'Updates the visual state of a taskbar button based on the window\'s display status.',
            internalDependencies: [],
            stateHooks: [],
        },
        {
            name: 'Windows.setup',
            signature: '(w: HTMLElement, minBtn: HTMLElement, header: HTMLElement, typeId: string) => void',
            description: 'Sets up window dragging, resizing, and minimizing behavior.',
            internalDependencies: [],
            stateHooks: ['def_pos_*'],
        },
        {
            name: 'Windows.makeDraggable',
            signature: '(el: HTMLElement, header: HTMLElement) => void',
            description: 'Makes a window draggable using specified header.',
            internalDependencies: [],
            stateHooks: [],
        },
        {
            name: 'Windows.makeResizable',
            signature: '(el: HTMLElement) => void',
            description: 'Attaches resizers to a window element, enabling resizing.',
            internalDependencies: [],
            stateHooks: [],
        },
        {
            name: 'SSADataManager.fetch',
            signature: '(cb: function) => void',
            description: 'Fetches SSA data from an external JSON file.',
            internalDependencies: [],
            stateHooks: [],
        },
        {
            name: 'SSADataManager.search',
            signature: '(type: string, state: string, cb: function) => void',
            description: 'Searches SSA data based on type and state.',
            internalDependencies: [],
            stateHooks: [],
        },
    ]
    // stateHooks: [], // GM_getValue/setValue keys
    // internalDependencies: [] // calls to other functions *within other files*
};

// ==========================================
// 2. Automation.js
// ==========================================
const AutomationManifest = {
    namespace: 'window.CM_App.Automation',
    functions: [
        {
            name: 'MailResolve.init',
            signature: '() => void',
            description: 'Initializes the Mail Resolve module by creating or removing the resolve button based on the current URL.',
            internalDependencies: [],
            stateHooks: [],
        },
        {
            name: 'MailResolve.createButton',
            signature: '() => void',
            description: 'Creates the resolve button and appends it to the document body.',
            internalDependencies: [],
            stateHooks: [],
        },
        {
            name: 'MailResolve.removeButton',
            signature: '() => void',
            description: 'Removes the resolve button from the document body.',
            internalDependencies: [],
            stateHooks: [],
        },
        {
            name: 'MailResolve.run',
            signature: '() => Promise<void>',
            description: 'Executes the mail resolving logic.',
            internalDependencies: [],
            stateHooks: [],
        },
         {
            name: 'TaskAutomation.runNCL',
            signature: '(clientId: string) => Promise<void>',
            description: 'Automates tasks related to Non-Contact Letters (NCL).',
            internalDependencies: [],
            stateHooks: [],
        },
        {
            name: 'TaskAutomation.runEmail',
            signature: '(clientId: string) => Promise<void>',
            description: 'Automates tasks related to email processing.',
            internalDependencies: [],
            stateHooks: [],
        },
    ]
};

// ==========================================
// 3. Tools.js
// ==========================================
const ToolsManifest = {
    namespace: 'window.CM_App.Tools',
    functions: [
        {
            name: 'ContactForms.create',
            signature: '(type: string) => void',
            description: 'Creates a contact form window based on the specified type (FO or DDS).',
            internalDependencies: ['window.CM_App.Core.Windows.toggle', 'window.CM_App.Core.Windows.setup', 'window.CM_App.Core.Scraper.getSidebarData'],
            stateHooks: ['def_pos_FO', 'def_pos_DDS'],
        },
        {
            name: 'SSDFormViewer.toggle',
            signature: '() => Promise<void>',
            description: 'Toggles the SSD Form Viewer window, scraping and displaying SSD form data.',
            internalDependencies: ['window.CM_App.Core.Windows.toggle', 'window.CM_App.Core.Scraper.getFullSSDData', 'window.CM_App.Features.ClientNote.updateAndSaveData'],
            stateHooks: [],
        },
        {
            name: 'SSDFormViewer.renderContent',
            signature: '(w: HTMLElement, data: object) => void',
            description: 'Renders the scraped SSD form data within the SSD Form Viewer window.',
            internalDependencies: [],
            stateHooks: [],
        },
        {
            name: 'Dashboard.toggle',
            signature: '() => void',
            description: 'Toggles the Dashboard window, loading and displaying client note data.',
            internalDependencies: ['window.CM_App.Core.Windows.toggle', 'window.CM_App.Core.Windows.makeDraggable'],
            stateHooks: ['def_pos_CN', 'def_pos_FO', 'def_pos_DDS'],
        },
        {
            name: 'Dashboard.updateSidebar',
            signature: '() => void',
            description: 'Updates the active state of tabs in the Dashboard sidebar.',
            internalDependencies: [],
            stateHooks: [],
        },
        {
            name: 'Dashboard.renderList',
            signature: '() => void',
            description: 'Renders the list of client notes in the Dashboard.',
            internalDependencies: [],
            stateHooks: [],
        },
        {
            name: 'Dashboard.renderSearchResults',
            signature: '() => void',
            description: 'Renders search results in the Dashboard based on the search query.',
            internalDependencies: [],
            stateHooks: [],
        },
        {
            name: 'Dashboard.createRow',
            signature: '(container: HTMLElement, item: object) => void',
            description: 'Creates a row in the Dashboard list for a given client note item.',
            internalDependencies: [],
            stateHooks: [],
        },
    ]
};

// ==========================================
// 4. ClientNote.js
// ==========================================
const ClientNoteManifest = {
    namespace: 'window.CM_App.Features.ClientNote',
    functions: [
        {
            name: 'ClientNote.create',
            signature: '(clientId: string) => void',
            description: 'Creates the Client Note window and initializes its UI and event listeners.',
            internalDependencies: ['window.CM_App.Core.Windows.toggle', 'window.CM_App.Core.Windows.setup', 'window.CM_App.Core.Scraper.getSidebarData', 'window.CM_App.Automation.TaskAutomation.runNCL'],
            stateHooks: ['cn_*', 'cn_color_*', 'cn_font_*', 'def_pos_CN', 'sn_global_cm1', 'sn_global_ext', 'cn_form_data_*'],
        },
        {
            name: 'ClientNote.updateAndSaveData',
            signature: '(clientId: string, newData: object) => void',
            description: 'Updates and saves client note data to GM_setValue, triggering a UI update.',
            internalDependencies: [],
            stateHooks: ['cn_form_data_*'],
        },
        {
            name: 'ClientNote.startClock',
            signature: '(tzKey: string) => void',
            description: 'Starts a clock within the Client Note window displaying the current time in the specified timezone.',
            internalDependencies: [],
            stateHooks: [],
        },
        {
            name: 'ClientNote.updateUI',
            signature: '(data: object) => void',
            description: 'Updates the Client Note UI with the provided data.',
            internalDependencies: [],
            stateHooks: [],
        },
        {
            name: 'ClientNote.checkStoredData',
            signature: '(clientId: string) => void',
            description: 'Checks for stored data related to the client and updates the taskbar button state.',
            internalDependencies: [],
            stateHooks: ['cn_*', 'cn_form_data_*'],
        },
        {
            name: 'ClientNote.destroy',
            signature: '(clientId: string) => void',
            description: 'Removes the Client Note window and associated event listeners, cleaning up resources.',
            internalDependencies: ['window.CM_App.Core.Windows.updateTabState'],
            stateHooks: ['cn_*', 'cn_form_data_*'],
        },
        {
            name: 'ClientNote.toggleMedWindow',
            signature: '() => void',
            description: 'Toggles the Medical Providers window, creating it if it does not exist.',
            internalDependencies: ['window.CM_App.Core.Windows.toggle', 'window.CM_App.Core.Windows.bringToFront', 'window.CM_App.Core.Windows.setup', 'window.CM_App.Core.Scraper.getSidebarData', 'window.CM_App.Core.Scraper.getHeaderData'],
            stateHooks: [],
        },
    ]
};

// MainManifest will be added after Main.js is provided

// MainManifest will be added after Main.js is provided