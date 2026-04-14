/**
 * Themes – UI color constants, Note Themes, and theme application.
 */
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
            "EDT": ["#ffe0b2", "#ffcc80"], "CDT": ["#fff9c4", "#fff59d"], "MDT": ["#c8e6c9", "#a5d6a7"],
            "PDT": ["#b2dfdb", "#80cbc4"], "AKDT": ["#bbdefb", "#90caf9"], "HST": ["#e1bee7", "#ce93d8"]
        },
        stateTZ: {
            'AL': 'CDT', 'AK': 'AKDT', 'AZ': 'MDT', 'AR': 'CDT', 'CA': 'PDT', 'CO': 'MDT', 'CT': 'EDT', 'DE': 'EDT', 'FL': 'EDT', 'GA': 'EDT',
            'HI': 'HST', 'ID': 'MDT', 'IL': 'CDT', 'IN': 'EDT', 'IA': 'CDT', 'KS': 'CDT', 'KY': 'EDT', 'LA': 'CDT', 'ME': 'EDT', 'MD': 'EDT',
            'MA': 'EDT', 'MI': 'EDT', 'MN': 'CDT', 'MS': 'CDT', 'MO': 'CDT', 'MT': 'MDT', 'NE': 'CDT', 'NV': 'PDT', 'NH': 'EDT', 'NJ': 'EDT',
            'NM': 'MDT', 'NY': 'EDT', 'NC': 'EDT', 'ND': 'CDT', 'OH': 'EDT', 'OK': 'CDT', 'OR': 'PDT', 'PA': 'EDT', 'RI': 'EDT', 'SC': 'EDT',
            'SD': 'CDT', 'TN': 'CDT', 'TX': 'CDT', 'UT': 'MDT', 'VT': 'EDT', 'VA': 'EDT', 'WA': 'PDT', 'WV': 'EDT', 'WI': 'CDT', 'WY': 'MDT',
            'DC': 'EDT'
        },
        specialTZ: {
            'FL': { 'PENSACOLA': 'CDT', 'PANAMA CITY': 'CDT', 'DESTIN': 'CDT', 'FORT WALTON BEACH': 'CDT' },
            'TX': { 'EL PASO': 'MDT', 'HUDSPETH': 'MDT' },
            'TN': { 'KNOXVILLE': 'EDT', 'CHATTANOOGA': 'EDT', 'JOHNSON CITY': 'EDT', 'KINGSPORT': 'EDT' },
            'IN': { 'GARY': 'CDT', 'EVANSVILLE': 'CDT' },
            'KY': { 'BOWLING GREEN': 'CDT', 'OWENSBORO': 'CDT', 'PADUCAH': 'CDT' },
            'MI': { 'IRON MOUNTAIN': 'CDT', 'MENOMINEE': 'CDT' }
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
        const saved = GM_getValue('sn_theme', 'Teal');
        applyTheme(saved);
    };
})();
