const $ = (id) => document.getElementById(id);
const DEFAULTS = { showPill: true, defaultMode: 'light', cacheScope: 'site', clearCookies: false, clearStorage: false, sites: {} };

let savedTimer = 0;
function flashSaved() {
  $('saved').classList.add('show');
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => $('saved').classList.remove('show'), 1200);
}

async function load() {
  const s = { ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) };
  $('showPill').checked = s.showPill !== false;
  $('defaultMode').value = s.defaultMode;
  $('cacheScope').value = s.cacheScope;
  $('clearCookies').checked = !!s.clearCookies;
  $('clearStorage').checked = !!s.clearStorage;
  renderSites(s.sites || {});
}

function renderSites(sites) {
  const list = $('sites');
  list.textContent = '';
  const entries = Object.entries(sites).sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'None yet — use the sun/moon on any page.';
    list.appendChild(li);
    return;
  }
  for (const [host, mode] of entries) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = host;
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = mode;
    name.appendChild(tag);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'link';
    btn.textContent = 'Forget';
    btn.addEventListener('click', async () => {
      const { sites: cur = {} } = await chrome.storage.local.get('sites');
      delete cur[host];
      await chrome.storage.local.set({ sites: cur });
      renderSites(cur);
      flashSaved();
    });
    li.append(name, btn);
    list.appendChild(li);
  }
}

for (const id of ['showPill', 'clearCookies', 'clearStorage']) {
  $(id).addEventListener('change', async (e) => { await chrome.storage.local.set({ [id]: e.target.checked }); flashSaved(); });
}
for (const id of ['defaultMode', 'cacheScope']) {
  $(id).addEventListener('change', async (e) => { await chrome.storage.local.set({ [id]: e.target.value }); flashSaved(); });
}
$('resetPos').addEventListener('click', async () => { await chrome.storage.local.set({ pos: { x: 1, y: 1 } }); flashSaved(); });
$('shortcuts').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.sites) renderSites(changes.sites.newValue || {});
});

load();
