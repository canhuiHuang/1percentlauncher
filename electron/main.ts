import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { spawn } from "node:child_process";
import { gunzipSync, gzipSync } from "node:zlib";
import dotenv from "dotenv";
import { getDefaultMinecraftDir } from "./services/minecraftPaths";
import {
  readProfiles,
  createProfileForVersion,
  updateProfileVersion,
  updateProfileName,
  updateProfileJavaArgs,
  touchProfileLastUsed,
} from "./services/profiles";
import {
  readConfig,
  setMinecraftDir,
  setOnboardingDismissed,
} from "./services/config";
import { autoUpdater } from "electron-updater";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runtimeEnvPath = app.isPackaged
  ? path.join(path.dirname(process.execPath), ".env")
  : path.resolve(process.cwd(), ".env");

dotenv.config({ path: runtimeEnvPath });

process.env.APP_ROOT = path.join(__dirname, "..");

export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, "public")
  : RENDERER_DIST;

let win: BrowserWindow | null;
let isAutoUpdaterConfigured = false;
let autoUpdaterListenersRegistered = false;

type AppUpdateState =
  | { status: "idle"; message: string; progress: number | null }
  | { status: "disabled"; message: string; progress: number | null }
  | { status: "checking"; message: string; progress: number | null }
  | { status: "available"; message: string; progress: number | null }
  | { status: "downloading"; message: string; progress: number | null }
  | { status: "downloaded"; message: string; progress: number | null }
  | { status: "up-to-date"; message: string; progress: number | null }
  | { status: "error"; message: string; progress: number | null };

let appUpdateState: AppUpdateState = {
  status: "idle",
  message: "Auto-update not checked yet.",
  progress: null,
};
let isUpdateDownloaded = false;
let isUpdateDownloading = false;

const BACKEND_BASE_URL = process.env.BASE;
type InstallForgeProgress =
  | { stage: "searching"; percent: number; message: string }
  | { stage: "downloading"; percent: number; message: string }
  | { stage: "installing"; percent: number; message: string }
  | { stage: "done"; percent: number; message: string }
  | { stage: "error"; percent: number; message: string };

type RequiredForgeInfo = {
  fileName: string;
  forgeVersionId: string;
  downloadUrl?: string;
};

type ServerModInfo = {
  name: string;
  id: string;
  size: number;
  clientModified: string;
  serverModified: string;
  downloadUrl?: string;
};

type ModDownloadInfo = {
  name: string;
  link: string;
};

type NbtTag =
  | { type: 1; value: number }
  | { type: 8; value: string }
  | { type: 9; elementType: 10; value: NbtTag[] }
  | { type: 10; value: Record<string, NbtTag> };

type InstalledModInfo = {
  name: string;
  size: number;
  modified: string;
};

function getMainProcessLogPath() {
  return path.join(app.getPath("userData"), "main.log");
}

async function appendMainLog(message: string) {
  try {
    const line = `[${new Date().toISOString()}] ${message}\n`;
    await fs.appendFile(getMainProcessLogPath(), line, "utf-8");
  } catch {
    // Ignore logging failures.
  }
}

function setAppUpdateState(nextState: AppUpdateState) {
  appUpdateState = nextState;
  win?.webContents.send("app:update-state", nextState);
}

function configureAutoUpdater() {
  if (isAutoUpdaterConfigured) {
    return true;
  }

  if (!app.isPackaged) {
    setAppUpdateState({
      status: "disabled",
      message: "Auto-update is disabled in development builds.",
      progress: null,
    });
    return false;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  isAutoUpdaterConfigured = true;
  return true;
}

function registerAutoUpdaterListeners() {
  if (autoUpdaterListenersRegistered) {
    return;
  }

  autoUpdaterListenersRegistered = true;

  autoUpdater.on("checking-for-update", () => {
    isUpdateDownloaded = false;
    isUpdateDownloading = false;
    setAppUpdateState({
      status: "checking",
      message: "Checking for updates...",
      progress: null,
    });
  });

  autoUpdater.on("update-available", (info) => {
    isUpdateDownloading = false;
    setAppUpdateState({
      status: "available",
      message: `Update ${info.version} is available.`,
      progress: null,
    });
  });

  autoUpdater.on("update-not-available", (info) => {
    isUpdateDownloaded = false;
    isUpdateDownloading = false;
    setAppUpdateState({
      status: "up-to-date",
      message: `App is up to date${info.version ? ` (${info.version})` : "."}`,
      progress: null,
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    isUpdateDownloading = true;
    setAppUpdateState({
      status: "downloading",
      message: `Downloading update... ${Math.round(progress.percent)}%`,
      progress: progress.percent,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    isUpdateDownloaded = true;
    isUpdateDownloading = false;
    setAppUpdateState({
      status: "downloaded",
      message: `Update ${info.version} downloaded. Restart the app to install it.`,
      progress: 100,
    });
  });

  autoUpdater.on("error", (err) => {
    isUpdateDownloaded = false;
    isUpdateDownloading = false;
    setAppUpdateState({
      status: "error",
      message: `Update error: ${err.message}`,
      progress: null,
    });
  });
}

async function checkForAppUpdates() {
  if (!configureAutoUpdater()) {
    return appUpdateState;
  }

  registerAutoUpdaterListeners();
  await autoUpdater.checkForUpdates();
  return appUpdateState;
}

function installDownloadedAppUpdate() {
  if (!isUpdateDownloaded) {
    return false;
  }

  autoUpdater.quitAndInstall();
  return true;
}

async function downloadAppUpdate() {
  if (!configureAutoUpdater()) {
    return false;
  }

  if (isUpdateDownloaded || isUpdateDownloading) {
    return false;
  }

  await autoUpdater.downloadUpdate();
  return true;
}

function sendForgeProgress(payload: InstallForgeProgress) {
  win?.webContents.send("mc:forgeInstallProgress", payload);
}

function getRuntimeRootDir() {
  return app.isPackaged
    ? path.dirname(process.execPath)
    : app.getPath("userData");
}

function createWindow() {
  win = new BrowserWindow({
    width: 960,
    height: 730,
    useContentSize: true,
    resizable: false,
    maximizable: false,
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    icon: path.join(process.env.APP_ROOT, "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
    },
  });

  win.setMenuBarVisibility(false);

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }

  win.webContents.on(
    "did-fail-load",
    async (_event, errorCode, errorDescription, validatedURL) => {
      await appendMainLog(
        `Renderer failed to load: ${errorCode} ${errorDescription} ${validatedURL}`
      );
      console.error("Renderer failed to load:", {
        errorCode,
        errorDescription,
        validatedURL,
      });
    }
  );

  win.webContents.on("render-process-gone", async (_event, details) => {
    await appendMainLog(`Renderer process gone: ${JSON.stringify(details)}`);
    console.error("Renderer process crashed:", details);
  });

  win.webContents.on("console-message", async (_event, level, message) => {
    await appendMainLog(`Renderer console [${level}]: ${message}`);
  });

  win.webContents.once("did-finish-load", () => {
    win?.webContents.send("app:update-state", appUpdateState);
  });
}

function getForgeVersionIdFromInstallerFileName(fileName: string) {
  // forge-1.20.1-47.4.10-installer.jar -> 1.20.1-forge-47.4.10
  const normalized = fileName.replace(/-installer\.jar$/i, "");
  const match = normalized.match(/^forge-([^-]+)-(.+)$/i);

  if (!match) {
    return normalized;
  }

  return `${match[1]}-forge-${match[2]}`;
}

async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(targetPath: string) {
  await fs.mkdir(targetPath, { recursive: true });
}

function getDownloadsDir() {
  return path.join(getRuntimeRootDir(), "downloads");
}

function getTempDir() {
  return path.join(getRuntimeRootDir(), "temp");
}

async function ensureRuntimeDirectories() {
  await Promise.all([ensureDir(getDownloadsDir()), ensureDir(getTempDir())]);
}

async function getMinecraftDirStatus() {
  const config = await readConfig();
  const defaultDir = getDefaultMinecraftDir();
  const defaultExists = await pathExists(defaultDir);
  const savedDir = config.minecraftDir?.trim();

  return {
    minecraftDir: savedDir || defaultDir,
    defaultDir,
    defaultExists,
    hasCustomDir: !!savedDir,
  };
}

async function getProfileById(mcDir: string, profileId: string) {
  const profiles = await readProfiles(mcDir);
  const profile = profiles.find((entry) => entry.id === profileId);

  if (!profile) {
    throw new Error(`Profile not found: ${profileId}`);
  }

  return profile;
}

async function getProfileModsDir(mcDir: string, profileId: string) {
  const profile = await getProfileById(mcDir, profileId);
  const profileDir = profile.gameDir?.trim() || mcDir;

  return path.join(profileDir, "mods");
}

async function getProfileDir(mcDir: string, profileId: string) {
  const profile = await getProfileById(mcDir, profileId);
  return profile.gameDir?.trim() || mcDir;
}

function readNbtString(buffer: Buffer, offset: number) {
  const length = buffer.readUInt16BE(offset);
  const start = offset + 2;
  const end = start + length;

  return {
    value: buffer.toString("utf8", start, end),
    offset: end,
  };
}

function parseNbtPayload(
  buffer: Buffer,
  offset: number,
  type: number
): {
  tag: NbtTag;
  offset: number;
} {
  switch (type) {
    case 1:
      return {
        tag: { type: 1, value: buffer.readInt8(offset) },
        offset: offset + 1,
      };
    case 8: {
      const parsed = readNbtString(buffer, offset);
      return {
        tag: { type: 8, value: parsed.value },
        offset: parsed.offset,
      };
    }
    case 9: {
      const elementType = buffer.readUInt8(offset);
      const length = buffer.readInt32BE(offset + 1);

      if (elementType !== 10) {
        throw new Error(`Unsupported NBT list element type: ${elementType}`);
      }

      let currentOffset = offset + 5;
      const value: NbtTag[] = [];

      for (let index = 0; index < length; index += 1) {
        const parsed = parseNbtPayload(buffer, currentOffset, elementType);
        value.push(parsed.tag);
        currentOffset = parsed.offset;
      }

      return {
        tag: { type: 9, elementType: 10, value },
        offset: currentOffset,
      };
    }
    case 10: {
      const value: Record<string, NbtTag> = {};
      let currentOffset = offset;

      while (true) {
        const childType = buffer.readUInt8(currentOffset);
        currentOffset += 1;

        if (childType === 0) {
          break;
        }

        const name = readNbtString(buffer, currentOffset);
        currentOffset = name.offset;

        const parsed = parseNbtPayload(buffer, currentOffset, childType);
        value[name.value] = parsed.tag;
        currentOffset = parsed.offset;
      }

      return {
        tag: { type: 10, value },
        offset: currentOffset,
      };
    }
    default:
      throw new Error(`Unsupported NBT tag type: ${type}`);
  }
}

function parseNbtRoot(buffer: Buffer) {
  const rootType = buffer.readUInt8(0);

  if (rootType !== 10) {
    throw new Error("Unsupported NBT root type.");
  }

  const rootName = readNbtString(buffer, 1);
  const parsed = parseNbtPayload(buffer, rootName.offset, rootType);

  if (parsed.tag.type !== 10) {
    throw new Error("Invalid NBT root payload.");
  }

  return {
    name: rootName.value,
    value: parsed.tag.value,
  };
}

function writeNbtString(value: string) {
  const payload = Buffer.from(value, "utf8");
  const header = Buffer.alloc(2);
  header.writeUInt16BE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

function writeNbtPayload(tag: NbtTag): Buffer {
  switch (tag.type) {
    case 1:
      return Buffer.from([tag.value & 0xff]);
    case 8:
      return writeNbtString(tag.value);
    case 9: {
      const length = Buffer.alloc(5);
      length.writeUInt8(tag.elementType, 0);
      length.writeInt32BE(tag.value.length, 1);

      return Buffer.concat([
        length,
        ...tag.value.map((entry) => writeNbtPayload(entry)),
      ]);
    }
    case 10: {
      const parts: Buffer[] = [];

      for (const [name, childTag] of Object.entries(tag.value)) {
        parts.push(Buffer.from([childTag.type]));
        parts.push(writeNbtString(name));
        parts.push(writeNbtPayload(childTag));
      }

      parts.push(Buffer.from([0]));
      return Buffer.concat(parts);
    }
  }
}

function readServersFile(raw: Buffer) {
  try {
    return {
      parsed: parseNbtRoot(gunzipSync(raw)),
      isCompressed: true,
    };
  } catch {
    return {
      parsed: parseNbtRoot(raw),
      isCompressed: false,
    };
  }
}

async function getServerIpFromBackend() {
  const res = await fetch(BACKEND_BASE_URL + "/mc/server-ip");

  if (!res.ok) {
    throw new Error(
      `Backend server IP lookup failed: ${res.status} ${await res.text()}`
    );
  }

  const data = (await res.json()) as { ip?: string };

  if (!data.ip?.trim()) {
    throw new Error("Backend did not return a valid server IP.");
  }

  return data.ip.trim();
}

async function addServerToProfileIfMissing(mcDir: string, profileId: string) {
  const profileDir = await getProfileDir(mcDir, profileId);
  const serversPath = path.join(profileDir, "servers.dat");
  const serverIp = await getServerIpFromBackend();
  const serverName = "1Percent Server";

  let rootName = "";
  let rootValue: Record<string, NbtTag> = {};
  let isCompressed = true;

  if (await pathExists(serversPath)) {
    const raw = await fs.readFile(serversPath);
    const readResult = readServersFile(raw);
    rootName = readResult.parsed.name;
    rootValue = readResult.parsed.value;
    isCompressed = readResult.isCompressed;
  }

  const serversTag = rootValue.servers;

  if (
    serversTag?.type === 9 &&
    serversTag.value.some(
      (entry) =>
        entry.type === 10 &&
        entry.value.ip?.type === 8 &&
        entry.value.ip.value.trim().toLowerCase() === serverIp.toLowerCase()
    )
  ) {
    return;
  }

  const serverEntries = serversTag?.type === 9 ? [...serversTag.value] : [];

  serverEntries.push({
    type: 10,
    value: {
      name: { type: 8, value: serverName },
      ip: { type: 8, value: serverIp },
    },
  });

  rootValue.servers = {
    type: 9,
    elementType: 10,
    value: serverEntries,
  };

  const encoded = Buffer.concat([
    Buffer.from([10]),
    writeNbtString(rootName),
    writeNbtPayload({ type: 10, value: rootValue }),
  ]);

  await fs.writeFile(serversPath, isCompressed ? gzipSync(encoded) : encoded);
}

async function profileHasServerIp(mcDir: string, profileId: string) {
  const profileDir = await getProfileDir(mcDir, profileId);
  const serversPath = path.join(profileDir, "servers.dat");

  if (!(await pathExists(serversPath))) {
    return false;
  }

  const serverIp = await getServerIpFromBackend();
  const raw = await fs.readFile(serversPath);
  const parsed = readServersFile(raw).parsed;
  const serversTag = parsed.value.servers;

  return (
    serversTag?.type === 9 &&
    serversTag.value.some(
      (entry) =>
        entry.type === 10 &&
        entry.value.ip?.type === 8 &&
        entry.value.ip.value.trim().toLowerCase() === serverIp.toLowerCase()
    )
  );
}

async function runForgeInstaller(jarPath: string, minecraftDir: string) {
  return await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "java",
      ["-jar", jarPath, "--installClient", minecraftDir],
      {
        windowsHide: true,
      }
    );

    let stderr = "";
    let stdout = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      reject(err);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `Forge installer failed with code ${code}\n${stderr || stdout}`.trim()
        )
      );
    });
  });
}

async function launchMinecraftLauncher() {
  const candidatePaths = [
    path.join(
      process.env.LOCALAPPDATA ?? "",
      "Programs",
      "Minecraft Launcher",
      "MinecraftLauncher.exe"
    ),
    path.join(
      process.env.LOCALAPPDATA ?? "",
      "Microsoft",
      "WindowsApps",
      "MinecraftLauncher.exe"
    ),
    path.join(
      process.env["ProgramFiles"] ?? "",
      "Minecraft Launcher",
      "MinecraftLauncher.exe"
    ),
    path.join(
      process.env["ProgramFiles(x86)"] ?? "",
      "Minecraft Launcher",
      "MinecraftLauncher.exe"
    ),
  ].filter(Boolean);

  for (const candidatePath of candidatePaths) {
    if (!(await pathExists(candidatePath))) {
      continue;
    }

    const errorMessage = await shell.openPath(candidatePath);

    if (!errorMessage) {
      return;
    }
  }

  const appIds = [
    "Microsoft.4297127D64EC6_8wekyb3d8bbwe!Minecraft",
    "Microsoft.4297127D64EC6_8wekyb3d8bbwe!MinecraftLauncher",
    "Microsoft.4297127D64EC6_8wekyb3d8bbwe!App",
  ];

  for (const appId of appIds) {
    const target = `shell:AppsFolder\\${appId}`;
    const child = spawn("cmd.exe", ["/c", "start", "", target], {
      windowsHide: true,
      detached: true,
      stdio: "ignore",
    });

    child.on("error", () => {
      // Try the next known AppUserModelId.
    });

    if (child.pid) {
      child.unref();
      return;
    }
  }

  throw new Error("Unable to launch Minecraft Launcher.");
}

function getTotalSystemMemoryMb() {
  return Math.max(1024, Math.floor(os.totalmem() / (1024 * 1024)));
}

function getDefaultProfileRamMb() {
  return Math.max(1024, Math.floor(getTotalSystemMemoryMb() / 2));
}

function buildJavaArgsWithRam(
  existingJavaArgs: string | undefined,
  ramMb: number
) {
  const ramArg = ramMb % 1024 === 0 ? `-Xmx${ramMb / 1024}G` : `-Xmx${ramMb}M`;
  const normalizedArgs = (existingJavaArgs ?? "").trim();

  if (!normalizedArgs) {
    return `${ramArg} -XX:+UnlockExperimentalVMOptions -XX:+UseG1GC -XX:G1NewSizePercent=20 -XX:G1ReservePercent=20 -XX:MaxGCPauseMillis=50 -XX:G1HeapRegionSize=32M`;
  }

  if (/-Xmx\d+[mMgG]\b/.test(normalizedArgs)) {
    return normalizedArgs.replace(/-Xmx\d+[mMgG]\b/g, ramArg);
  }

  return `${ramArg} ${normalizedArgs}`.trim();
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
  void ensureRuntimeDirectories();
  Menu.setApplicationMenu(null);

  ipcMain.handle("mc:getSavedMinecraftDir", async () => {
    return (await getMinecraftDirStatus()).minecraftDir;
  });

  ipcMain.handle("mc:getAppConfig", async () => {
    return readConfig();
  });

  ipcMain.handle("mc:getMinecraftDirStatus", async () => {
    return getMinecraftDirStatus();
  });

  ipcMain.handle("mc:dismissOnboarding", async () => {
    return setOnboardingDismissed();
  });

  ipcMain.handle(
    "mc:setWindowContentSize",
    async (_e, width: number, height: number) => {
      if (!win) {
        return;
      }

      win.setContentSize(Math.ceil(width), Math.ceil(height));
    }
  );

  ipcMain.handle("mc:minimizeWindow", async () => {
    win?.minimize();
  });

  ipcMain.handle("mc:closeWindow", async () => {
    win?.close();
  });

  ipcMain.handle("app:getUpdateState", async () => {
    return appUpdateState;
  });

  ipcMain.handle("app:checkForUpdates", async () => {
    return checkForAppUpdates();
  });

  ipcMain.handle("app:downloadUpdate", async () => {
    return downloadAppUpdate();
  });

  ipcMain.handle("app:installDownloadedUpdate", async () => {
    return installDownloadedAppUpdate();
  });

  ipcMain.handle("mc:pickMinecraftDir", async () => {
    const result = await dialog.showOpenDialog({
      title: "Select Minecraft installation folder",
      properties: ["openDirectory"],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const selectedDir = result.filePaths[0];
    await setMinecraftDir(selectedDir);

    return selectedDir;
  });

  ipcMain.handle("mc:getProfiles", async (_e, mcDir: string) => {
    return readProfiles(mcDir);
  });

  ipcMain.handle(
    "mc:profileHasServerIp",
    async (_e, mcDir: string, profileId: string) => {
      return profileHasServerIp(mcDir, profileId);
    }
  );

  ipcMain.handle("mc:getSystemMemoryMb", async () => {
    return getTotalSystemMemoryMb();
  });

  ipcMain.handle(
    "mc:openProfileFolder",
    async (_e, mcDir: string, profileId: string) => {
      const profileDir = await getProfileDir(mcDir, profileId);
      await shell.openPath(profileDir);
    }
  );

  ipcMain.handle(
    "mc:updateProfileName",
    async (_e, mcDir: string, profileId: string, profileName: string) => {
      await updateProfileName(mcDir, profileId, profileName);
    }
  );

  ipcMain.handle(
    "mc:updateProfileRamMb",
    async (_e, mcDir: string, profileId: string, ramMb: number) => {
      const profile = await getProfileById(mcDir, profileId);
      await updateProfileJavaArgs(
        mcDir,
        profileId,
        buildJavaArgsWithRam(profile.javaArgs, ramMb)
      );
    }
  );

  ipcMain.handle(
    "mc:launchSelectedProfile",
    async (_e, mcDir: string, profileId: string) => {
      await touchProfileLastUsed(mcDir, profileId);
      await launchMinecraftLauncher();
    }
  );

  async function getForgeInfoFromBackend() {
    const res = await fetch(BACKEND_BASE_URL + "/files/forge");

    if (!res.ok) {
      throw new Error(
        `Backend forge lookup failed: ${res.status} ${await res.text()}`
      );
    }

    const data = await res.json();

    if (!data?.ok || !data?.fileName) {
      throw new Error("Backend did not return a valid forge file.");
    }

    return data as {
      ok: true;
      fileName: string;
      downloadUrl?: string;
    };
  }

  async function getRequiredForgeInfo(): Promise<RequiredForgeInfo> {
    const forgeInfo = await getForgeInfoFromBackend();

    return {
      fileName: forgeInfo.fileName,
      forgeVersionId: getForgeVersionIdFromInstallerFileName(
        forgeInfo.fileName
      ),
      downloadUrl: forgeInfo.downloadUrl,
    };
  }

  async function getServerModsFromBackend(): Promise<ServerModInfo[]> {
    const res = await fetch(BACKEND_BASE_URL + "/files/mods");

    if (!res.ok) {
      throw new Error(
        `Backend mods lookup failed: ${res.status} ${await res.text()}`
      );
    }

    const data = await res.json();

    if (!data?.ok || !Array.isArray(data?.mods)) {
      throw new Error("Backend did not return a valid mods list.");
    }

    return data.mods as ServerModInfo[];
  }

  async function getInstalledModsForProfile(
    mcDir: string,
    profileId: string
  ): Promise<InstalledModInfo[]> {
    const modsDir = await getProfileModsDir(mcDir, profileId);

    if (!(await pathExists(modsDir))) {
      return [];
    }

    const entries = await fs.readdir(modsDir, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .map(async (entry) => {
          const fullPath = path.join(modsDir, entry.name);
          const stats = await fs.stat(fullPath);

          return {
            name: entry.name,
            size: stats.size,
            modified: stats.mtime.toISOString(),
          };
        })
    );

    return files.sort((a, b) => a.name.localeCompare(b.name));
  }

  async function downloadFileWithProgress(
    url: string,
    outputPath: string,
    onProgress: (percent: number) => void
  ) {
    const res = await fetch(url);

    if (!res.ok || !res.body) {
      throw new Error(
        `File download failed: ${res.status} ${await res.text()}`
      );
    }

    const total = Number(res.headers.get("content-length") ?? 0);
    const reader = res.body.getReader();
    const fileStream = createWriteStream(outputPath);

    let downloaded = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;
        if (!value) continue;

        downloaded += value.length;
        fileStream.write(Buffer.from(value));

        if (total > 0) {
          const percent = Math.round((downloaded / total) * 100);
          onProgress(percent);
        }
      }
    } finally {
      fileStream.end();
      reader.releaseLock();
    }
  }

  async function installForgeFromBackend(mcDir: string) {
    sendForgeProgress({
      stage: "searching",
      percent: 5,
      message: "Searching for Forge installer...",
    });

    const forgeInfo = await getRequiredForgeInfo();

    const downloadsDir = getDownloadsDir();
    await ensureDir(downloadsDir);

    const localJarPath = path.join(downloadsDir, forgeInfo.fileName);

    if (!(await pathExists(localJarPath))) {
      sendForgeProgress({
        stage: "downloading",
        percent: 10,
        message: `Downloading ${forgeInfo.fileName}...`,
      });

      const downloadUrl =
        forgeInfo.downloadUrl ?? BACKEND_BASE_URL + "/files/forge/download";

      await downloadFileWithProgress(downloadUrl, localJarPath, (percent) => {
        sendForgeProgress({
          stage: "downloading",
          percent,
          message: `Downloading Forge... ${percent}%`,
        });
      });
    } else {
      sendForgeProgress({
        stage: "downloading",
        percent: 100,
        message: `Using cached ${forgeInfo.fileName}.`,
      });
    }

    sendForgeProgress({
      stage: "installing",
      percent: 95,
      message: "Installing Forge...",
    });

    await runForgeInstaller(localJarPath, mcDir);

    return {
      forgeVersionId: forgeInfo.forgeVersionId,
      fileName: forgeInfo.fileName,
      localJarPath,
    };
  }

  async function getCachedModSource(fileName: string) {
    const downloadsDir = getDownloadsDir();
    const cachedPath = path.join(downloadsDir, fileName);

    if (await pathExists(cachedPath)) {
      return cachedPath;
    }

    return null;
  }

  async function getModDownloadsFromBackend(
    modNames: string[]
  ): Promise<ModDownloadInfo[]> {
    const res = await fetch(BACKEND_BASE_URL + "/files/mods/download", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ modNames }),
    });

    if (!res.ok) {
      throw new Error(
        `Backend mod download lookup failed: ${res.status} ${await res.text()}`
      );
    }

    const data = await res.json();

    if (!data?.ok || !Array.isArray(data?.downloads)) {
      throw new Error("Backend did not return valid mod download links.");
    }

    return data.downloads as ModDownloadInfo[];
  }

  async function downloadModsToCache(downloads: ModDownloadInfo[]) {
    const downloadsDir = getDownloadsDir();
    await ensureDir(downloadsDir);

    for (let index = 0; index < downloads.length; index += 1) {
      const download = downloads[index];
      const targetPath = path.join(downloadsDir, download.name);

      await downloadFileWithProgress(download.link, targetPath, (percent) => {
        sendForgeProgress({
          stage: "downloading",
          percent,
          message: `Downloading ${download.name} (${index + 1}/${
            downloads.length
          })... ${percent}%`,
        });
      });

      sendForgeProgress({
        stage: "downloading",
        percent: Math.round(((index + 1) / downloads.length) * 100),
        message: `Cached ${download.name} (${index + 1}/${downloads.length}).`,
      });
    }
  }

  async function removeExtraModsFromProfile(mcDir: string, profileId: string) {
    const modsDir = await getProfileModsDir(mcDir, profileId);

    if (!(await pathExists(modsDir))) {
      return;
    }

    const installedMods = await getInstalledModsForProfile(mcDir, profileId);
    const serverMods = await getServerModsFromBackend();
    const allowedNames = new Set(
      serverMods.map((mod) => mod.name.trim().toLowerCase())
    );

    const extraMods = installedMods.filter(
      (mod) => !allowedNames.has(mod.name.trim().toLowerCase())
    );

    for (let index = 0; index < extraMods.length; index += 1) {
      const mod = extraMods[index];
      await fs.rm(path.join(modsDir, mod.name), { force: true });
      sendForgeProgress({
        stage: "installing",
        percent:
          extraMods.length > 0
            ? Math.round(((index + 1) / extraMods.length) * 100)
            : 100,
        message: `Removed extra mod ${mod.name} (${index + 1}/${
          extraMods.length
        }).`,
      });
    }
  }

  async function syncServerModsIntoProfile(mcDir: string, profileId: string) {
    const modsDir = await getProfileModsDir(mcDir, profileId);
    await ensureDir(modsDir);

    const installedMods = await getInstalledModsForProfile(mcDir, profileId);
    const installedNames = new Set(installedMods.map((mod) => mod.name));
    const allServerMods = await getServerModsFromBackend();
    const missingMods = allServerMods.filter(
      (mod) => !installedNames.has(mod.name)
    );
    const uncachedModNames: string[] = [];

    for (const mod of missingMods) {
      const cachedSource = await getCachedModSource(mod.name);

      if (!cachedSource) {
        uncachedModNames.push(mod.name);
      }
    }

    if (uncachedModNames.length > 0) {
      const downloads = await getModDownloadsFromBackend(uncachedModNames);
      await downloadModsToCache(downloads);
    }

    let completed = 0;

    for (const mod of allServerMods) {
      completed += 1;

      if (installedNames.has(mod.name)) {
        sendForgeProgress({
          stage: "installing",
          percent: Math.round((completed / allServerMods.length) * 100),
          message: `Keeping ${mod.name} (${completed}/${allServerMods.length}).`,
        });
        continue;
      }

      const sourcePath = await getCachedModSource(mod.name);

      if (!sourcePath) {
        throw new Error(`Missing cached mod after download: ${mod.name}`);
      }

      await fs.copyFile(sourcePath, path.join(modsDir, mod.name));

      sendForgeProgress({
        stage: "installing",
        percent: Math.round((completed / allServerMods.length) * 100),
        message: `Installed ${mod.name} (${completed}/${allServerMods.length}).`,
      });
    }
  }

  async function updateSelectedProfile(
    mcDir: string,
    profileId: string,
    removeUnusedMods = false
  ) {
    sendForgeProgress({
      stage: "searching",
      percent: 0,
      message: "Checking profile status...",
    });

    const profile = await getProfileById(mcDir, profileId);
    const forgeInfo = await getRequiredForgeInfo();

    if (profile.lastVersionId !== forgeInfo.forgeVersionId) {
      await installForgeFromBackend(mcDir);
      await updateProfileVersion(mcDir, profileId, forgeInfo.forgeVersionId);
    } else {
      sendForgeProgress({
        stage: "installing",
        percent: 100,
        message: "Required Forge version already installed.",
      });
    }

    sendForgeProgress({
      stage: "installing",
      percent: 0,
      message: "Checking and syncing required mods...",
    });

    await syncServerModsIntoProfile(mcDir, profileId);

    if (removeUnusedMods) {
      await removeExtraModsFromProfile(mcDir, profileId);
    }

    const refreshedProfile = await getProfileById(mcDir, profileId);

    if (!refreshedProfile.ramInitialized) {
      await updateProfileJavaArgs(
        mcDir,
        profileId,
        buildJavaArgsWithRam(
          refreshedProfile.javaArgs,
          getDefaultProfileRamMb()
        )
      );
    }

    await addServerToProfileIfMissing(mcDir, profileId);

    sendForgeProgress({
      stage: "done",
      percent: 100,
      message: "Profile is ready.",
    });
  }

  ipcMain.handle("mc:getRequiredForgeInfo", async () => {
    return getRequiredForgeInfo();
  });

  ipcMain.handle("mc:getServerMods", async () => {
    return getServerModsFromBackend();
  });

  ipcMain.handle(
    "mc:getInstalledMods",
    async (_e, mcDir: string, profileId: string) => {
      return getInstalledModsForProfile(mcDir, profileId);
    }
  );

  async function runCleanInstall(mcDir: string, gameDir?: string) {
    const result = await installForgeFromBackend(mcDir);

    const profileId = await createProfileForVersion(
      mcDir,
      `Forge ${result.forgeVersionId.replace(/^forge-/, "")}`,
      result.forgeVersionId,
      gameDir
    );

    await updateSelectedProfile(mcDir, profileId, false);

    return {
      success: true,
      profileId,
      forgeVersionId: result.forgeVersionId,
      fileName: result.fileName,
      localJarPath: result.localJarPath,
    };
  }

  ipcMain.handle("mc:installForgeClean", async (_e, mcDir: string) => {
    const locationChoice = await dialog.showMessageBox({
      type: "question",
      title: "Clean Installation Location",
      message:
        "Choose where to create the new profile.\nRecommended: pick a separate folder so it does not affect the mods in .minecraft.",
      buttons: [
        "Choose a folder to install (recommended)",
        "Install in default minecraft directory",
        "Cancel",
      ],
      cancelId: 2,
      defaultId: 0,
    });

    if (locationChoice.response === 2) {
      return {
        success: false,
        cancelled: true,
        profileId: "",
        forgeVersionId: "",
        fileName: "",
        localJarPath: "",
      };
    }

    if (locationChoice.response === 0) {
      const folderSelection = await dialog.showOpenDialog({
        title: "Select a folder for the new profile",
        properties: ["openDirectory", "createDirectory"],
      });

      if (folderSelection.canceled || folderSelection.filePaths.length === 0) {
        return {
          success: false,
          cancelled: true,
          profileId: "",
          forgeVersionId: "",
          fileName: "",
          localJarPath: "",
        };
      }

      return runCleanInstall(mcDir, folderSelection.filePaths[0]);
    }

    return runCleanInstall(mcDir);
  });

  ipcMain.handle("mc:installForgeCleanDefault", async (_e, mcDir: string) => {
    return runCleanInstall(mcDir);
  });

  ipcMain.handle(
    "mc:installForgeIntoProfile",
    async (_e, mcDir: string, profileId: string) => {
      const result = await installForgeFromBackend(mcDir);

      await updateProfileVersion(mcDir, profileId, result.forgeVersionId);

      sendForgeProgress({
        stage: "done",
        percent: 100,
        message: "Forge installed successfully in selected profile.",
      });

      return {
        success: true,
        profileId,
        forgeVersionId: result.forgeVersionId,
        fileName: result.fileName,
        localJarPath: result.localJarPath,
      };
    }
  );

  ipcMain.handle(
    "mc:updateSelectedProfile",
    async (
      _e,
      mcDir: string,
      profileId: string,
      removeUnusedMods?: boolean
    ) => {
      await updateSelectedProfile(mcDir, profileId, !!removeUnusedMods);
    }
  );

  createWindow();
  void checkForAppUpdates();
});
