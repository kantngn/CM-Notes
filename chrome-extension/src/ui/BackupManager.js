(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Tools = app.Tools || {};

    /**
     * BackupManager - Handles manual and automatic backups to the local file system
     * and provides a UI for restoring from those backups.
     * Utilizes the File System Access API.
     */
    const BackupManager = {
        DB_NAME: 'CMNotesBackupDB',
        STORE_NAME: 'handles',
        AUTO_BACKUP_DIR_KEY: 'autoBackupDirHandle',
        _db: null,
        _autoBackupInterval: null,

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

        async createManualBackup() {
            if (!window.showSaveFilePicker) {
                alert("Your browser does not support the File System Access API. Please use a modern browser like Chrome or Edge.");
                return;
            }
            try {
                const now = new Date();
                const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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

        async showRestoreUI() {
            if (!window.showDirectoryPicker) {
                alert("Your browser does not support the File System Access API for directories.");
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
                    alert("No valid backup files found in the selected directory.");
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
                    if (choice) alert("Invalid selection.");
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
                
                // Optional: Clear all existing GM values first for a clean restore
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

        // --- Auto Backup ---
        // NOTE: Auto-backup implementation is complex due to needing persistent directory handles
        // and running background checks. This is a simplified placeholder for the concept.
        async configureAutoBackup() {
            alert("Auto-backup configuration is a planned feature.\n\nIt will involve:\n1. Selecting a directory for automatic backups.\n2. Running a check every Friday at 4 PM.\n3. Automatically creating a versioned backup.\n4. Keeping the latest 4 auto-backups.");
        },

        initAutoBackup() {
            // This would be called on script start
            // 1. Get directory handle from IndexedDB
            // 2. Set up an interval (e.g., every hour) to check the time
            // 3. If it's Friday, 4 PM, and we haven't backed up this week, run the backup.
            // Example:
            // this._autoBackupInterval = setInterval(() => {
            //     const now = new Date();
            //     // Friday is 5
            //     if (now.getDay() === 5 && now.getHours() === 16) {
            //         // Check if we already backed up in the last hour to prevent multiple runs
            //         // Then call a function like _runAutoBackup()
            //     }
            // }, 3600 * 1000); // Check every hour
        }
    };

    app.Tools.BackupManager = BackupManager;
})();