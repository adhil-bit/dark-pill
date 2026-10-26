# 🌙 Dark Pill

A small Chrome extension that adds a floating pill to every web page with:

| Button | What it does |
| --- | --- |
| ☀️ / 🌙 | Switch the site between light and dark mode (each site remembers its own choice) |
| ↻ | Refresh the page |
| 🧹 | Clear the site's cache and hard-reload |
| × | Hide the pill on this tab |

You can also put **🌓 Theme · ↻ Refresh · 🧹 Clear cache** in your **bookmarks bar** instead of the floating pill.

---

## 📥 Install in Chrome

### Step 1: Download

1. Open **https://github.com/adhil-bit/dark-pill**
2. Click the green **`<> Code`** button, then **Download ZIP**
3. Unzip the downloaded file. You'll get a folder called **`dark-pill-main`**

> Using git? Run `git clone https://github.com/adhil-bit/dark-pill.git` instead.

> ⚠️ Keep this folder somewhere permanent (for example, `Documents/dark-pill-main`). Chrome loads the extension from this folder, so deleting or moving it removes the extension.

### Step 2: Load into Chrome

1. Open a new tab and go to **`chrome://extensions`**
2. Turn on **Developer mode** (the toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the **`dark-pill-main`** folder, the one that contains `manifest.json`, and click **Select**

✅ **Dark Pill** now appears in your extensions list, and the pill shows on every open tab.

### Step 3: Pin the icon (recommended)

1. Click the 🧩 **puzzle icon** in Chrome's toolbar
2. Click the 📌 **pin** next to **Dark Pill**

The 🌙 moon icon now sits in your toolbar. Click it any time to show or hide the pill on the current tab.

---

## 🔖 Optional: put the buttons in your bookmarks bar

1. Right-click the 🌙 toolbar icon and choose **Options**
2. Under **Bookmarks bar**, click **Add to bookmarks bar**
3. If you can't see the bookmarks bar, press **Ctrl + Shift + B** (Mac: **⌘ + Shift + B**)

This adds **🌓 Theme**, **↻ Refresh** and **🧹 Clear cache** to the left of the bookmarks bar and hides the floating pill. To undo it, click **Remove** on the same page and the pill comes back.

---

## 🖱️ How to use

| I want to… | Do this |
| --- | --- |
| Turn dark mode on/off | Click ☀️ / 🌙 on the pill, click **🌓 Theme** in the bookmarks bar, or press **Alt + Shift + N** |
| Refresh | Click ↻ |
| Clear cache + hard reload | Click 🧹. A message confirms when it's done |
| Hide the pill on this tab | Click × |
| Bring the pill back | Click the 🌙 toolbar icon or press **Alt + Shift + D** |
| Move the pill | Drag it anywhere. It remembers the spot |

---

## ⚙️ Settings

Right-click the 🌙 toolbar icon and choose **Options**:

- **Show the pill on every page**: on or off
- **Default mode** for sites you haven't set: Light or Dark
- **What the clear-cache button clears**: this site only (default) or the whole browser cache
- **Also clear local storage / cookies** for the site. Clearing cookies will log you out of that site
- **Sites with a saved choice**: see and reset per-site dark/light settings
- **Keyboard shortcuts**: click **Change** to pick your own keys

---

## 🔄 Updating to a new version

1. Download the latest ZIP from GitHub again (Step 1)
2. Replace the files in your existing `dark-pill-main` folder with the new ones
3. Go to **`chrome://extensions`** and click the **↻ reload** icon on the Dark Pill card

Your settings and per-site choices are kept.

---

## 🛠️ Troubleshooting

| Problem | Fix |
| --- | --- |
| **"Manifest file is missing or unreadable"** | You selected the wrong folder. Pick the folder that has `manifest.json` directly inside it (not a parent folder). |
| **"Could not load icon"** | The `icons` folder is missing. Make sure `icons/` with all 4 PNG files is inside the extension folder. |
| Pill doesn't show on a page | Chrome doesn't allow extensions on `chrome://` pages, the Chrome Web Store or the new-tab page. On normal sites, reload the tab once. |
| Pill doesn't show on local `file://` pages | On `chrome://extensions`, open Dark Pill's **Details** and turn on **Allow access to file URLs**. |
| 🧹 takes a few seconds | Clearing a large cache is slow in Chrome. The page hard-reloads after about 4 seconds and Chrome finishes clearing in the background. |
| A site already has its own dark theme | Use ☀️ on that site. Dark Pill would otherwise flip it back to light. |
| Images look slightly off in dark mode | Dark mode works by inverting the page, so very bright colours in images can shift a little. |

---

## 🔐 Permissions

| Permission | Why it's needed |
| --- | --- |
| Read and change data on all sites | To show the pill and apply dark mode on every page |
| Browsing data | For the 🧹 clear-cache button |
| Bookmarks | Only used when you click **Add to bookmarks bar** |
| Storage | To remember your settings and per-site choices |

Nothing is sent anywhere. All settings stay in your browser.

---

## 📁 Files

```
dark-pill/
├── manifest.json     Extension settings (Manifest V3)
├── background.js     Cache clearing, toolbar icon, shortcuts
├── content.js        Dark mode + the floating pill on each page
├── options.html      Settings page
├── options.js        Settings page logic + bookmarks-bar buttons
├── icons/            icon16.png, icon32.png, icon48.png, icon128.png
└── README.md
```
