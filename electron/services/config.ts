import fs from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import type { AppConfig } from "../types/config";

function getConfigPath(): string {
  return path.join(app.getPath("userData"), "config.json");
}

export async function readConfig(): Promise<AppConfig> {
  const configPath = getConfigPath();

  try {
    const raw = await fs.readFile(configPath, "utf-8");
    return JSON.parse(raw) as AppConfig;
  } catch {
    return {};
  }
}

export async function writeConfig(config: AppConfig): Promise<void> {
  const configPath = getConfigPath();
  const dir = path.dirname(configPath);

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
}

export async function setMinecraftDir(
  minecraftDir: string
): Promise<AppConfig> {
  const current = await readConfig();
  const next: AppConfig = {
    ...current,
    minecraftDir,
  };

  await writeConfig(next);
  return next;
}
