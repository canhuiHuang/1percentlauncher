import os from "node:os";
import path from "node:path";

export function getDefaultMinecraftDir(): string {
  const appData =
    process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  return path.join(appData, ".minecraft");
}

export function getLauncherProfilesPath(mcDir: string): string {
  return path.join(mcDir, "launcher_profiles.json");
}
