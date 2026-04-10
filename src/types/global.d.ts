import type { MinecraftProfile } from "./minecraft";

export {};

declare global {
  interface Window {
    mc: {
      getDefaultDir: () => Promise<string>;
      getProfiles: (dir: string) => Promise<MinecraftProfile[]>;
    };
  }
}
