(async function () {
    const titleEl = document.getElementById('pdf-title');
    const embedEl = document.getElementById('pdf-embed');
    const downloadBtn = document.getElementById('btn-download');
    const viewerEl = document.getElementById('viewer');
    const noPdfEl = document.getElementById('no-pdf');
    const closeBtn = document.getElementById('btn-close');

    if (closeBtn) {
        closeBtn.addEventListener('click', function () {
            window.close();
        });
    }

    let data = null;

    // Try 1: Get from background service worker
    try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_PREVIEW_PDF' });
        console.log('[Preview] BG response:', response);
        if (response && response.data && response.data.pdfBase64) {
            data = response.data;
        }
    } catch (e) {
        console.error('[Preview] sendMessage failed:', e.message);
    }

    // Try 2: Fallback — read from chrome.storage.local
    if (!data) {
        const result = await chrome.storage.local.get('sn_temp_preview_pdf');
        console.log('[Preview] Storage result:', result);
        if (result.sn_temp_preview_pdf && result.sn_temp_preview_pdf.pdfBase64) {
            data = result.sn_temp_preview_pdf;
        }
    }

    if (!data || !data.pdfBase64) {
        titleEl.textContent = '📭 No PDF';
        viewerEl.style.display = 'none';
        noPdfEl.style.display = 'flex';
        downloadBtn.style.display = 'none';
        return;
    }

    const { pdfBase64, fileName } = data;
    const displayName = (fileName || 'fax.pdf').split('/').pop();
    titleEl.textContent = '📄 ' + displayName;
    document.title = 'PDF Preview — ' + displayName;

    // Convert base64 data URI to a blob URL
    function dataURItoBlob(dataURI) {
        const parts = dataURI.split(',');
        const mime = parts[0].match(/:(.*?);/)[1];
        const bytes = atob(parts[1]);
        const arr = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) {
            arr[i] = bytes.charCodeAt(i);
        }
        return new Blob([arr], { type: mime });
    }

    const pdfBlob = dataURItoBlob(pdfBase64);
    const blobUrl = URL.createObjectURL(pdfBlob);

    // Open PDF in a new tab using Chrome's native viewer (embeds blocked on extension pages)
    window.open(blobUrl, '_blank');

    // Set download button
    downloadBtn.href = blobUrl;
    downloadBtn.download = displayName;

    // Show viewer area with a message instead of embed
    viewerEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#ccc;font-size:14px;flex-direction:column;gap:8px;">'
        + '<span style="font-size:40px;">📄</span>'
        + '<span>PDF opened in a new tab</span>'
        + '<span style="font-size:12px;color:#999;">Use the Download button above to save</span>'
        + '</div>';

    console.log('[Preview] PDF loaded:', displayName);
})();
