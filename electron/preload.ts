import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("mc", {
  getAppUpdateState: () => ipcRenderer.invoke("app:getUpdateState"),
  checkForAppUpdates: () => ipcRenderer.invoke("app:checkForUpdates"),
  downloadAppUpdate: () => ipcRenderer.invoke("app:downloadUpdate"),
  installDownloadedUpdate: () => ipcRenderer.invoke("app:installDownloadedUpdate"),
  getAppConfig: () => ipcRenderer.invoke("mc:getAppConfig"),
  dismissOnboarding: () => ipcRenderer.invoke("mc:dismissOnboarding"),
  getSavedMinecraftDir: () => ipcRenderer.invoke("mc:getSavedMinecraftDir"),
  getMinecraftDirStatus: () => ipcRenderer.invoke("mc:getMinecraftDirStatus"),
  setWindowContentSize: (width: number, height: number) =>
    ipcRenderer.invoke("mc:setWindowContentSize", width, height),
  minimizeWindow: () => ipcRenderer.invoke("mc:minimizeWindow"),
  closeWindow: () => ipcRenderer.invoke("mc:closeWindow"),
  getSystemMemoryMb: () => ipcRenderer.invoke("mc:getSystemMemoryMb"),
  pickMinecraftDir: () => ipcRenderer.invoke("mc:pickMinecraftDir"),
  getProfiles: (dir: string) => ipcRenderer.invoke("mc:getProfiles", dir),
  profileHasServerIp: (dir: string, profileId: string) =>
    ipcRenderer.invoke("mc:profileHasServerIp", dir, profileId),
  openProfileFolder: (dir: string, profileId: string) =>
    ipcRenderer.invoke("mc:openProfileFolder", dir, profileId),
  openLauncherDownloadsFolder: () =>
    ipcRenderer.invoke("mc:openLauncherDownloadsFolder"),
  updateProfileRamMb: (dir: string, profileId: string, ramMb: number) =>
    ipcRenderer.invoke("mc:updateProfileRamMb", dir, profileId, ramMb),
  launchSelectedProfile: (dir: string, profileId: string) =>
    ipcRenderer.invoke("mc:launchSelectedProfile", dir, profileId),
  updateProfileName: (dir: string, profileId: string, profileName: string) =>
    ipcRenderer.invoke("mc:updateProfileName", dir, profileId, profileName),
  getRequiredForgeInfo: () => ipcRenderer.invoke("mc:getRequiredForgeInfo"),
  getServerMods: () => ipcRenderer.invoke("mc:getServerMods"),
  getInstalledMods: (dir: string, profileId: string) =>
    ipcRenderer.invoke("mc:getInstalledMods", dir, profileId),
  disableProfileMod: (dir: string, profileId: string, modName: string) =>
    ipcRenderer.invoke("mc:disableProfileMod", dir, profileId, modName),
  enableProfileMod: (dir: string, profileId: string, modName: string) =>
    ipcRenderer.invoke("mc:enableProfileMod", dir, profileId, modName),
  removeProfileMod: (dir: string, profileId: string, modName: string) =>
    ipcRenderer.invoke("mc:removeProfileMod", dir, profileId, modName),
  installForgeClean: (dir: string) =>
    ipcRenderer.invoke("mc:installForgeClean", dir),
  installForgeCleanDefault: (dir: string) =>
    ipcRenderer.invoke("mc:installForgeCleanDefault", dir),
  installForgeIntoProfile: (dir: string, profileId: string) =>
    ipcRenderer.invoke("mc:installForgeIntoProfile", dir, profileId),
  updateSelectedProfile: (
    dir: string,
    profileId: string,
    removeUnusedMods?: boolean
  ) => ipcRenderer.invoke("mc:updateSelectedProfile", dir, profileId, removeUnusedMods),

  // Independent forge
  onForgeInstallProgress: (
    callback: (payload: {
      stage: "searching" | "downloading" | "installing" | "done" | "error";
      percent: number;
      message: string;
    }) => void
  ) => {
    const listener = (
      _event: unknown,
      payload: {
        stage: "searching" | "downloading" | "installing" | "done" | "error";
        percent: number;
        message: string;
      }
    ) => callback(payload);

    ipcRenderer.on("mc:forgeInstallProgress", listener);

    return () => {
      ipcRenderer.removeListener("mc:forgeInstallProgress", listener);
    };
  },

  onAppUpdateState: (
    callback: (payload: {
      status:
        | "idle"
        | "disabled"
        | "checking"
        | "available"
        | "downloading"
        | "downloaded"
        | "up-to-date"
        | "error";
      message: string;
      progress: number | null;
    }) => void
  ) => {
    const listener = (
      _event: unknown,
      payload: {
        status:
          | "idle"
          | "disabled"
          | "checking"
          | "available"
          | "downloading"
          | "downloaded"
          | "up-to-date"
          | "error";
        message: string;
        progress: number | null;
      }
    ) => callback(payload);

    ipcRenderer.on("app:update-state", listener);

    return () => {
      ipcRenderer.removeListener("app:update-state", listener);
    };
  },
});
