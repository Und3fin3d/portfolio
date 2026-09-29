import { pages, events, steps, maxSteps, visitTimeout } from './catalogue.js';
import { endpoint, hosts } from './config.js';
import { optedOut, clearJourney, stateKey } from './preferences.js';

const page = pages[location.pathname];
const day = () => new Date().toISOString().slice(0, 10);
let state;
let sending = false;
let storageAvailable = true;
let expiry;
let retry;
let failures = 0;
let suspended = false;

function source() {
    const campaign = new URL(location.href).searchParams.get('utm_source');
    if (['linkedin', 'github', 'cv', 'application'].includes(campaign)) return campaign;
    try {
        const host = new URL(document.referrer).hostname;
        return ['linkedin.com', 'github.com', 'google.com', 'google.co.uk', 'bing.com', 'duckduckgo.com'].find(name => host === name || host.endsWith(`.${name}`)) || 'other';
    } catch {
        return 'direct';
    }
}

function save() {
    try { sessionStorage.setItem(stateKey, JSON.stringify(state)); }
    catch { storageAvailable = false; state = null; }
}

function restore() {
    state = null;
    try {
        const saved = JSON.parse(sessionStorage.getItem(stateKey));
        const valid = saved && saved.day === day() && Number.isFinite(saved.active) && saved.active <= Date.now() && Date.now() - saved.active < visitTimeout;
        if (valid && Array.isArray(saved.path) && saved.path.length <= maxSteps && saved.path.every(step => steps.has(step)) && Array.isArray(saved.queue) && saved.queue.length <= maxSteps) state = saved;
        else clearJourney();
    } catch { clearJourney(); }
}

function enabled() {
    return !suspended && storageAvailable && !optedOut() && !!endpoint && hosts.includes(location.hostname) && !!page;
}

function currentVisit() {
    return state && state.day === day() && Date.now() - state.active < visitTimeout;
}

function clearState() {
    clearTimeout(expiry);
    clearTimeout(retry);
    clearJourney();
    state = null;
}

async function deliverNext() {
    const visit = state;
    const response = await fetch(endpoint, { method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer',
        headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(visit.queue[0]), keepalive: true,
        signal: AbortSignal.timeout(8000) });
    if (suspended || state !== visit || optedOut()) return false;
    if (!response.ok && ![400, 413].includes(response.status)) return false;
    state.queue.shift();
    failures = 0;
    save();
    return true;
}

async function flush() {
    if (sending || !enabled() || !state?.queue.length) return;
    if (!currentVisit()) { clearState(); return; }
    clearTimeout(retry);
    sending = true;
    try {
        while (enabled() && currentVisit() && state.queue.length) {
            if (!await deliverNext()) break;
        }
    } catch {} finally {
        sending = false;
        if (enabled() && currentVisit() && state.queue.length && failures < 5) {
            retry = setTimeout(() => void flush(), Math.min(60000, 2000 * 2 ** failures++));
        }
    }
}

function append(step) {
    if (state.path.length >= maxSteps) return;
    state.path.push(step);
    state.queue.push({ id: crypto.randomUUID(), day: state.day, source: state.source, page, path: [...state.path] });
}

function record(step, once = false) {
    if (!enabled() || !steps.has(step)) return;
    const fresh = !state || state.day !== day() || Date.now() - state.active >= visitTimeout;
    if (fresh) {
        state = { day: day(), active: Date.now(), source: source(), path: [], queue: [] };
        append(page);
    }
    if (once && state.path.includes(step)) return;
    if (!fresh || step !== page) append(step);
    failures = 0;
    state.active = Date.now();
    clearTimeout(expiry);
    expiry = setTimeout(clearState, visitTimeout);
    save();
    void flush();
}

function linkEvent(link) {
    const url = new URL(link.href, location.href);
    if (url.protocol === 'mailto:') return 'Email click';
    if (url.origin === location.origin && url.pathname.endsWith('/WilliamGreenfield_CV.pdf')) return 'CV click';
    if (url.origin === location.origin && url.pathname.endsWith('/artificial-synapse-research-poster.pdf')) return 'Poster click';
    if (url.hostname === 'www.linkedin.com' || url.hostname === 'linkedin.com') return 'LinkedIn click';
    if (url.hostname !== 'github.com') return null;
    const repository = url.pathname.split('/')[2]?.toLowerCase();
    const projects = { 'nn-mnist': 'Neural network', portfolio: 'Chess engine', 'maze-solver': 'Maze solver',
        'six-nations-fantasy': 'Six Nations', 'chessweb-v2': 'Chessweb', 'bible-memorisation-app': 'Bible app' };
    return projects[repository] ? `Project: ${projects[repository]}` : 'GitHub click';
}

function clicked(event) {
    if (!event.isTrusted || !(event.target instanceof Element)) return;
    const link = event.target.closest('a[href]');
    if (link) {
        const name = linkEvent(link);
        if (name) record(name);
    }
    if (location.pathname.startsWith('/research/animations/') && event.target.closest('button:not([disabled])')) record('Research demo used', true);
}

function observeArticle() {
    const article = document.querySelector('.post__body');
    if (!article || article.textContent.trim().length < 400) return;
    let active = 0;
    let previous = performance.now();
    setInterval(() => {
        const now = performance.now();
        const elapsed = Math.min((now - previous) / 1000, 2);
        previous = now;
        if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
        const box = article.getBoundingClientRect();
        if (box.top >= innerHeight || box.bottom <= 0) return;
        active += elapsed;
        const progress = Math.min(1, (innerHeight - box.top) / box.height);
        for (const milestone of [25, 50, 90]) {
            if (active >= milestone / 5 && progress * 100 >= milestone) record(`Article ${milestone}%`, true);
        }
    }, 1000);
}

function privacyChanged() {
    if (optedOut()) clearState();
}

if (page && endpoint && hosts.includes(location.hostname)) {
    if (optedOut()) clearJourney();
    else { restore(); record(page); }
    document.addEventListener('click', clicked, true);
    document.addEventListener('auxclick', event => { if (event.button === 1) clicked(event); }, true);
    document.addEventListener('portfolio-engagement', event => {
        if (events.includes(event.detail)) record(event.detail, true);
    });
    window.addEventListener('storage', privacyChanged);
    window.addEventListener('portfolio-privacy-change', privacyChanged);
    window.addEventListener('online', () => void flush());
    window.addEventListener('pagehide', () => { suspended = true; clearTimeout(retry); clearTimeout(expiry); });
    window.addEventListener('pageshow', event => {
        if (!event.persisted) return;
        suspended = false;
        restore();
        record(page);
    });
    observeArticle();
}
