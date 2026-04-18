export {};

type McProfile = {
  id: string;
  name: string;
  gameDir?: string;
  lastVersionId?: string;
  lastUsed?: string;
};

type ForgeInstallResult = {
  success: boolean;
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
      getSavedMinecraftDir: () => Promise<string>;
      pickMinecraftDir: () => Promise<string | null>;
      getProfiles: (dir: string) => Promise<McProfile[]>;
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
      installForgeIntoProfile: (
        dir: string,
        profileId: string
      ) => Promise<void>;

      onForgeInstallProgress: (
        callback: (payload: ForgeInstallProgress) => void
      ) => () => void;
    };
  }
}
