export const stateKey = 'portfolio-journey';
const preferenceKey = 'portfolio-analytics-off';

export function optedOut() {
    try {
        return localStorage.getItem(preferenceKey) === '1' || navigator.globalPrivacyControl === true || navigator.doNotTrack === '1';
    } catch {
        return true;
    }
}

export function clearJourney() {
    try { sessionStorage.removeItem(stateKey); } catch {}
}

export function setOptOut(disabled) {
    try {
        if (disabled) localStorage.setItem(preferenceKey, '1');
        else localStorage.removeItem(preferenceKey);
        clearJourney();
        window.dispatchEvent(new Event('portfolio-privacy-change'));
        return true;
    } catch {
        return false;
    }
}
