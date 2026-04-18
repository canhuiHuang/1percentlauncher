import fs from "node:fs/promises";
import path from "node:path";

const version = process.env.npm_package_version ?? "0.0.0";
const releaseRoot = path.resolve("release", version);
const unpackedDir = path.join(releaseRoot, "win-unpacked");
const targetDir = path.join(releaseRoot, "1PercentLauncher");
const envSource = path.resolve(".env");

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

if (!(await pathExists(unpackedDir))) {
  throw new Error(`Expected build output at ${unpackedDir}`);
}

if (await pathExists(targetDir)) {
  await fs.rm(targetDir, { recursive: true, force: true });
}

await fs.cp(unpackedDir, targetDir, { recursive: true });
await fs.mkdir(path.join(targetDir, "downloads"), { recursive: true });
await fs.mkdir(path.join(targetDir, "temp"), { recursive: true });

if (await pathExists(envSource)) {
  await fs.copyFile(envSource, path.join(targetDir, ".env"));
}
