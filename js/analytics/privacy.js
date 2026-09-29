import { endpoint } from './config.js';
import { optedOut, setOptOut } from './preferences.js';

const button = document.querySelector('#privacy-toggle');
const status = document.querySelector('#preference-status');
document.querySelector('#collection-status').textContent = endpoint ? 'Site analytics is configured.' : 'Site analytics is currently disabled.';

function render() {
    const browserPreference = navigator.globalPrivacyControl === true || navigator.doNotTrack === '1';
    button.disabled = browserPreference;
    button.textContent = optedOut() ? 'Allow site statistics' : 'Turn analytics off';
    status.textContent = browserPreference ? 'Your browser privacy signal keeps analytics off.' : optedOut() ? 'Analytics is off in this browser.' : 'You have not opted out of site statistics.';
}

button.addEventListener('click', () => {
    if (setOptOut(!optedOut())) render();
    else status.textContent = 'Browser storage is unavailable. Analytics remains off.';
});
window.addEventListener('storage', render);
render();
