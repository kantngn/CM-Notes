(async function() {
    const isCapture = window.location.search.includes('capture=1');

    const result = await chrome.storage.local.get('sn_print_html');
    const data = result.sn_print_html;
    chrome.storage.local.remove('sn_print_html');
    if (!data || !data.html) {
        document.getElementById('content').innerHTML = '<p style="color:#999;">No receipt data found.</p>';
        if (isCapture) {
            // Signal to background that render is complete (no data)
            document.title = 'CAPTURE_READY';
        }
        return;
    }
    document.getElementById('content').innerHTML = data.html;
    if (data.title) {
        document.title = isCapture ? 'CAPTURE_READY' : data.title;
        document.getElementById('toolbar-title').textContent = data.title;
    }

    // In capture mode, hide toolbar and content padding so the screenshot is clean
    if (isCapture) {
        document.querySelector('.toolbar').style.display = 'none';
        document.body.style.paddingTop = '0';
        document.getElementById('content').style.marginTop = '0';
    }

    document.getElementById('btn-print').onclick = () => window.print();
    document.getElementById('btn-close').onclick = () => window.close();
})();
