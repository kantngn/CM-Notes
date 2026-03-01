(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Core = app.Core || {};

    const Themes = {
        'Red': { primary: '#e57373', dark: '#c62828', text: '#b71c1c', light: '#ffcdd2', lighter: '#ffebee', border: '#e57373', card: '#ffffff', textMain: '#333333' },
        'Orange': { primary: '#ffb74d', dark: '#ef6c00', text: '#e65100', light: '#ffe0b2', lighter: '#fff3e0', border: '#ffb74d', card: '#ffffff', textMain: '#333333' },
        'Yellow': { primary: '#fff176', dark: '#f9a825', text: '#f57f17', light: '#fff9c4', lighter: '#fffde7', border: '#fff176', card: '#ffffff', textMain: '#333333' },
        'Green': { primary: '#81c784', dark: '#2e7d32', text: '#1b5e20', light: '#c8e6c9', lighter: '#e8f5e9', border: '#81c784', card: '#ffffff', textMain: '#333333' },
        'Teal': { primary: '#4db6ac', dark: '#00695c', text: '#004d40', light: '#b2dfdb', lighter: '#e0f2f1', border: '#4db6ac', card: '#ffffff', textMain: '#333333' },
        'Blue': { primary: '#64b5f6', dark: '#1565c0', text: '#0d47a1', light: '#bbdefb', lighter: '#e3f2fd', border: '#64b5f6', card: '#ffffff', textMain: '#333333' },
        'Purple': { primary: '#9575cd', dark: '#512da8', text: '#311b92', light: '#d1c4e9', lighter: '#ede7f6', border: '#9575cd', card: '#ffffff', textMain: '#333333' },
        'Pink': { primary: '#f06292', dark: '#ad1457', text: '#880e4f', light: '#f8bbd0', lighter: '#fce4ec', border: '#f06292', card: '#ffffff', textMain: '#333333' },
        'Brown': { primary: '#a1887f', dark: '#5d4037', text: '#3e2723', light: '#d7ccc8', lighter: '#efebe9', border: '#a1887f', card: '#ffffff', textMain: '#333333' },
        'Grey': { primary: '#90a4ae', dark: '#455a64', text: '#263238', light: '#cfd8dc', lighter: '#eceff1', border: '#90a4ae', card: '#ffffff', textMain: '#333333' }
    };

    const NoteThemes = {
        colors: {
            "EST": ["#ffe0b2", "#ffcc80"], "CST": ["#fff9c4", "#fff59d"], "MST": ["#c8e6c9", "#a5d6a7"], // East -> West
            "PST": ["#b2dfdb", "#80cbc4"], "AKST": ["#bbdefb", "#90caf9"], "HST": ["#e1bee7", "#ce93d8"]
        },
        stateTZ: {
            'AL': 'CST', 'AK': 'AKST', 'AZ': 'MST', 'AR': 'CST', 'CA': 'PST', 'CO': 'MST', 'CT': 'EST', 'DE': 'EST', 'FL': 'EST', 'GA': 'EST',
            'HI': 'HST', 'ID': 'MST', 'IL': 'CST', 'IN': 'EST', 'IA': 'CST', 'KS': 'CST', 'KY': 'EST', 'LA': 'CST', 'ME': 'EST', 'MD': 'EST',
            'MA': 'EST', 'MI': 'EST', 'MN': 'CST', 'MS': 'CST', 'MO': 'CST', 'MT': 'MST', 'NE': 'CST', 'NV': 'PST', 'NH': 'EST', 'NJ': 'EST',
            'NM': 'MST', 'NY': 'EST', 'NC': 'EST', 'ND': 'CST', 'OH': 'EST', 'OK': 'CST', 'OR': 'PST', 'PA': 'EST', 'RI': 'EST', 'SC': 'EST',
            'SD': 'CST', 'TN': 'CST', 'TX': 'CST', 'UT': 'MST', 'VT': 'EST', 'VA': 'EST', 'WA': 'PST', 'WV': 'EST', 'WI': 'CST', 'WY': 'MST',
            'DC': 'EST'
        },
        specialTZ: {
            'FL': { 'PENSACOLA': 'CST', 'PANAMA CITY': 'CST', 'DESTIN': 'CST', 'FORT WALTON BEACH': 'CST' },
            'TX': { 'EL PASO': 'MST', 'HUDSPETH': 'MST' },
            'TN': { 'KNOXVILLE': 'EST', 'CHATTANOOGA': 'EST', 'JOHNSON CITY': 'EST', 'KINGSPORT': 'EST' },
            'IN': { 'GARY': 'CST', 'EVANSVILLE': 'CST' },
            'KY': { 'BOWLING GREEN': 'CST', 'OWENSBORO': 'CST', 'PADUCAH': 'CST' },
            'MI': { 'IRON MOUNTAIN': 'CST', 'MENOMINEE': 'CST' }
        }
    };

    function applyTheme(name) {
        const t = Themes[name] || Themes['Teal'];
        const root = document.documentElement;
        root.style.setProperty('--sn-primary', t.primary);
        root.style.setProperty('--sn-primary-dark', t.dark);
        root.style.setProperty('--sn-primary-text', t.text);
        root.style.setProperty('--sn-bg-light', t.light);
        root.style.setProperty('--sn-bg-lighter', t.lighter);
        root.style.setProperty('--sn-border', t.border);
        root.style.setProperty('--sn-bg-card', t.card || '#ffffff');
        root.style.setProperty('--sn-text-main', t.textMain || '#333333');
    }

    app.Core.Themes = Themes;
    app.Core.NoteThemes = NoteThemes;
    app.Core.Styles = app.Core.Styles || {};
    app.Core.Styles.applyTheme = applyTheme;
    app.Core.Styles.init = function () {
        const saved = (typeof GM_getValue === 'function') ? GM_getValue('sn_theme', 'Teal') : 'Teal';
        applyTheme(saved);
    };
})();
