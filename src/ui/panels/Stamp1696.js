(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Tools = app.Tools || {};

    /**
     * 1696 Fee Agreement PDF stamping module.
     * Handles loading an IP Contract PDF, stamping client data (name, SSN, DOB,
     * address, phone) onto specific pages, and reordering the output.
     *
     * @namespace app.Tools.Stamp1696
     */
    const Stamp1696 = {
        // ── State abbreviation lookup ──────────────────────────────────────────
        STATE_ABBR: {
            'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA',
            'colorado':'CO','connecticut':'CT','delaware':'DE','florida':'FL','georgia':'GA',
            'hawaii':'HI','idaho':'ID','illinois':'IL','indiana':'IN','iowa':'IA',
            'kansas':'KS','kentucky':'KY','louisiana':'LA','maine':'ME','maryland':'MD',
            'massachusetts':'MA','michigan':'MI','minnesota':'MN','mississippi':'MS','missouri':'MO',
            'montana':'MT','nebraska':'NE','nevada':'NV','new hampshire':'NH','new jersey':'NJ',
            'new mexico':'NM','new york':'NY','north carolina':'NC','north dakota':'ND','ohio':'OH',
            'oklahoma':'OK','oregon':'OR','pennsylvania':'PA','rhode island':'RI','south carolina':'SC',
            'south dakota':'SD','tennessee':'TN','texas':'TX','utah':'UT','vermont':'VT',
            'virginia':'VA','washington':'WA','west virginia':'WV','wisconsin':'WI','wyoming':'WY'
        },

        _toStateAbbr(s) {
            if (!s) return '';
            const t = s.trim();
            if (/^[A-Z]{2}$/i.test(t)) return t.toUpperCase();
            return this.STATE_ABBR[t.toLowerCase()] || t.toUpperCase();
        },

        /**
         * Parse an address string into components.
         * Expected formats: "123 Main St, Dallas, TX 75201" or "Street, City, State ZIP"
         * @param {string} raw - Raw address string
         * @returns {{ street: string, city: string, state: string, zip: string }}
         */
        _parseAddress(raw) {
            const parts = raw.split(',').map(s => s.trim()).filter(s => s);
            const street = parts[0] || '';
            let city = '', state = '', zip = '';

            if (parts.length >= 4) {
                city  = parts[1];
                state = this._toStateAbbr(parts[2]);
                zip   = parts[3];
            } else if (parts.length === 3) {
                city = parts[1];
                const last = parts[2];
                const m = last.match(/^(.+?)\s+(\d{5}(?:-\d{4})?)$/);
                if (m) { state = this._toStateAbbr(m[1]); zip = m[2]; }
                else   { state = this._toStateAbbr(last); }
            } else if (parts.length === 2) {
                const last = parts[1];
                const m = last.match(/^(.*?)\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
                if (m) { city = m[1]; state = this._toStateAbbr(m[2]); zip = m[3]; }
                else   { city = last; }
            }

            return { street, city, state, zip };
        },

        /**
         * Split full name into firstName and lastName.
         * Handles suffixes (Jr., Sr., III, etc.).
         * @param {string} nameVal
         * @returns {{ firstName: string, lastName: string }}
         */
        _splitName(nameVal) {
            const parts = (nameVal || '').trim().split(/\s+/);
            let lastName = '';
            let firstName = nameVal;
            if (parts.length > 1) {
                const suffixes = ['sr', 'jr', 'sr.', 'jr.', 'i', 'ii', 'iii', 'iv', 'v'];
                const lastWord = parts[parts.length - 1].toLowerCase();
                if (suffixes.includes(lastWord) && parts.length > 2) {
                    lastName  = parts.slice(-2).join(' ');
                    firstName = parts.slice(0, -2).join(' ');
                } else {
                    lastName  = parts[parts.length - 1];
                    firstName = parts.slice(0, -1).join(' ');
                }
            }
            return { firstName, lastName };
        },

        // ── PDF drawing helpers ───────────────────────────────────────────────

        /** Draw text with auto-shrink if it exceeds maxWidth. */
        _drawFit(page, text, x, y, maxWidth, baseFontSize, font, color) {
            if (!text) return;
            let size = baseFontSize;
            while (size > 5 && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.5;
            page.drawText(text, { x, y, size, font, color });
        },

        /** Draw text at a fixed size. */
        _drawExact(page, text, x, y, size, font, color) {
            if (!text) return;
            page.drawText(text, { x, y, size, font, color });
        },

        /** White-out a rectangular area before writing. */
        _drawWhiteBox(page, x, y, w, h, PDFLib) {
            page.drawRectangle({ x, y, width: w, height: h, color: PDFLib.rgb(1, 1, 1), borderWidth: 0 });
        },

        /** Draw a single character centered inside a box. */
        _drawCharCentered(page, ch, boxX, boxY, boxW, size, font, color, xOffset, yOffset, PDFLib) {
            if (!ch) return;
            const charW = font.widthOfTextAtSize(ch, size);
            const textX = boxX + (boxW - charW) / 2 - 2 + (xOffset || 0);
            page.drawText(ch, {
                x: textX,
                y: boxY + 2 + (yOffset || 0),
                size, font, color
            });
        },

        /** Stamp all 9 SSN digits into their respective boxes on a page. */
        _stampSsnDigits(page, boxes, size, ssnDigits, font, color, xOffset, yOffset, xOffsetFn, PDFLib) {
            boxes.forEach((box, i) => {
                const offset = xOffsetFn ? xOffsetFn(i) : (xOffset || 0);
                this._drawWhiteBox(page, box.x, box.y, box.w, box.h, PDFLib);
                this._drawCharCentered(page, ssnDigits[i] || '', box.x, box.y, box.w, size, font, color, offset, yOffset, PDFLib);
            });
        },

        // ── Box layout constants ──────────────────────────────────────────────

        SSN_BOXES_P4: [
            { x: 19.0,  y: 334.2, w: 24.5, h: 20.0 },
            { x: 45.5,  y: 334.2, w: 24.5, h: 20.0 },
            { x: 72.0,  y: 334.2, w: 24.5, h: 20.0 },
            { x: 112.0, y: 334.2, w: 23.0, h: 20.0 },
            { x: 136.0, y: 334.2, w: 23.0, h: 20.0 },
            { x: 172.0, y: 334.2, w: 26.5, h: 20.0 },
            { x: 200.0, y: 334.2, w: 27.0, h: 20.0 },
            { x: 228.5, y: 334.2, w: 27.0, h: 20.0 },
            { x: 257.0, y: 334.2, w: 26.5, h: 20.0 },
        ],

        SSN_BOXES_P567: [
            { x: 30.5,  y: 716.7, w: 24.5, h: 20.0 },
            { x: 57.0,  y: 716.7, w: 24.5, h: 20.0 },
            { x: 83.5,  y: 716.7, w: 24.5, h: 20.0 },
            { x: 123.0, y: 716.7, w: 23.0, h: 20.0 },
            { x: 147.5, y: 716.7, w: 23.0, h: 20.0 },
            { x: 183.5, y: 716.7, w: 26.5, h: 20.0 },
            { x: 211.5, y: 716.7, w: 27.0, h: 20.0 },
            { x: 240.0, y: 716.7, w: 27.0, h: 20.0 },
            { x: 268.5, y: 716.7, w: 26.5, h: 20.0 },
        ],

        /**
         * Process a 1696 IP Contract PDF: stamp client data and reorder pages.
         * @param {File} file - The IP Contract PDF file
         * @param {{ name: string, ssn: string, dob: string, address: string, phone: string }} data
         * @returns {Promise<{ bytes: Uint8Array, filename: string }>}
         */
        async process(file, data) {
            const PDFLib = window.PDFLib;
            if (!PDFLib) {
                throw new Error("PDFLib not found. Ensure pdf-lib.min.js is loaded.");
            }

            const { PDFDocument, rgb, StandardFonts } = PDFLib;
            const fileBytes = await file.arrayBuffer();
            const pdfDoc = await PDFDocument.load(fileBytes);

            const helvetica     = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

            const { name: nameVal, ssn: ssnVal, dob: dobVal, address: addrVal, phone: phoneVal } = data;
            const today = new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });

            const black = rgb(0, 0, 0);
            const red   = rgb(0.85, 0, 0);
            const pages = pdfDoc.getPages();

            // Parse address + name
            const addr   = this._parseAddress(addrVal);
            const { firstName, lastName } = this._splitName(nameVal);
            const ssnDigits = (ssnVal || '').replace(/\D/g, '');
            const drawFit   = (p, t, x, y, m, s, f, c) => this._drawFit(p, t, x, y, m, s, f, c);
            const drawExact = (p, t, x, y, s, f, c) => this._drawExact(p, t, x, y, s, f, c);
            const wb   = (p, x, y, w, h) => this._drawWhiteBox(p, x, y, w, h, PDFLib);
            const cc   = (p, ch, bx, by, bw, s, f, c, xo, yo) => this._drawCharCentered(p, ch, bx, by, bw, s, f, c, xo, yo, PDFLib);
            const ssn  = (p, boxes, s, xo, yo, xoFn) => this._stampSsnDigits(p, boxes, s, ssnDigits, helvetica, black, xo, yo, xoFn, PDFLib);

            // ── Page 4 (index 3) ─────────────────────────────────────────
            if (pages.length > 3) {
                const p4 = pages[3];
                wb(p4, 19, 375, 296, 22);
                if (firstName) p4.drawText(firstName, { x: 19, y: 377, size: 12, font: helvetica, color: black });
                wb(p4, 351.5, 375, 239, 22);
                if (lastName) p4.drawText(lastName, { x: 355, y: 377, size: 12, font: helvetica, color: black });
                ssn(p4, this.SSN_BOXES_P4, 12, 5, 2.5, (i) => {
                    if (i <= 2) return 5.5;
                    if (i === 3) return 5;
                    if (i === 4) return 5.3;
                    return 5.5;
                });
            }

            // ── Pages 5, 6, 7 (indices 4, 5, 6) ──────────────────────────
            [4, 5, 6].forEach(idx => {
                if (pages.length > idx) ssn(pages[idx], this.SSN_BOXES_P567, 12, 0, 3, (i) => i < 5 ? 2 : 1);
            });

            // ── Page 8 (index 7) ─────────────────────────────────────────
            if (pages.length > 7) {
                drawFit(pages[7], nameVal, 81, 616, 114, 12, helvetica, black);
            }

            // ── Page 13 (index 12) ───────────────────────────────────────
            if (pages.length > 12) {
                const p13 = pages[12];
                drawExact(p13, addr.street, 44, 489, 14, helvetica, black);
                drawExact(p13, addr.city,  44,  445, 14, helvetica, black);
                drawExact(p13, addr.state, 428, 445, 14, helvetica, black);
                drawExact(p13, addr.zip,   498, 445, 14, helvetica, black);
                drawExact(p13, 'Please remove any additional representations listed prior to', 81, 325, 12, helvetica, red);
                drawExact(p13, 'Andrew Kirkendall, Kirkendall Dwyer as listed below',          81, 305, 12, helvetica, red);

                const repId = "8YJDK7QR4G";
                for (let i = 0; i < repId.length; i++) {
                    drawExact(p13, repId[i], 52 + (i * 23), 381, 14, helvetica, black);
                }

                // SSN digits with white boxes behind them
                const spacingP13 = 24.4;
                const ssnBoxXStart = 43;
                const ssnBoxY = 594;
                for (let i = 0; i < ssnDigits.length; i++) {
                    wb(p13, ssnBoxXStart + (i * spacingP13), ssnBoxY, 22, 17);
                }
                for (let i = 0; i < ssnDigits.length; i++) {
                    drawExact(p13, ssnDigits[i], 54 + (i * spacingP13), 596, 12, helvetica, black);
                }
            }

            // ── Page 14 (index 13) ───────────────────────────────────────
            if (pages.length > 13) {
                const p14 = pages[13];
                drawExact(p14, nameVal, 273, 714, 12, helvetica, black);
                drawExact(p14, ssnVal,  274, 686, 12, helvetica, black);
                drawExact(p14, dobVal,  449, 686, 12, helvetica, black);
                drawExact(p14, addr.street, 188, 151, 12, helvetica, black);
                drawExact(p14, addr.city,   188, 130, 12, helvetica, black);
                drawExact(p14, addr.state,  490, 130, 12, helvetica, black);
                drawExact(p14, addr.zip,    550, 130, 12, helvetica, black);
                drawExact(p14, phoneVal || '', 53, 129, 12, helvetica, black);
            }

            // ── Reorder pages: [page8, pages4-7, pages13-15] ─────────────
            // Indices: [7, 3, 4, 5, 6, 12, 13, 14]
            const newDoc = await PDFDocument.create();
            const pagesToCopy = [7, 3, 4, 5, 6, 12, 13, 14].filter(i => i < pages.length);
            const copiedPages = await newDoc.copyPages(pdfDoc, pagesToCopy);
            copiedPages.forEach(page => newDoc.addPage(page));

            const pdfBytes = await newDoc.save();
            const filename = `1696 Fee Agreement - ${nameVal} - Faxed ${today.replace(/\//g, '-')}.pdf`;

            return { bytes: pdfBytes, filename };
        }
    };

    app.Tools.Stamp1696 = Stamp1696;
})();
