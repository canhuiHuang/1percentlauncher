import fs from "node:fs/promises";
import path from "node:path";
import type { LauncherProfilesFile, McProfile } from "../types/minecraft";

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

function sortByLastUsedDesc(profiles: McProfile[]): McProfile[] {
  return [...profiles].sort((a, b) => {
    const aTime = a.lastUsed ? Date.parse(a.lastUsed) : 0;
    const bTime = b.lastUsed ? Date.parse(b.lastUsed) : 0;
    return bTime - aTime;
  });
}

function mapVanillaProfiles(data: LauncherProfilesFile): McProfile[] {
  const profiles = Object.entries(data.profiles ?? {}).map(([id, profile]) => ({
    id,
    name: profile.name ?? id,
    gameDir: profile.gameDir,
    lastVersionId: profile.lastVersionId,
    lastUsed: profile.lastUsed,
    icon: profile.icon,
    created: profile.created,
    type: profile.type,
  }));

  return sortByLastUsedDesc(profiles);
}

async function readVanillaLikeProfiles(mcDir: string): Promise<McProfile[]> {
  const launcherProfilesPath = path.join(mcDir, "launcher_profiles.json");

  if (!(await pathExists(launcherProfilesPath))) return [];

  const data = await readJsonFile<LauncherProfilesFile>(launcherProfilesPath);
  return mapVanillaProfiles(data);
}

export async function readProfiles(mcDir: string): Promise<McProfile[]> {
  const vanillaProfiles = await readVanillaLikeProfiles(mcDir);
  if (vanillaProfiles.length > 0) return vanillaProfiles;

  return [];
}

export async function readLastPlayedProfile(
  mcDir: string
): Promise<McProfile | null> {
  const profiles = await readProfiles(mcDir);
  return profiles[0] ?? null;
}
