export {};

type McProfile = {
  id: string;
  name: string;
  gameDir?: string;
  lastVersionId?: string;
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
      installForgeFromDropbox: (dir: string) => Promise<{
        success: boolean;
        fileName: string;
        localJarPath: string;
      }>;
      onForgeInstallProgress: (
        callback: (payload: ForgeInstallProgress) => void
      ) => () => void;
    };
  }
}
