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
