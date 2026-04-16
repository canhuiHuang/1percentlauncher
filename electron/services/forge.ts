import fs from "node:fs/promises";
import path from "node:path";
import type {
  ForgeMatchResult,
  LauncherProfilesFile,
} from "../types/minecraft";
import { readLastPlayedProfile } from "./profiles";

export const REQUIRED_FORGE_VERSION_ID = "1.20.1-forge-47.2.0";

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function checkLastPlayedProfileForgeMatch(
  mcDir: string
): Promise<ForgeMatchResult> {
  const profile = await readLastPlayedProfile(mcDir);
  const profileVersionId = profile?.lastVersionId ?? null;

  return {
    profile,
    requiredVersionId: REQUIRED_FORGE_VERSION_ID,
    profileVersionId,
    matches: profileVersionId === REQUIRED_FORGE_VERSION_ID,
  };
}

export async function isForgeVersionInstalled(
  mcDir: string,
  versionId: string = REQUIRED_FORGE_VERSION_ID
): Promise<boolean> {
  const versionDir = path.join(mcDir, "versions", versionId);
  return pathExists(versionDir);
}

export async function installRequiredForge(_mcDir: string): Promise<{
  success: boolean;
  message: string;
}> {
  return {
    success: false,
    message: "Forge installer not implemented yet.",
  };
}

export async function createProfileForRequiredForge(mcDir: string): Promise<{
  success: boolean;
  message: string;
}> {
  const launcherProfilesPath = path.join(mcDir, "launcher_profiles.json");

  if (!(await pathExists(launcherProfilesPath))) {
    return {
      success: false,
      message: "launcher_profiles.json was not found.",
    };
  }

  const raw = await fs.readFile(launcherProfilesPath, "utf-8");
  const data = JSON.parse(raw) as LauncherProfilesFile;

  if (!data.profiles) data.profiles = {};

  const newProfileId = "minecraft-installer-forge-1.20.1";
  data.profiles[newProfileId] = {
    name: "Minecraft Installer Forge 1.20.1",
    lastVersionId: REQUIRED_FORGE_VERSION_ID,
    type: "custom",
    created: new Date().toISOString(),
    lastUsed: new Date().toISOString(),
  };

  await fs.writeFile(
    launcherProfilesPath,
    JSON.stringify(data, null, 2),
    "utf-8"
  );

  return {
    success: true,
    message: "New Forge profile created.",
  };
}
