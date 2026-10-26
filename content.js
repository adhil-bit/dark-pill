/* Dark Pill — content script
 * Injects a small floating pill (light/dark toggle, refresh, clear cache, close)
 * into every page, and applies a filter-based dark mode remembered per site.
 */
(() => {
  'use strict';

  const HOST_ID = 'dark-pill-host';
  const STYLE_ID = 'dark-pill-style';
  // Page: invert + rotate hues back, then soften so white becomes ~#101010, not pure black.
  const FILTER_PAGE = 'invert(1) hue-rotate(180deg) contrast(0.88)';
  // Media: flip back to original colours (left slightly dimmed, which suits dark mode).
  const FILTER_MEDIA = 'invert(1) hue-rotate(180deg)';
  // The pill itself: exact undo so it keeps its own look.
  const FILTER_UNDO = 'invert(1) hue-rotate(180deg) contrast(1.1364)';
  const MARGIN = 16;

  // If an older copy of this script is running in this page (extension updated /
  // re-injected), shut it down and remove its leftovers before starting fresh.
  try { window.__darkPill && window.__darkPill.destroy && window.__darkPill.destroy(); } catch (_) {}
  document.getElementById(HOST_ID)?.remove();
  document.getElementById(STYLE_ID)?.remove();

  const site = location.hostname || location.protocol; // "example.com" or "file:"

  const state = {
    dark: false,
    fullscreen: false,
    bg: '#ffffff',      // colour painted behind the page before inverting
    forceBg: false,     // true when the page's <html> has no background of its own
    showPill: true,     // global setting
    override: null,     // per-tab: 'shown' | 'hidden' | null
    pos: { x: 1, y: 1 } // 0..1 ratios across the viewport (1,1 = bottom-right)
  };

  let styleEl = null;
  let host = null;
  let ui = null;
  let observer = null;
  let destroyed = false;
  let toastTimer = 0;
  let resolveReady;
  const ready = new Promise((r) => (resolveReady = r));

  const alive = () => {
    try { return !destroyed && !!(chrome.runtime && chrome.runtime.id); } catch (_) { return false; }
  };

  const send = (msg) => new Promise((resolve) => {
    if (!alive()) return resolve(null);
    try {
      chrome.runtime.sendMessage(msg, (res) => { void chrome.runtime.lastError; resolve(res ?? null); });
    } catch (_) { resolve(null); }
  });

  const isVisible = () => (state.override ? state.override === 'shown' : state.showPill);

  /* ------------------------------------------------------------------ */
  /* Dark mode stylesheet                                                */
  /* ------------------------------------------------------------------ */

  function darkCss() {
    const bgRule = state.forceBg
      ? `html { background-color: ${state.bg} !important; }`
      : `:where(html) { background-color: ${state.bg}; }`;
    return `@media screen {
${bgRule}
html { filter: ${FILTER_PAGE} !important; }
img, video, canvas, embed, object,
iframe[src*="youtube.com"], iframe[src*="youtube-nocookie.com"], iframe[src*="vimeo.com"], iframe[src*="google.com/maps"],
:not(html):not(body)[style*="background-image"] { filter: ${FILTER_MEDIA} !important; }
[style*="background-image"] :is(img, video, canvas) { filter: none !important; }
dialog:modal { filter: ${FILTER_PAGE} !important; }
}
@media screen {
[popover]:popover-open { filter: ${FILTER_PAGE} !important; }
}`;
  }

  // Top-layer elements (modal <dialog>, popovers) render outside <html>'s filter,
  // so they get the page filter applied directly (rules above). The pill gets an
  // inline exact-undo filter because its inline `all: initial` would beat a stylesheet rule.
  function syncHostFilter() {
    if (!host) return;
    const on = state.dark && !state.fullscreen;
    host.style.setProperty('filter', on ? FILTER_UNDO : 'none', 'important');
  }

  function placeStyle() {
    if (!styleEl) return;
    const parent = document.head || document.documentElement;
    if (parent && styleEl.parentNode !== parent) parent.appendChild(styleEl);
  }

  function syncStyle() {
    const on = state.dark && !state.fullscreen;
    if (on) {
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = STYLE_ID;
      }
      const css = darkCss();
      if (styleEl.textContent !== css) styleEl.textContent = css;
      placeStyle();
    } else if (styleEl) {
      styleEl.remove();
      styleEl = null;
    }
    syncHostFilter();
  }

  const isTransparent = (c) => !c || c === 'transparent' || /^rgba\(.*[,/]\s*0\)$/.test(c);

  // Work out what colour sits behind the page so inverting it gives a dark canvas.
  function measureBackground() {
    if (!document.body) return;
    const sheet = styleEl && styleEl.sheet;
    if (sheet) sheet.disabled = true;
    const htmlBg = getComputedStyle(document.documentElement).backgroundColor;
    const bodyBg = getComputedStyle(document.body).backgroundColor;
    if (sheet) sheet.disabled = false;
    const nextForce = isTransparent(htmlBg);
    const nextBg = isTransparent(bodyBg) ? '#ffffff' : bodyBg;
    if (nextForce !== state.forceBg || nextBg !== state.bg) {
      state.forceBg = nextForce;
      state.bg = nextBg;
      syncStyle();
    }
  }

  /* ------------------------------------------------------------------ */
  /* Pill UI (closed shadow DOM so page CSS can't touch it)              */
  /* ------------------------------------------------------------------ */

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const ICONS = {
    sun: [
      ['circle', { cx: 12, cy: 12, r: 4 }],
      ['path', { d: 'M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4' }]
    ],
    moon: [
      ['path', { d: 'M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.8 6.8 0 0 0 10.7 10.7z' }]
    ],
    refresh: [
      ['path', { d: 'M20.5 12a8.5 8.5 0 1 1-2.5-6l2.5 2.4' }],
      ['path', { d: 'M20.5 3.5v4.9h-4.9' }]
    ],
    broom: [
      ['path', { d: 'M20.5 3.5l-6.6 6.6' }],
      ['path', { d: 'M11.6 9.1l3.3 3.3' }],
      ['path', { d: 'M11.6 9.1C9.2 9.7 6.6 11.4 4 14c1.2 2.9 3.1 4.8 6 6 2.6-2.6 4.3-5.2 4.9-7.6' }],
      ['path', { d: 'M7.4 16.6l2.1-2.1' }]
    ],
    close: [
      ['path', { d: 'M17 7L7 17M7 7l10 10' }]
    ]
  };

  function icon(name) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    for (const [tag, attrs] of ICONS[name]) {
      const el = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
      svg.appendChild(el);
    }
    return svg;
  }

  function button(cls, title, iconName) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.appendChild(icon(iconName));
    return b;
  }

  const SHADOW_CSS = `
:host { all: initial; }
.pill {
  position: relative;
  display: flex; align-items: center; gap: 2px;
  padding: 4px;
  background: #161616;
  border: 1px solid #2a2a2a;
  border-radius: 999px;
  box-shadow: 0 8px 24px rgba(0,0,0,.35), 0 1px 0 rgba(255,255,255,.05) inset;
  font: 12px/1.2 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #8f8f8f;
  user-select: none; -webkit-user-select: none;
  cursor: grab; touch-action: none;
}
.pill.dragging { cursor: grabbing; }
.seg { display: flex; gap: 2px; padding: 2px; border-radius: 999px; background: #0f0f0f; }
button {
  all: unset; box-sizing: border-box;
  display: grid; place-items: center;
  width: 30px; height: 30px; border-radius: 999px;
  color: #8a8a8a; cursor: pointer;
  transition: background-color .15s ease, color .15s ease, transform .1s ease;
}
button:hover { color: #f0f0f0; background: rgba(255,255,255,.07); }
button:active { transform: scale(.92); }
button:focus-visible { outline: 2px solid #6b8cff; outline-offset: 1px; }
.seg button { width: 28px; height: 28px; }
.seg button.active {
  color: #f5f5f5; background: #2e2e2e;
  box-shadow: 0 1px 0 rgba(255,255,255,.07) inset, 0 1px 3px rgba(0,0,0,.5);
}
.act { width: 28px; height: 28px; }
.close:hover { color: #ff8a8a; background: rgba(255,90,90,.12); }
.sep { width: 1px; height: 18px; margin: 0 3px; background: #2c2c2c; }
svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; pointer-events: none; }
.close svg { width: 14px; height: 14px; }
.busy svg { animation: dp-spin .8s linear infinite; }
@keyframes dp-spin { to { transform: rotate(360deg); } }
.toast {
  position: absolute; right: 0; bottom: calc(100% + 8px);
  padding: 6px 10px; border-radius: 8px;
  background: #1b1b1b; color: #ededed; border: 1px solid #2c2c2c;
  box-shadow: 0 6px 18px rgba(0,0,0,.35);
  white-space: nowrap; pointer-events: none;
  opacity: 0; transform: translateY(4px); transition: opacity .18s ease, transform .18s ease;
}
.toast.below { bottom: auto; top: calc(100% + 8px); transform: translateY(-4px); }
.toast.show { opacity: 1; transform: none; }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
@media print { :host { display: none !important; } }
`;

  function buildPill() {
    host = document.createElement('dark-pill-root');
    host.id = HOST_ID;
    const hs = host.style;
    const hostCss = {
      all: 'initial', position: 'fixed', display: 'block', 'z-index': '2147483647',
      left: '-9999px', top: '-9999px', margin: '0', padding: '0', border: '0',
      width: 'auto', height: 'auto', 'pointer-events': 'auto', 'color-scheme': 'dark'
    };
    for (const [k, v] of Object.entries(hostCss)) hs.setProperty(k, v, 'important');

    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = SHADOW_CSS;

    const pill = document.createElement('div');
    pill.className = 'pill';
    pill.setAttribute('role', 'toolbar');
    pill.setAttribute('aria-label', 'Dark Pill');

    const seg = document.createElement('div');
    seg.className = 'seg';
    const sun = button('sun', 'Light mode', 'sun');
    const moon = button('moon', 'Dark mode (this site)', 'moon');
    seg.append(sun, moon);

    const sep = document.createElement('span');
    sep.className = 'sep';

    const refresh = button('act refresh', 'Refresh page', 'refresh');
    const clear = button('act clear', 'Clear cache & hard reload', 'broom');
    const close = button('act close', 'Hide pill on this tab (toolbar icon or Alt+Shift+D brings it back)', 'close');

    const toastEl = document.createElement('div');
    toastEl.className = 'toast';
    toastEl.setAttribute('role', 'status');

    pill.append(seg, sep, refresh, clear, close, toastEl);
    shadow.append(style, pill);

    ui = { pill, sun, moon, refresh, clear, close, toastEl };

    // --- actions ---
    sun.addEventListener('click', () => setDark(false));
    moon.addEventListener('click', () => setDark(true));
    refresh.addEventListener('click', () => {
      refresh.classList.add('busy');
      location.reload();
    });
    clear.addEventListener('click', async () => {
      if (clear.classList.contains('busy')) return;
      clear.classList.add('busy');
      showToast('Clearing cache…', 10000);
      const res = await send({ type: 'clearCache' });
      if (!res || !res.ok) {
        clear.classList.remove('busy');
        showToast(res && res.error ? 'Could not clear: ' + res.error : 'Could not clear cache', 3500);
      }
      // On success the background reloads the tab.
    });
    close.addEventListener('click', () => setOverride('hidden'));

    // --- drag to move ---
    let drag = null;
    let swallowClick = false;
    pill.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      swallowClick = false;
      const r = host.getBoundingClientRect();
      drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top, w: r.width, h: r.height, moved: false };
      // Listen on window so a fast flick that leaves the pill still drags it.
      window.addEventListener('pointermove', onDragMove, true);
      window.addEventListener('pointerup', endDrag, true);
      window.addEventListener('pointercancel', endDrag, true);
    });
    const onDragMove = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.sx;
      const dy = e.clientY - drag.sy;
      if (!drag.moved) {
        if (Math.hypot(dx, dy) < 5) return;
        drag.moved = true;
        try { pill.setPointerCapture(e.pointerId); } catch (_) {}
        pill.classList.add('dragging');
      }
      const { vw, vh } = viewport();
      const left = clamp(drag.ox + dx, MARGIN, vw - drag.w - MARGIN);
      const top = clamp(drag.oy + dy, MARGIN, vh - drag.h - MARGIN);
      hs.setProperty('left', left + 'px', 'important');
      hs.setProperty('top', top + 'px', 'important');
      e.preventDefault();
    };
    const endDrag = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      window.removeEventListener('pointermove', onDragMove, true);
      window.removeEventListener('pointerup', endDrag, true);
      window.removeEventListener('pointercancel', endDrag, true);
      try { pill.releasePointerCapture(e.pointerId); } catch (_) {}
      if (drag.moved) {
        swallowClick = true;
        pill.classList.remove('dragging');
        const r = host.getBoundingClientRect();
        const { vw, vh } = viewport();
        const maxX = vw - r.width - MARGIN * 2;
        const maxY = vh - r.height - MARGIN * 2;
        state.pos = {
          x: maxX > 0 ? clamp((r.left - MARGIN) / maxX, 0, 1) : 1,
          y: maxY > 0 ? clamp((r.top - MARGIN) / maxY, 0, 1) : 1
        };
        if (alive()) chrome.storage.local.set({ pos: state.pos }).catch(() => {});
      }
      drag = null;
    };
    pill.addEventListener('click', (e) => {
      if (swallowClick) { swallowClick = false; e.stopPropagation(); e.preventDefault(); }
    }, true);
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function viewport() {
    const de = document.documentElement;
    const vw = Math.min(window.innerWidth, (de && de.clientWidth) || window.innerWidth);
    const vh = window.innerHeight;
    return { vw, vh };
  }

  function placePill() {
    if (!host || !host.isConnected) return;
    const r = host.getBoundingClientRect();
    const { vw, vh } = viewport();
    const maxX = Math.max(0, vw - r.width - MARGIN * 2);
    const maxY = Math.max(0, vh - r.height - MARGIN * 2);
    const left = MARGIN + state.pos.x * maxX;
    const top = MARGIN + state.pos.y * maxY;
    host.style.setProperty('left', Math.round(left) + 'px', 'important');
    host.style.setProperty('top', Math.round(top) + 'px', 'important');
    if (ui) ui.toastEl.classList.toggle('below', top < 60);
  }

  function renderUi() {
    if (!ui) return;
    ui.sun.classList.toggle('active', !state.dark);
    ui.moon.classList.toggle('active', state.dark);
    ui.sun.setAttribute('aria-pressed', String(!state.dark));
    ui.moon.setAttribute('aria-pressed', String(state.dark));
  }

  function showToast(text, ms = 1800) {
    if (!ui) return;
    ui.toastEl.textContent = text;
    ui.toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui && ui.toastEl.classList.remove('show'), ms);
  }

  function syncPill() {
    const want = isVisible() && !state.fullscreen;
    if (want) {
      if (!document.body) return; // mount once the DOM is ready
      if (!host) buildPill();
      if (!host.isConnected) document.documentElement.appendChild(host);
      syncHostFilter();
      renderUi();
      placePill();
    } else if (host && host.isConnected) {
      host.remove();
    }
  }

  /* ------------------------------------------------------------------ */
  /* State changes                                                       */
  /* ------------------------------------------------------------------ */

  async function setDark(on) {
    state.dark = !!on;
    measureBackground();
    syncStyle();
    renderUi();
    if (!alive()) return;
    try {
      const { sites = {}, defaultMode = 'light' } = await chrome.storage.local.get(['sites', 'defaultMode']);
      const mode = on ? 'dark' : 'light';
      if (mode === defaultMode) delete sites[site]; else sites[site] = mode;
      await chrome.storage.local.set({ sites });
    } catch (_) {}
  }

  function setOverride(value) {
    state.override = value;
    syncPill();
    send({ type: 'setOverride', value });
  }

  function applySettings(data) {
    const sites = data.sites || {};
    const defaultMode = data.defaultMode || 'light';
    state.dark = (sites[site] || defaultMode) === 'dark';
    if (typeof data.showPill === 'boolean') state.showPill = data.showPill;
    if (data.pos && typeof data.pos.x === 'number') state.pos = data.pos;
  }

  /* ------------------------------------------------------------------ */
  /* Listeners                                                           */
  /* ------------------------------------------------------------------ */

  const onStorage = (changes, area) => {
    if (area !== 'local' || !alive()) return;
    if (changes.sites || changes.defaultMode) {
      chrome.storage.local.get(['sites', 'defaultMode']).then((d) => {
        const dark = ((d.sites || {})[site] || d.defaultMode || 'light') === 'dark';
        if (dark !== state.dark) { state.dark = dark; measureBackground(); syncStyle(); renderUi(); }
      }).catch(() => {});
    }
    if (changes.showPill) { state.showPill = changes.showPill.newValue !== false; syncPill(); }
    if (changes.pos && changes.pos.newValue) { state.pos = changes.pos.newValue; placePill(); }
  };

  const onMessage = (msg, _sender, sendResponse) => {
    if (!msg || !msg.type) return;
    ready.then(() => {
      if (msg.type === 'togglePill') setOverride(isVisible() ? 'hidden' : 'shown');
      else if (msg.type === 'toggleDark') setDark(!state.dark);
      else if (msg.type === 'ping') {}
      sendResponse({ ok: true, visible: isVisible(), dark: state.dark });
    });
    return true;
  };

  const onFullscreen = () => {
    state.fullscreen = !!document.fullscreenElement;
    syncStyle();
    syncPill();
  };

  const onResize = () => placePill();

  const onDomReady = () => {
    measureBackground();
    syncStyle();
    syncPill();
    watch();
  };

  function watch() {
    if (observer || !document.documentElement) return;
    observer = new MutationObserver(() => {
      if (!alive()) { destroy(); return; }
      if (styleEl && (!styleEl.isConnected || (document.head && styleEl.parentNode !== document.head))) placeStyle();
      if (host && isVisible() && !state.fullscreen && !host.isConnected) document.documentElement.appendChild(host);
    });
    observer.observe(document.documentElement, { childList: true });
    if (document.head) observer.observe(document.head, { childList: true });
  }

  function destroy() {
    destroyed = true;
    try { observer && observer.disconnect(); } catch (_) {}
    try { styleEl && styleEl.remove(); } catch (_) {}
    try { host && host.remove(); } catch (_) {}
    window.removeEventListener('resize', onResize);
    document.removeEventListener('fullscreenchange', onFullscreen, true);
    document.removeEventListener('DOMContentLoaded', onDomReady);
    window.removeEventListener('load', measureBackground);
    try { chrome.storage.onChanged.removeListener(onStorage); } catch (_) {}
    try { chrome.runtime.onMessage.removeListener(onMessage); } catch (_) {}
    if (window.__darkPill && window.__darkPill.destroy === destroy) delete window.__darkPill;
  }

  window.__darkPill = { destroy };

  /* ------------------------------------------------------------------ */
  /* Boot                                                                */
  /* ------------------------------------------------------------------ */

  chrome.runtime.onMessage.addListener(onMessage);
  chrome.storage.onChanged.addListener(onStorage);
  window.addEventListener('resize', onResize);
  document.addEventListener('fullscreenchange', onFullscreen, true);
  window.addEventListener('load', measureBackground);

  (async () => {
    try {
      const data = await chrome.storage.local.get(['sites', 'defaultMode', 'showPill', 'pos']);
      applySettings(data);
    } catch (_) {}
    syncStyle(); // apply dark mode as early as possible to avoid a white flash

    const init = await send({ type: 'init' });
    if (init) state.override = init.override || null;

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onDomReady, { once: true });
    } else {
      onDomReady();
    }
    resolveReady();

    if (init && init.toast) {
      const showIt = () => { syncPill(); showToast(init.toast, 2200); };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showIt, { once: true });
      else showIt();
    }
  })();
})();
