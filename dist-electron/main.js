import { app, BrowserWindow, ipcMain, dialog } from "electron";
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
function getConfigPath() {
  return path.join(app.getPath("userData"), "config.json");
}
async function readConfig() {
  const configPath = getConfigPath();
  try {
    const raw = await fs.readFile(configPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
async function writeConfig(config) {
  const configPath = getConfigPath();
  const dir = path.dirname(configPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
}
async function setMinecraftDir(minecraftDir) {
  const current = await readConfig();
  const next = {
    ...current,
    minecraftDir
  };
  await writeConfig(next);
  return next;
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
  ipcMain.handle("mc:getSavedMinecraftDir", async () => {
    var _a;
    const config = await readConfig();
    if ((_a = config.minecraftDir) == null ? void 0 : _a.trim()) {
      return config.minecraftDir;
    }
    return getDefaultMinecraftDir();
  });
  ipcMain.handle("mc:pickMinecraftDir", async () => {
    const result = await dialog.showOpenDialog({
      title: "Select Minecraft installation folder",
      properties: ["openDirectory"]
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    const selectedDir = result.filePaths[0];
    await setMinecraftDir(selectedDir);
    return selectedDir;
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
