(async function() {
    const result = await chrome.storage.local.get('sn_print_html');
    const data = result.sn_print_html;
    chrome.storage.local.remove('sn_print_html');
    if (!data || !data.html) {
        document.getElementById('content').innerHTML = '<p style="color:#999;">No receipt data found.</p>';
        return;
    }
    document.getElementById('content').innerHTML = data.html;
    if (data.title) {
        document.title = data.title;
        document.getElementById('toolbar-title').textContent = data.title;
    }
    document.getElementById('btn-print').onclick = () => window.print();
    document.getElementById('btn-close').onclick = () => window.close();
})();
