// index.js
const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  ipcMain,
  Notification,
} = require("electron");
const path = require("path");
const fs = require("fs");
const SSRSService = require("./ssrs-service");

let win;
let tray;
let ssrsService;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });
}

async function measureNaturalContentHeight() {
  if (!win) return null;
  try {
    const h = await win.webContents.executeJavaScript(`(() => {
      const html = document.documentElement;
      const body = document.body;
      const main = document.querySelector('main.card');
      if (!main) return Math.ceil(document.scrollingElement?.scrollHeight || body.scrollHeight || 520);
      const prevHtmlH = html.style.height;
      const prevBodyH = body.style.height;
      const prevMainMinH = main.style.minHeight;
      html.style.height = 'auto';
      body.style.height = 'auto';
      main.style.minHeight = '0';
      const height = Math.ceil(main.scrollHeight);
      html.style.height = prevHtmlH;
      body.style.height = prevBodyH;
      main.style.minHeight = prevMainMinH;
      return height;
    })()`);
    return h;
  } catch {
    return null;
  }
}

async function fitToContentHeight() {
  const natural = await measureNaturalContentHeight();
  if (!natural || !win) return;
  const [contentWidth] = win.getContentSize();
  const targetHeight = Math.max(300, Math.min(natural, 900));
  win.setContentSize(contentWidth, targetHeight);
}

function createWindow() {
  win = new BrowserWindow({
    width: 620,
    height: 520,
    minWidth: 480,
    minHeight: 300,
    backgroundColor: "#0f1221",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    autoHideMenuBar: true,
    useContentSize: true,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  win.loadFile(path.join(__dirname, "index.html"));

  // Shrink initial window height to fit content (avoid bottom gap)
  win.webContents.once("did-finish-load", async () => {
    await fitToContentHeight();
    setTimeout(fitToContentHeight, 200);
  });

  win.on("close", (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      win.hide();
    }
  });
}

function createTray() {
  console.log("Creating tray icon...");

  // start with a neutral icon; we’ll swap it right away
  const baseSvg = `
    <svg width="16" height="16" xmlns="http://www.w3.org/2000/svg">
      <rect width="16" height="16" fill="#7aa2ff"/>
      <circle cx="8" cy="8" r="4" fill="#ffffff"/>
    </svg>`;
  const baseImg = nativeImage.createFromDataURL(
    `data:image/svg+xml;utf8,${encodeURIComponent(baseSvg)}`
  );

  try {
    tray = new Tray(baseImg);
    refreshTrayRemaining("08:00", leaveForToday || "17:45"); // or your real values
    tray.setToolTip("My Leave Time33");
    console.log("Tray created successfully");
  } catch (error) {
    console.error("Failed to create tray:", error);
    return;
  }

  const contextMenu = Menu.buildFromTemplate([
    { label: "Show/Hide", click: toggleWindow },
    { type: "separator" },
    { 
      label: "Use Current Time", 
      click: () => {
        if (win && win.webContents) {
          win.webContents.send("tray:use-now");
        }
      }
    },
    { 
      label: "Set to 08:00", 
      click: () => {
        if (win && win.webContents) {
          win.webContents.send("tray:set-0800");
        }
      }
    },
    { 
      label: "Fetch from SSRS", 
      click: () => {
        if (win && win.webContents) {
          win.webContents.send("tray:fetch-ssrs");
        }
      }
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.isQuiting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);

  tray.on("click", toggleWindow);
  tray.on("double-click", toggleWindow);
}

function toggleWindow() {
  if (!win) return;
  if (win.isVisible()) {
    win.hide();
  } else {
    win.show();
    win.focus();
  }
}

let leaveForToday = null;
let remainingTimer = null;
let notifyThresholdMin = 0;
let hasNotifiedForCurrentLeave = false;
let notifiedLeaveTime = null;

async function createTrayIconWithText(text) {
  try {
    const img = await renderTextToNativeImage(text);
    if (!img || img.isEmpty()) {
      console.error("Rendered tray image is empty");
    }
    return img || nativeImage.createEmpty();
  } catch (e) {
    console.error("createTrayIconWithText failed:", e);
    return nativeImage.createEmpty();
  }
}

function minutesUntil(leaveHHmm) {
  if (!leaveHHmm) return null;
  const [lh, lm] = leaveHHmm.split(":").map(Number);
  const now = new Date();
  const leave = new Date(now);
  leave.setHours(lh, lm, 0, 0);
  const diffMin = Math.round((leave - now) / 60000);
  return Math.max(0, diffMin); // clamp at 0
}

function formatRemaining(mins) {
  if (mins == null) return "";
  const m = Math.max(0, mins);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h > 0 ? `${h}h ${mm}m` : `${mm}m`;
}

let lastDisplayText = null;

async function refreshTrayRemaining(start, leave) {
  if (!tray) return;

  const mins = minutesUntil(leave);
  const remaining = formatRemaining(mins);

  tray.setToolTip(
    `Start: ${start}  →  Leave: ${leave}\nRemaining: ${remaining}`
  );

  let displayText = "0m";
  if (Number.isFinite(mins) && mins > 0) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    displayText = h > 0 ? `${h}h` : `${m}m`;
  }

  if (displayText !== lastDisplayText) {
    const img = await createTrayIconWithText(displayText);
    const sz = img.getSize();
    console.log("Setting tray image", displayText, sz);
    tray.setImage(img);
    lastDisplayText = displayText;
  }

  if (process.platform === "darwin") {
    try {
      tray.setTitle(displayText);
    } catch {}
  }
}

let iconRendererWin = null;
let rendering = false;

async function initIconRenderer() {
  if (iconRendererWin) return;

  iconRendererWin = new BrowserWindow({
    width: 48,
    height: 48,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: {
      offscreen: true,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const html = `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          html, body { margin:0; padding:0; width:48px; height:48px; background:transparent; }
          .chip {
            width:48px; height:48px; 
            border-radius:12px;
            display:flex; align-items:center; justify-content:center;
            font: 700 22px "Segoe UI", system-ui, Arial;
            color:#fff; background:#2D2D2D;
          }
        </style>
      </head>
      <body>
        <div id="chip" class="chip">0m</div>
      </body>
    </html>
  `;
  await iconRendererWin.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
  );
}

async function renderTextToNativeImage(text) {
  await initIconRenderer();
  if (!iconRendererWin) throw new Error("iconRendererWin not ready");

  if (rendering) return null; // simple lock to avoid overlap
  rendering = true;
  try {
    // Set the text
    await iconRendererWin.webContents.executeJavaScript(
      `document.getElementById('chip').textContent = ${JSON.stringify(
        text || "0m"
      )};`
    );

    // Give layout a tick (very short) — often not strictly required
    await new Promise((r) => setTimeout(r, 10));

    const image = await iconRendererWin.capturePage({
      x: 0,
      y: 0,
      width: 48,
      height: 48,
    });
    // Downscale to 32x32 so Windows tray is happy
    const resized = image.resize({ width: 32, height: 32 });
    return resized;
  } finally {
    rendering = false;
  }
}

function maybeSendLeaveNotification(start, leave) {
  try {
    if (!leave || notifyThresholdMin <= 0) return;
    if (hasNotifiedForCurrentLeave && notifiedLeaveTime === leave) return;
    const mins = minutesUntil(leave);
    if (mins == null) return;
    if (mins <= notifyThresholdMin) {
      const title = "Leave reminder";
      const body = `Leave at ${leave} (${mins} min left)`;
      new Notification({ title, body, silent: false }).show();
      hasNotifiedForCurrentLeave = true;
      notifiedLeaveTime = leave;
    }
  } catch (err) {
    console.error("Failed to show leave notification:", err);
  }
}

// Lightweight renderer auto-reload for index.html changes
function setupRendererAutoReload() {
  try {
    const target = path.join(__dirname, "index.html");
    let debounce;
    fs.watch(target, { persistent: false }, (eventType) => {
      if (eventType !== "change") return;
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (win && !win.isDestroyed()) {
          try {
            console.log("index.html changed -> reloading renderer");
            win.webContents.reloadIgnoringCache();
          } catch (e) {
            console.error("Failed to reload renderer:", e);
          }
        }
      }, 120);
    });
  } catch (e) {
    console.error("setupRendererAutoReload failed:", e);
  }
}

// SSRS IPC Handlers
ipcMain.handle("test-ssrs-connection", async (event, config) => {
  try {
    if (!ssrsService) {
      ssrsService = new SSRSService();
    }
    ssrsService.configure(config);
    return await ssrsService.testConnection();
  } catch (error) {
    console.error("SSRS connection test failed:", error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle("fetch-entrance-time", async (event, config) => {
  try {
    if (!ssrsService) {
      ssrsService = new SSRSService();
    }
    ssrsService.configure(config);
    return await ssrsService.fetchEntranceTime(config.employeeId);
  } catch (error) {
    console.error("SSRS fetch entrance time failed:", error);
    return { success: false, message: error.message };
  }
});

ipcMain.on("update-leave-time", (_evt, payload) => {
  const { start, leave, notifyBeforeMin } = payload || {};
  if (!start || !leave) return;

  const threshold = Number.isFinite(notifyBeforeMin) ? notifyBeforeMin : 0;
  notifyThresholdMin = Math.max(0, threshold);

  if (leaveForToday !== leave) {
    hasNotifiedForCurrentLeave = false;
    notifiedLeaveTime = leave;
  }
  leaveForToday = leave;

  // fire-and-forget
  refreshTrayRemaining(start, leave);
  maybeSendLeaveNotification(start, leave);

  if (remainingTimer) clearInterval(remainingTimer);
  remainingTimer = setInterval(
    () => {
      refreshTrayRemaining(start, leaveForToday);
      maybeSendLeaveNotification(start, leaveForToday);
    },
    60 * 1000
  );
});

// Renderer can request a fit-to-content reflow (e.g., after page switch)
ipcMain.on('fit-to-content', () => {
  fitToContentHeight();
  setTimeout(fitToContentHeight, 100);
});

// Test notification IPC
ipcMain.handle('notify-test', async (_evt, payload) => {
  const threshold = Number.isFinite(payload?.threshold) ? payload.threshold : 0;
  const leave = typeof payload?.leave === 'string' ? payload.leave : leaveForToday;
  const title = 'Test notification';
  const subtitle = threshold > 0 ? `Threshold: ${threshold} min` : 'Threshold: Off';
  const body = leave ? `Current leave time: ${leave}` : 'No leave time calculated yet';
  try {
    new Notification({ title, subtitle, body, silent: false }).show();
    return { success: true };
  } catch (e) {
    return { success: false, message: e?.message || 'Failed to show notification' };
  }
});

app.whenReady().then(() => {
  createWindow();
  createTray();
  setupRendererAutoReload();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
  }
});

app.on("activate", () => {
  if (!BrowserWindow.getAllWindows().length) createWindow();
});
