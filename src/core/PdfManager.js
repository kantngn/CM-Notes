export const PdfManager = {
    async loadPdfLib() {
        return window.PDFLib;
    },

    fetchPdfBytes(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: url,
                responseType: 'arraybuffer',
                onload: function (response) {
                    if (response.status >= 200 && response.status < 400) {
                        resolve(response.response);
                    } else {
                        reject(new Error(`PDF fetch failed: ${response.status} ${response.statusText}`));
                    }
                },
                onerror: reject
            });
        });
    }
};
