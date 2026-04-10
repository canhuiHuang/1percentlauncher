import fs from "node:fs/promises";
import path from "node:path";
import type { LauncherProfilesFile, McProfile } from "../types/minecraft";

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

function mapVanillaProfiles(data: LauncherProfilesFile): McProfile[] {
  return Object.entries(data.profiles ?? {}).map(([id, profile]) => ({
    id,
    name: profile.name ?? id,
    gameDir: profile.gameDir,
    lastVersionId: profile.lastVersionId,
  }));
}

async function readVanillaStyleProfiles(mcDir: string): Promise<McProfile[]> {
  const launcherProfilesPath = path.join(mcDir, "launcher_profiles.json");

  if (!(await fileExists(launcherProfilesPath))) return [];

  const data = await readJsonFile<LauncherProfilesFile>(launcherProfilesPath);
  return mapVanillaProfiles(data);
}

export async function readProfiles(mcDir: string): Promise<McProfile[]> {
  const vanillaProfiles = await readVanillaStyleProfiles(mcDir);

  if (vanillaProfiles.length > 0) return vanillaProfiles;

  // TODO: Consider reading other launcher profiles
  return [];
}
