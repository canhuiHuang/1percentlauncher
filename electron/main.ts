import "dotenv/config";
import { app, BrowserWindow, ipcMain, dialog } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import { getDefaultMinecraftDir } from "./services/minecraftPaths";
import {
  readProfiles,
  createProfileForVersion,
  updateProfileVersion,
} from "./services/profiles";
import { readConfig, setMinecraftDir } from "./services/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, "..");

export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, "public")
  : RENDERER_DIST;

let win: BrowserWindow | null;

type InstallForgeProgress =
  | { stage: "searching"; percent: number; message: string }
  | { stage: "downloading"; percent: number; message: string }
  | { stage: "installing"; percent: number; message: string }
  | { stage: "done"; percent: number; message: string }
  | { stage: "error"; percent: number; message: string };

function sendForgeProgress(payload: InstallForgeProgress) {
  win?.webContents.send("mc:forgeInstallProgress", payload);
}

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
    },
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}

async function listDropboxFolder(token: string, folderPath: string) {
  const res = await fetch("https://api.dropboxapi.com/2/files/list_folder", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      path: folderPath,
    }),
  });

  if (!res.ok)
    throw new Error(`Dropbox list failed: ${res.status} ${await res.text()}`);

  return (await res.json()) as {
    entries: Array<{
      name: string;
      path_lower?: string;
      [key: string]: unknown;
    }>;
  };
}

function getForgeVersionIdFromInstallerFileName(fileName: string) {
  // forge-1.20.1-47.4.10-installer.jar -> forge-1.20.1-47.4.10
  return fileName.replace(/-installer\.jar$/i, "");
}

async function downloadDropboxFileWithProgress(
  token: string,
  dropboxPath: string,
  outputPath: string,
  onProgress: (percent: number) => void
) {
  const res = await fetch("https://content.dropboxapi.com/2/files/download", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Dropbox-API-Arg": JSON.stringify({ path: dropboxPath }),
    },
  });

  if (!res.ok || !res.body) {
    throw new Error(
      `Dropbox download failed: ${res.status} ${await res.text()}`
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
    const config = await readConfig();

    if (config.minecraftDir?.trim()) {
      return config.minecraftDir;
    }

    return getDefaultMinecraftDir();
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

  async function getForgeInfoFromBackend() {
    const res = await fetch("http://localhost:4032/files/forge");

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

    const forgeInfo = await getForgeInfoFromBackend();

    const downloadsDir = path.join(app.getPath("userData"), "downloads");
    await fs.mkdir(downloadsDir, { recursive: true });

    const localJarPath = path.join(downloadsDir, forgeInfo.fileName);

    sendForgeProgress({
      stage: "downloading",
      percent: 10,
      message: `Downloading ${forgeInfo.fileName}...`,
    });

    const downloadUrl =
      forgeInfo.downloadUrl ?? "http://localhost:4032/files/forge/download";

    await downloadFileWithProgress(downloadUrl, localJarPath, (percent) => {
      sendForgeProgress({
        stage: "downloading",
        percent,
        message: `Downloading Forge... ${percent}%`,
      });
    });

    sendForgeProgress({
      stage: "installing",
      percent: 95,
      message: "Installing Forge...",
    });

    await runForgeInstaller(localJarPath, mcDir);

    const forgeVersionId = getForgeVersionIdFromInstallerFileName(
      forgeInfo.fileName
    );

    return {
      forgeVersionId,
      fileName: forgeInfo.fileName,
      localJarPath,
    };
  }

  ipcMain.handle("mc:installForgeClean", async (_e, mcDir: string) => {
    const result = await installForgeFromBackend(mcDir);

    const profileId = await createProfileForVersion(
      mcDir,
      `Forge ${result.forgeVersionId.replace(/^forge-/, "")}`,
      result.forgeVersionId
    );

    sendForgeProgress({
      stage: "done",
      percent: 100,
      message: "Forge installed successfully in a new profile.",
    });

    return {
      success: true,
      profileId,
      forgeVersionId: result.forgeVersionId,
      fileName: result.fileName,
      localJarPath: result.localJarPath,
    };
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

  createWindow();
});
