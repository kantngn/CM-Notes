(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Tools = app.Tools || {};

    /**
     * Handles manual and automatic backups of application data to the local file system.
     * Provides a UI for restoring from those backups utilizing the File System Access API.
     * Interacts with Dashboard and Utils.
     * @namespace app.Tools.BackupManager
     */
    const BackupManager = {
        DB_NAME: 'CMNotesBackupDB',
        STORE_NAME: 'handles',
        AUTO_BACKUP_DIR_KEY: 'autoBackupDirHandle',
        AUTO_BACKUP_CONFIG_KEY: 'sn_auto_backup_config',
        GDRIVE_CONFIG_KEY: 'sn_gdrive_config',
        AUTO_BACKUP_CHECK_INTERVAL: 60000, // Check every 60 seconds
        RETENTION_DAYS: 14,
        GDRIVE_FOLDER_NAME: 'CM Notes Backups',
        _db: null,
        _autoBackupTimer: null,
        _configurePromiseResolve: null,

        async _getDb() {
            if (this._db) return this._db;
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this.DB_NAME, 1);
                request.onerror = () => reject("Error opening IndexedDB.");
                request.onsuccess = () => {
                    this._db = request.result;
                    resolve(this._db);
                };
                request.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                        db.createObjectStore(this.STORE_NAME);
                    }
                };
            });
        },

        async _getHandle(key) {
            const db = await this._getDb();
            return new Promise((resolve) => {
                const tx = db.transaction(this.STORE_NAME, 'readonly');
                const store = tx.objectStore(this.STORE_NAME);
                const request = store.get(key);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => resolve(null); // Resolve null on error
            });
        },

        async _setHandle(key, handle) {
            const db = await this._getDb();
            const tx = db.transaction(this.STORE_NAME, 'readwrite');
            const store = tx.objectStore(this.STORE_NAME);
            store.put(handle, key);
            return tx.complete;
        },

        _getBackupData() {
            const data = {};
            GM_listValues().forEach(k => {
                // Exclude sensitive or temporary keys if necessary
                if (!k.startsWith('sn_dashboard_broadcast')) {
                    data[k] = GM_getValue(k);
                }
            });
            return JSON.stringify(data, null, 2);
        },

        /**
         * Retrieves the current auto-backup configuration.
         * @returns {{ enabled: boolean, time: string, weekdayOnly: boolean, retentionDays: number, lastBackupDate: string|null, backupFolderSet: boolean }}
         */
        getConfig() {
            return GM_getValue(this.AUTO_BACKUP_CONFIG_KEY, {
                enabled: false,
                time: '16:45',
                weekdayOnly: true,
                retentionDays: this.RETENTION_DAYS,
                lastBackupDate: null,
                lastBackupTime: null,
                backupFolderSet: false
            });
        },

        _saveConfig(config) {
            GM_setValue(this.AUTO_BACKUP_CONFIG_KEY, config);
        },

        // ── GDrive Config ──────────────────────────────────────

        _getGDriveConfig() {
            return GM_getValue(this.GDRIVE_CONFIG_KEY, {
                connected: false,
                userEmail: null,
                folderId: null,
                syncEnabled: false,
                lastSyncDate: null,
                lastSyncTime: null
            });
        },

        _saveGDriveConfig(config) {
            GM_setValue(this.GDRIVE_CONFIG_KEY, config);
        },

        /**
         * Sends a message to the background service worker and returns a promise.
         * @param {string} type - Message type
         * @param {object} [data] - Additional message data
         * @returns {Promise<object>}
         */
        _sendBackgroundMessage(type, data = {}) {
            return new Promise((resolve, reject) => {
                try {
                    chrome.runtime.sendMessage({ type, ...data }, (response) => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                        } else {
                            resolve(response);
                        }
                    });
                } catch (err) {
                    reject(err);
                }
            });
        },

        /**
         * Returns the human-readable status of the Google Drive connection.
         * @returns {{ connected: boolean, userEmail: string|null, syncEnabled: boolean, lastSync: string|null }}
         */
        getGDriveStatus() {
            const gcfg = this._getGDriveConfig();
            return {
                connected: gcfg.connected,
                userEmail: gcfg.userEmail,
                syncEnabled: gcfg.syncEnabled,
                lastSync: gcfg.lastSyncDate ? `${gcfg.lastSyncDate} at ${gcfg.lastSyncTime || 'unknown'}` : null
            };
        },

        /**
         * Returns a human-readable status string for the Dashboard UI.
         * @returns {{ configured: boolean, enabled: boolean, lastBackup: string|null, folderSet: boolean, isDue: boolean }}
         */
        getStatus() {
            const cfg = this.getConfig();
            const now = new Date();
            const today = this._dateKey(now);
            const isWeekday = now.getDay() >= 1 && now.getDay() <= 5;
            const [targetH, targetM] = cfg.time.split(':').map(Number);
            const currentMinutes = now.getHours() * 60 + now.getMinutes();
            const targetMinutes = targetH * 60 + targetM;
            const isPastTarget = currentMinutes >= targetMinutes;
            const isDue = cfg.enabled && isWeekday && isPastTarget && cfg.lastBackupDate !== today;

            return {
                configured: cfg.backupFolderSet,
                enabled: cfg.enabled,
                lastBackup: cfg.lastBackupDate ? `${cfg.lastBackupDate} at ${cfg.lastBackupTime || 'unknown'}` : null,
                folderSet: cfg.backupFolderSet,
                isDue: isDue
            };
        },

        /**
         * Formats a date into YYYY-MM-DD string.
         */
        _dateKey(date) {
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        },

        /**
         * Triggers the native file save dialog to export all `GM_getValue` data (excluding temporaries) 
         * as a formatted JSON file.
         */
        async createManualBackup() {
            if (!window.showSaveFilePicker) {
                app.Core.Utils.showNotification("Your browser does not support the File System Access API. Please use a modern browser like Chrome or Edge.", { type: 'error' });
                return;
            }
            try {
                const now = new Date();
                const dateStr = this._dateKey(now);
                const suggestedName = `cm_notes_backup_manual_${dateStr}.json`;

                const fileHandle = await window.showSaveFilePicker({
                    suggestedName: suggestedName,
                    types: [{
                        description: 'JSON Files',
                        accept: { 'application/json': ['.json'] },
                    }],
                });

                const writable = await fileHandle.createWritable();
                await writable.write(this._getBackupData());
                await writable.close();
                app.Core.Utils.showNotification("Manual backup created successfully.", { type: 'success' });
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error("Error creating manual backup:", err);
                    app.Core.Utils.showNotification("Failed to create backup.", { type: 'error' });
                }
            }
        },

        /**
         * Prompts the user to select a directory containing previous `.json` backups.
         * Locates valid backups, displays a choice prompt, and performs the data restoration.
         */
        async showRestoreUI() {
            if (!window.showDirectoryPicker) {
                app.Core.Utils.showNotification("Your browser does not support the File System Access API for directories.", { type: 'error' });
                return;
            }
            try {
                const dirHandle = await window.showDirectoryPicker();
                const backups = [];

                for await (const entry of dirHandle.values()) {
                    if (entry.kind === 'file' && entry.name.startsWith('cm_notes_backup_') && entry.name.endsWith('.json')) {
                        const dateMatch = entry.name.match(/(\d{4}-\d{2}-\d{2})/);
                        if (dateMatch) {
                            backups.push({
                                name: entry.name,
                                date: new Date(dateMatch[1]),
                                handle: entry,
                            });
                        }
                    }
                }

                if (backups.length === 0) {
                    app.Core.Utils.showNotification("No valid backup files found in the selected directory.", { type: 'error' });
                    return;
                }

                backups.sort((a, b) => b.date - a.date);

                // For now, using prompt/confirm as a placeholder for a proper UI
                // A real implementation would build a small modal window.
                const latestThree = backups.slice(0, 3);
                const options = latestThree.map((b, i) => `${i + 1}: ${b.name}`).join('\n');
                const choice = prompt(`Please choose a backup to restore:\n\n${options}\n\nEnter a number (1-3):`);

                const index = parseInt(choice) - 1;
                if (isNaN(index) || index < 0 || index >= latestThree.length) {
                    if (choice) app.Core.Utils.showNotification("Invalid selection.", { type: 'error' });
                    return;
                }

                const selectedBackup = latestThree[index];

                if (confirm(`This will overwrite all current notes and settings with the data from:\n\n${selectedBackup.name}\n\nAre you sure you want to proceed?`)) {
                    const file = await selectedBackup.handle.getFile();
                    const content = await file.text();
                    this._performRestore(content);
                }

            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error("Error during restore process:", err);
                    app.Core.Utils.showNotification("Failed to read backup directory.", { type: 'error' });
                }
            }
        },

        _performRestore(jsonContent) {
            try {
                const data = JSON.parse(jsonContent);
                const keys = Object.keys(data);

                // Note: a clean restore could clear existing GM values first:
                // GM_listValues().forEach(key => GM_deleteValue(key));

                keys.forEach(key => {
                    GM_setValue(key, data[key]);
                });

                app.Core.Utils.showNotification(`Restore complete from backup. ${keys.length} records imported. Please reload the page.`, { type: 'success', duration: 8000 });

            } catch (e) {
                console.error("Error parsing or applying backup data:", e);
                app.Core.Utils.showNotification("Restore failed: Invalid backup file format.", { type: 'error' });
            }
        },

        // ── Auto Backup ─────────────────────────────────────────

        /**
         * Initializes the auto-backup polling timer. Called once from AppObserver.init().
         * Only starts if auto-backup is enabled and a backup folder has been selected.
         */
        initAutoBackup() {
            const cfg = this.getConfig();
            if (!cfg.enabled || !cfg.backupFolderSet) {
                // Not configured yet — that's fine, user can enable later via Dashboard
                return;
            }
            this._startAutoBackupTimer();
        },

        _startAutoBackupTimer() {
            if (this._autoBackupTimer) return; // Already running
            this._autoBackupTimer = setInterval(() => {
                this._checkAndRunAutoBackup();
            }, this.AUTO_BACKUP_CHECK_INTERVAL);
            // Also run an immediate check
            this._checkAndRunAutoBackup();
        },

        _stopAutoBackupTimer() {
            if (this._autoBackupTimer) {
                clearInterval(this._autoBackupTimer);
                this._autoBackupTimer = null;
            }
        },

        _checkAndRunAutoBackup() {
            const cfg = this.getConfig();
            if (!cfg.enabled || !cfg.backupFolderSet) {
                this._stopAutoBackupTimer();
                return;
            }

            const now = new Date();
            const today = this._dateKey(now);

            // Skip if already backed up today
            if (cfg.lastBackupDate === today) return;

            // Check weekday-only constraint
            const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
            if (cfg.weekdayOnly && (dayOfWeek === 0 || dayOfWeek === 6)) return;

            // Check time (4:45 PM = 16:45)
            const [targetH, targetM] = cfg.time.split(':').map(Number);
            const currentMinutes = now.getHours() * 60 + now.getMinutes();
            const targetMinutes = targetH * 60 + targetM;
            if (currentMinutes < targetMinutes) return;

            // All conditions met — run the backup
            this._performAutoBackup();
        },

        async _performAutoBackup() {
            const dirHandle = await this._getHandle(this.AUTO_BACKUP_DIR_KEY);
            if (!dirHandle) {
                console.warn("[BackupManager] Auto-backup directory handle not found. Disabling auto-backup.");
                const cfg = this.getConfig();
                cfg.enabled = false;
                this._saveConfig(cfg);
                this._stopAutoBackupTimer();
                app.Core.Utils.showNotification("Auto-backup folder not found. Please reconfigure in Settings.", { type: 'error', duration: 6000 });
                return;
            }

            try {
                const now = new Date();
                const dateStr = this._dateKey(now);
                const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                const fileName = `cm_notes_backup_auto_${dateStr}.json`;

                // Check if file already exists in directory — overwrite if so
                let fileHandle = null;
                try {
                    fileHandle = await dirHandle.getFileHandle(fileName);
                } catch (e) {
                    // File doesn't exist yet, will create below
                }

                if (!fileHandle) {
                    fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
                }

                const writable = await fileHandle.createWritable();
                await writable.write(this._getBackupData());
                await writable.close();

                // Update config with backup timestamp
                const cfg = this.getConfig();
                cfg.lastBackupDate = dateStr;
                cfg.lastBackupTime = timeStr;
                this._saveConfig(cfg);

                // Clean up old backups (async, don't wait)
                this._cleanupOldBackups(dirHandle, cfg.retentionDays);

                console.log(`[BackupManager] Auto-backup completed: ${fileName}`);

                // Sync to Google Drive if connected and sync enabled
                const gcfg = this._getGDriveConfig();
                if (gcfg.connected && gcfg.syncEnabled) {
                    const backupContent = this._getBackupData();
                    this._gdriveUpload(backupContent, fileName).then(success => {
                        if (success) {
                            const gdriveCfg = this._getGDriveConfig();
                            gdriveCfg.lastSyncDate = dateStr;
                            gdriveCfg.lastSyncTime = timeStr;
                            this._saveGDriveConfig(gdriveCfg);
                            console.log(`[BackupManager] GDrive sync completed: ${fileName}`);
                        } else {
                            console.warn('[BackupManager] GDrive sync failed, but local backup is safe.');
                        }
                    });
                }

                app.Core.Utils.showNotification(`Auto-backup saved: ${fileName}`, { type: 'success', duration: 4000 });

            } catch (err) {
                console.error("[BackupManager] Auto-backup failed:", err);
                app.Core.Utils.showNotification("Auto-backup failed. See console for details.", { type: 'error', duration: 5000 });
            }
        },

        async _cleanupOldBackups(dirHandle, retentionDays) {
            try {
                const cutoff = new Date();
                cutoff.setDate(cutoff.getDate() - retentionDays);
                const cutoffStr = this._dateKey(cutoff);

                for await (const entry of dirHandle.values()) {
                    if (entry.kind !== 'file') continue;
                    if (!entry.name.startsWith('cm_notes_backup_auto_') || !entry.name.endsWith('.json')) continue;

                    const dateMatch = entry.name.match(/(\d{4}-\d{2}-\d{2})/);
                    if (!dateMatch) continue;
                    if (dateMatch[1] < cutoffStr) {
                        try {
                            await dirHandle.removeEntry(entry.name);
                            console.log(`[BackupManager] Removed old backup: ${entry.name}`);
                        } catch (removeErr) {
                            console.warn(`[BackupManager] Could not remove ${entry.name}:`, removeErr);
                        }
                    }
                }
            } catch (err) {
                console.warn("[BackupManager] Cleanup error:", err);
            }
        },

        /**
         * Interactive configuration wizard for auto-backup.
         * Guides the user through: folder selection → enable toggle.
         * Returns a Promise that resolves when configuration is complete.
         * @returns {Promise<boolean>} true if configured successfully
         */
        async configureAutoBackup() {
            if (!window.showDirectoryPicker) {
                app.Core.Utils.showNotification("Your browser does not support the File System Access API for directories. Please use Chrome or Edge.", { type: 'error' });
                return false;
            }

            try {
                // Step 1: Let user pick the backup directory
                const dirHandle = await window.showDirectoryPicker();
                const dirName = dirHandle.name;

                // Verify the directory is writable by trying to create a test file
                try {
                    const testHandle = await dirHandle.getFileHandle('_cm_backup_test.tmp', { create: true });
                    const writable = await testHandle.createWritable();
                    await writable.write('test');
                    await writable.close();
                    await dirHandle.removeEntry('_cm_backup_test.tmp');
                } catch (testErr) {
                    app.Core.Utils.showNotification("Selected directory is not writable. Please choose another folder.", { type: 'error' });
                    return false;
                }

                // Save the directory handle to IndexedDB
                await this._setHandle(this.AUTO_BACKUP_DIR_KEY, dirHandle);

                // Step 2: Enable auto-backup
                const cfg = this.getConfig();
                cfg.backupFolderSet = true;
                cfg.enabled = true;
                cfg.lastBackupDate = null; // Reset so it triggers on next check
                this._saveConfig(cfg);

                app.Core.Utils.showNotification(`Auto-backup configured! Folder: ${dirName}\nBackups will run at 4:45 PM weekdays.`, { type: 'success', duration: 6000 });

                // Step 3: Start the timer
                this._startAutoBackupTimer();

                return true;

            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error("[BackupManager] Auto-backup configuration failed:", err);
                    app.Core.Utils.showNotification("Failed to configure auto-backup.", { type: 'error' });
                }
                return false;
            }
        },

        /**
         * Disables auto-backup and stops the polling timer.
         */
        disableAutoBackup() {
            const cfg = this.getConfig();
            cfg.enabled = false;
            this._saveConfig(cfg);
            this._stopAutoBackupTimer();
            app.Core.Utils.showNotification("Auto-backup disabled.", { type: 'info' });
        },

        /**
         * Triggers an immediate one-time backup to the configured directory.
         * Returns true on success, false otherwise.
         */
        async backupNow() {
            const cfg = this.getConfig();
            if (!cfg.backupFolderSet) {
                app.Core.Utils.showNotification("No backup folder configured. Go to Settings to set one up.", { type: 'error' });
                return false;
            }
            await this._performAutoBackup();
            return true;
        },

        // ── Google Drive Sync ──────────────────────────────────

        /**
         * Initiates Google Drive OAuth flow via the background service worker.
         * On success, stores the connection state and ensures the backup folder exists.
         * @returns {Promise<boolean>} true if connected successfully
         */
        async gdriveConnect() {
            try {
                const response = await this._sendBackgroundMessage('GET_AUTH_TOKEN', { interactive: true });
                if (!response.success) {
                    app.Core.Utils.showNotification(`Google Drive connection failed: ${response.error}`, { type: 'error' });
                    return false;
                }

                // Get user info from the token
                let userEmail = 'Connected';
                try {
                    const userResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                        headers: { Authorization: `Bearer ${response.token}` }
                    });
                    if (userResp.ok) {
                        const userData = await userResp.json();
                        userEmail = userData.email;
                    }
                } catch (e) {
                    // Non-critical — use generic label
                }

                // Ensure the backup folder exists
                const folderId = await this._gdriveEnsureFolder(response.token);
                if (!folderId) {
                    app.Core.Utils.showNotification('Failed to create or find backup folder in Google Drive.', { type: 'error' });
                    return false;
                }

                const gcfg = this._getGDriveConfig();
                gcfg.connected = true;
                gcfg.userEmail = userEmail;
                gcfg.folderId = folderId;
                gcfg.syncEnabled = true;
                this._saveGDriveConfig(gcfg);

                app.Core.Utils.showNotification(`Google Drive connected as ${userEmail}`, { type: 'success', duration: 5000 });
                return true;

            } catch (err) {
                console.error('[BackupManager] GDrive connect error:', err);
                app.Core.Utils.showNotification(`Google Drive connection failed: ${err.message}`, { type: 'error' });
                return false;
            }
        },

        /**
         * Disconnects from Google Drive by removing the cached auth token.
         */
        async gdriveDisconnect() {
            try {
                await this._sendBackgroundMessage('REMOVE_CACHED_AUTH');
            } catch (err) {
                console.warn('[BackupManager] Token removal warning:', err);
            }

            const gcfg = this._getGDriveConfig();
            gcfg.connected = false;
            gcfg.userEmail = null;
            gcfg.folderId = null;
            gcfg.syncEnabled = false;
            gcfg.lastSyncDate = null;
            gcfg.lastSyncTime = null;
            this._saveGDriveConfig(gcfg);

            app.Core.Utils.showNotification('Google Drive disconnected.', { type: 'info' });
        },

        /**
         * Enables or disables automatic GDrive sync after local backups.
         * @param {boolean} enabled
         */
        setGDriveSyncEnabled(enabled) {
            const gcfg = this._getGDriveConfig();
            gcfg.syncEnabled = enabled;
            this._saveGDriveConfig(gcfg);
            app.Core.Utils.showNotification(
                enabled ? 'Google Drive sync enabled.' : 'Google Drive sync disabled.',
                { type: 'info' }
            );
        },

        /**
         * Finds or creates the "CM Notes Backups" folder in Google Drive.
         * @param {string} token - OAuth access token
         * @returns {Promise<string|null>} Folder ID or null on failure
         */
        async _gdriveEnsureFolder(token) {
            try {
                // Search for existing folder
                const searchUrl = `https://www.googleapis.com/drive/v3/files?q=name='${encodeURIComponent(this.GDRIVE_FOLDER_NAME)}' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)`;
                const searchResp = await fetch(searchUrl, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const searchData = await searchResp.json();

                if (searchData.files && searchData.files.length > 0) {
                    return searchData.files[0].id; // Use existing folder
                }

                // Create the folder
                const createResp = await fetch('https://www.googleapis.com/drive/v3/files', {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: this.GDRIVE_FOLDER_NAME,
                        mimeType: 'application/vnd.google-apps.folder'
                    })
                });
                const createData = await createResp.json();
                return createData.id || null;

            } catch (err) {
                console.error('[BackupManager] _gdriveEnsureFolder error:', err);
                return null;
            }
        },

        /**
         * Uploads a backup file to the configured Google Drive folder.
         * @param {string} content - The JSON string content to upload
         * @param {string} fileName - The desired file name (e.g. cm_notes_backup_auto_2026-05-11.json)
         * @returns {Promise<boolean>} true if upload succeeded
         */
        async _gdriveUpload(content, fileName) {
            try {
                const gcfg = this._getGDriveConfig();
                if (!gcfg.connected || !gcfg.folderId) return false;

                // Get a fresh token
                const tokenResp = await this._sendBackgroundMessage('GET_AUTH_TOKEN', { interactive: false });
                if (!tokenResp.success) return false;
                const token = tokenResp.token;

                // Build multipart upload body
                const metadata = JSON.stringify({
                    name: fileName,
                    parents: [gcfg.folderId]
                });
                const blob = new Blob([content], { type: 'application/json' });
                const multipartBody = new Blob([
                    `--boundary\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
                    `--boundary\r\nContent-Type: application/json\r\n\r\n`,
                    blob,
                    `\r\n--boundary--`
                ]);

                const uploadResp = await fetch(
                    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
                    {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${token}`,
                            'Content-Type': 'multipart/related; boundary=boundary'
                        },
                        body: multipartBody
                    }
                );

                if (!uploadResp.ok) {
                    const errText = await uploadResp.text();
                    console.error('[BackupManager] GDrive upload failed:', uploadResp.status, errText);
                    return false;
                }

                return true;

            } catch (err) {
                console.error('[BackupManager] _gdriveUpload error:', err);
                return false;
            }
        }
    };

    app.Tools.BackupManager = BackupManager;
})();