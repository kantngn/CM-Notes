export const Utils = {
    formatPhoneNumber(phoneStr) {
        if (!phoneStr) return '';
        const str = String(phoneStr);
        const digits = str.replace(/\D/g, '');
        if (digits.length === 10) {
            return `${digits.substring(0, 3)}-${digits.substring(3, 6)}-${digits.substring(6)}`;
        }
        if (digits.length === 11 && digits.startsWith('1')) {
            return `${digits.substring(1, 4)}-${digits.substring(4, 7)}-${digits.substring(7)}`;
        }
        return str; // return original if not a standard US number
    }
};
