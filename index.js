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

let win;
let tray; 

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

function createWindow() {
  win = new BrowserWindow({
    width: 820,
    height: 520,
    minWidth: 480,
    minHeight: 380,
    backgroundColor: "#0f1221",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  win.loadFile(path.join(__dirname, "index.html"));

  win.on("close", (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      win.hide();
    }
  });
}

function createTray() {
  const iconPath = path.join(
    __dirname,
    "assets",
    process.platform === "darwin" ? "trayTemplate.png" : "tray.png"
  );

  let image;
  try {
    image = nativeImage.createFromPath(iconPath);
  } catch {
    image = nativeImage.createEmpty();
  }

  tray = new Tray(image);
  tray.setToolTip("My Leave Time");

  const contextMenu = Menu.buildFromTemplate([
    { label: "Show/Hide", click: toggleWindow },
    { type: "separator" },
    {
      label: "Use current time (clamped)",
      click: () => win?.webContents.send("tray:use-now"),
    },
    {
      label: "Set to 08:00",
      click: () => win?.webContents.send("tray:set-0800"),
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

function minutesUntil(leaveHHmm) {
  if (!leaveHHmm) return null;
  const [lh, lm] = leaveHHmm.split(":").map(Number);
  const now = new Date();
  const leave = new Date(now);
  leave.setHours(lh, lm, 0, 0);
  return Math.round((leave - now) / 60000);
}

function formatRemaining(mins) {
  if (mins == null) return "";
  if (mins <= 0) return "0m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function refreshTrayRemaining(start, leave) {
  if (!tray) return;
  const mins = minutesUntil(leave);
  const remaining = formatRemaining(mins);
  tray.setToolTip(
    `Start: ${start}  →  Leave: ${leave}\nRemaining: ${remaining}`
  );
  try {
    tray.setTitle?.(`${remaining}`);
  } catch {}
}

ipcMain.on("update-leave-time", (_evt, payload) => {
  const { start, leave } = payload || {};
  if (!start || !leave) return;

  leaveForToday = leave;

  refreshTrayRemaining(start, leave);

  if (remainingTimer) clearInterval(remainingTimer);
  remainingTimer = setInterval(
    () => refreshTrayRemaining(start, leaveForToday),
    30 * 1000
  );
});

app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
  }
});

app.on("activate", () => {
  if (!BrowserWindow.getAllWindows().length) createWindow();
});