/* Dark Pill — background service worker */

const DEFAULTS = {
  cacheScope: 'site',   // 'site' | 'all'
  clearCookies: false,  // also clear this site's cookies (logs you out)
  clearStorage: false   // also clear this site's localStorage / IndexedDB
};

/* ---------- per-tab state (survives service-worker restarts) ---------- */

async function getSession(key) {
  const data = await chrome.storage.session.get(key);
  return data[key] || {};
}

async function patchSession(key, tabId, value) {
  const map = await getSession(key);
  if (value === null || value === undefined) delete map[tabId];
  else map[tabId] = value;
  await chrome.storage.session.set({ [key]: map });
}

/* ---------- cache clearing ---------- */

async function clearCache(tab) {
  if (!tab || tab.id === undefined) throw new Error('No tab');
  const settings = { ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) };

  let origin = null;
  try {
    const u = new URL(tab.url);
    if (u.protocol === 'http:' || u.protocol === 'https:') origin = u.origin;
  } catch (_) {}

  // 1) HTTP cache + Cache Storage + service workers
  const cacheTypes = { cache: true, cacheStorage: true, serviceWorkers: true };
  if (settings.cacheScope === 'all' || !origin) {
    await chrome.browsingData.remove({ since: 0 }, { cache: true });
    if (origin) await chrome.browsingData.remove({ since: 0, origins: [origin] }, { cacheStorage: true, serviceWorkers: true });
  } else {
    await chrome.browsingData.remove({ since: 0, origins: [origin] }, cacheTypes);
  }

  // 2) Optional site data — always limited to this site only
  if (origin && (settings.clearCookies || settings.clearStorage)) {
    const siteTypes = {};
    if (settings.clearCookies) siteTypes.cookies = true;
    if (settings.clearStorage) Object.assign(siteTypes, { localStorage: true, indexedDB: true, fileSystems: true });
    await chrome.browsingData.remove({ since: 0, origins: [origin] }, siteTypes);
  }

  const what = [settings.cacheScope === 'all' ? 'All cache' : 'Site cache'];
  if (settings.clearCookies) what.push('cookies');
  if (settings.clearStorage) what.push('storage');
  await patchSession('toasts', tab.id, `✓ ${what.join(' + ')} cleared`);
  await chrome.tabs.reload(tab.id, { bypassCache: true });
}

/* ---------- messaging with the page ---------- */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tab = sender.tab;
  const tabId = tab && tab.id;
  (async () => {
    switch (msg && msg.type) {
      case 'init': {
        const overrides = await getSession('overrides');
        const toasts = await getSession('toasts');
        const toast = toasts[tabId] || null;
        if (toast) await patchSession('toasts', tabId, null);
        return { override: overrides[tabId] || null, toast };
      }
      case 'setOverride':
        await patchSession('overrides', tabId, msg.value || null);
        return { ok: true };
      case 'clearCache':
        await clearCache(tab);
        return { ok: true };
      default:
        return { ok: false, error: 'Unknown message' };
    }
  })().then(sendResponse, (err) => sendResponse({ ok: false, error: String((err && err.message) || err) }));
  return true;
});

async function sendToTab(tabId, msg) {
  try {
    return await chrome.tabs.sendMessage(tabId, msg);
  } catch (_) {
    // Page was open before the extension was installed/updated — inject and retry.
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
      return await chrome.tabs.sendMessage(tabId, msg);
    } catch (_) {
      return null; // chrome:// pages, Web Store, PDF viewer etc. can't be scripted
    }
  }
}

/* ---------- toolbar icon + keyboard shortcuts ---------- */

chrome.action.onClicked.addListener((tab) => {
  if (tab && tab.id !== undefined) sendToTab(tab.id, { type: 'togglePill' });
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (!tab) [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id === undefined) return;
  if (command === 'toggle-pill') sendToTab(tab.id, { type: 'togglePill' });
  if (command === 'toggle-dark') sendToTab(tab.id, { type: 'toggleDark' });
});

/* ---------- housekeeping ---------- */

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await patchSession('overrides', tabId, null);
  await patchSession('toasts', tabId, null);
});

// Show the pill straight away in tabs that were already open at install/update time.
chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  for (const t of tabs) {
    if (!t.id || !t.url || !/^(https?|file):/.test(t.url)) continue;
    chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['content.js'] }).catch(() => {});
  }
});
