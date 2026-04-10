import { app, BrowserWindow, ipcMain } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
function getDefaultMinecraftDir() {
  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  return path.join(appData, ".minecraft");
}
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
async function readJsonFile(filePath) {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw);
}
function mapVanillaProfiles(data) {
  return Object.entries(data.profiles ?? {}).map(([id, profile]) => ({
    id,
    name: profile.name ?? id,
    gameDir: profile.gameDir,
    lastVersionId: profile.lastVersionId
  }));
}
async function readVanillaStyleProfiles(mcDir) {
  const launcherProfilesPath = path.join(mcDir, "launcher_profiles.json");
  if (!await fileExists(launcherProfilesPath)) return [];
  const data = await readJsonFile(launcherProfilesPath);
  return mapVanillaProfiles(data);
}
async function readProfiles(mcDir) {
  const vanillaProfiles = await readVanillaStyleProfiles(mcDir);
  if (vanillaProfiles.length > 0) return vanillaProfiles;
  return [];
}
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname$1, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let win;
function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs")
    }
  });
  win.webContents.on("did-finish-load", () => {
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.whenReady().then(() => {
  ipcMain.handle("mc:getDefaultDir", async () => {
    return getDefaultMinecraftDir();
  });
  ipcMain.handle("mc:getProfiles", async (_e, mcDir) => {
    return readProfiles(mcDir);
  });
  createWindow();
});
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
