export {};

type McProfile = {
  id: string;
  name: string;
  gameDir?: string;
  lastVersionId?: string;
};

declare global {
  interface Window {
    mc: {
      getSavedMinecraftDir: () => Promise<string>;
      pickMinecraftDir: () => Promise<string | null>;
      getProfiles: (dir: string) => Promise<McProfile[]>;
    };
  }
}
