(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Tools = app.Tools || {};

    /**
     * Entry-point router for supplementary feature panels.
     * Delegates to the appropriate sub-module:
     *   - 'FAX' → app.Tools.FaxPanel
     *   - 'IR'  → app.Tools.IRPanel
     *
     * @namespace app.Tools.FeaturePanels
     */
    const FeaturePanels = {
        /**
         * Creates or toggles the requested feature panel.
         * @param {'FAX'|'IR'} type - Panel type identifier
         */
        create(type) {
            if (type === 'FAX') {
                if (app.Tools.FaxPanel) {
                    app.Tools.FaxPanel.create();
                } else {
                    app.Core.Utils.showNotification("FaxPanel module not loaded.", { type: 'error' });
                }
            } else if (type === 'IR') {
                if (app.Tools.IRPanel) {
                    app.Tools.IRPanel.create();
                } else {
                    app.Core.Utils.showNotification("IRPanel module not loaded.", { type: 'error' });
                }
            }
        }
    };

    app.Tools.FeaturePanels = FeaturePanels;
})();
