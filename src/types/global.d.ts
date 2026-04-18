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
};

type ForgeInstallProgress = {
  stage: "searching" | "downloading" | "installing" | "done" | "error";
  percent: number;
  message: string;
};

declare global {
  interface Window {
    mc: {
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
      installForgeClean: (dir: string) => Promise<ForgeInstallResult>;
      installForgeCleanDefault: (dir: string) => Promise<ForgeInstallResult>;
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
    };
  }
}
