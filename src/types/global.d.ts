export {};

type McProfile = {
  id: string;
  name: string;
  gameDir?: string;
  lastVersionId?: string;
  javaArgs?: string;
  ramInitialized?: boolean;
  lastUsed?: string;
};

type AppConfig = {
  minecraftDir?: string;
  onboardingDismissed?: boolean;
};

type MinecraftDirStatus = {
  minecraftDir: string;
  defaultDir: string;
  defaultExists: boolean;
  hasCustomDir: boolean;
};

type ForgeInstallResult = {
  success: boolean;
  cancelled?: boolean;
  profileId: string;
  forgeVersionId: string;
  fileName: string;
  localJarPath: string;
};

type RequiredForgeInfo = {
  fileName: string;
  forgeVersionId: string;
  serverIp: string;
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

type InstalledModInfo = {
  name: string;
  size: number;
  modified: string;
  disabled?: boolean;
};

type ForgeInstallProgress = {
  stage: "searching" | "downloading" | "installing" | "done" | "error";
  percent: number;
  message: string;
};

type AppUpdateState = {
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
};

declare global {
  interface Window {
    mc: {
      getAppUpdateState: () => Promise<AppUpdateState>;
      checkForAppUpdates: () => Promise<AppUpdateState>;
      downloadAppUpdate: () => Promise<boolean>;
      installDownloadedUpdate: () => Promise<boolean>;
      getAppConfig: () => Promise<AppConfig>;
      dismissOnboarding: () => Promise<AppConfig>;
      getSavedMinecraftDir: () => Promise<string>;
      getMinecraftDirStatus: () => Promise<MinecraftDirStatus>;
      setWindowContentSize: (width: number, height: number) => Promise<void>;
      minimizeWindow: () => Promise<void>;
      closeWindow: () => Promise<void>;
      getSystemMemoryMb: () => Promise<number>;
      pickMinecraftDir: () => Promise<string | null>;
      getProfiles: (dir: string) => Promise<McProfile[]>;
      profileHasServerIp: (dir: string, profileId: string) => Promise<boolean>;
      openProfileFolder: (dir: string, profileId: string) => Promise<void>;
      openLauncherDownloadsFolder: () => Promise<void>;
      updateProfileRamMb: (
        dir: string,
        profileId: string,
        ramMb: number
      ) => Promise<void>;
      launchSelectedProfile: (dir: string, profileId: string) => Promise<void>;
      updateProfileName: (
        dir: string,
        profileId: string,
        profileName: string
      ) => Promise<void>;
      getRequiredForgeInfo: () => Promise<RequiredForgeInfo>;
      getServerMods: () => Promise<ServerModInfo[]>;
      getInstalledMods: (
        dir: string,
        profileId: string
      ) => Promise<InstalledModInfo[]>;
      disableProfileMod: (
        dir: string,
        profileId: string,
        modName: string
      ) => Promise<void>;
      enableProfileMod: (
        dir: string,
        profileId: string,
        modName: string
      ) => Promise<void>;
      removeProfileMod: (
        dir: string,
        profileId: string,
        modName: string
      ) => Promise<void>;
      installForgeClean: (dir: string) => Promise<ForgeInstallResult>;
      installForgeCleanDefault: (
        dir: string,
        removeUnusedMods?: boolean
      ) => Promise<ForgeInstallResult>;
      installForgeIntoProfile: (
        dir: string,
        profileId: string
      ) => Promise<void>;
      updateSelectedProfile: (
        dir: string,
        profileId: string,
        removeUnusedMods?: boolean
      ) => Promise<void>;

      onForgeInstallProgress: (
        callback: (payload: ForgeInstallProgress) => void
      ) => () => void;
      onAppUpdateState: (
        callback: (payload: AppUpdateState) => void
      ) => () => void;
    };
  }
}
