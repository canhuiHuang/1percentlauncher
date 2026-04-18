import { useEffect, useMemo, useState } from "react";
import ModList, { ModListItem, ModTag } from "./components/ModList";
import ProgressBar, { ForgeInstallProgress } from "./components/ProgressBar";
import { McProfile } from "../electron/types/minecraft";

type ServerModInfo = {
  name: string;
  id: string;
  size: number;
  clientModified: string;
  serverModified: string;
};

type InstalledModInfo = {
  name: string;
  size: number;
  modified: string;
};

const PROFILE_ICON_EMOJIS: Record<string, string> = {
  Grass: "🌿",
  Dirt: "🟫",
  Crafting_Table: "🪵",
  Furnace: "🔥",
  Chest: "🧰",
  Bookshelf: "📚",
  Diamond: "💎",
  Creeper_Head: "💥",
  Pickaxe: "⛏️",
  Sword: "🗡️",
  Nether_Star: "⭐",
};

const APP_VERSION = "0.0.0";

function normalizeModName(name: string): string {
  return name.trim().toLowerCase();
}

function formatForgeVersion(versionId: string): string {
  return versionId.replace(/^forge-/, "Forge ");
}

function parseRamMbFromJavaArgs(javaArgs?: string): number | null {
  if (!javaArgs) {
    return null;
  }

  const match = javaArgs.match(/-Xmx(\d+)([mMgG])\b/);

  if (!match) {
    return null;
  }

  const amount = Number(match[1]);

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return match[2].toLowerCase() === "g" ? amount * 1024 : amount;
}

function buildJavaArgsPreview(
  existingJavaArgs: string | undefined,
  ramMb: number
) {
  const ramArg = ramMb % 1024 === 0 ? `-Xmx${ramMb / 1024}G` : `-Xmx${ramMb}M`;
  const normalizedArgs = (existingJavaArgs ?? "").trim();

  if (!normalizedArgs) {
    return `${ramArg} -XX:+UnlockExperimentalVMOptions -XX:+UseG1GC -XX:G1NewSizePercent=20 -XX:G1ReservePercent=20 -XX:MaxGCPauseMillis=50 -XX:G1HeapRegionSize=32M`;
  }

  if (/-Xmx\d+[mMgG]\b/.test(normalizedArgs)) {
    return normalizedArgs.replace(/-Xmx\d+[mMgG]\b/g, ramArg);
  }

  return `${ramArg} ${normalizedArgs}`.trim();
}

function formatRamLabel(ramMb: number) {
  const ramGb = ramMb / 1024;
  return Number.isInteger(ramGb) ? `${ramGb} GB` : `${ramGb.toFixed(1)} GB`;
}

function getMatchStatusIcon(matches: boolean) {
  return (
    <span className={`status-icon ${matches ? "status-ok" : "status-bad"}`}>
      {matches ? "✅" : "❌"}
    </span>
  );
}

function getModTags(name: string): ModTag[] {
  const normalizedName = normalizeModName(name);

  if (!normalizedName.startsWith("local")) {
    return ["required"];
  }

  const tags: ModTag[] = ["local"];

  if (normalizedName.startsWith("local-ambient")) {
    tags.push("ambient");
  }

  if (normalizedName.startsWith("local-util")) {
    tags.push("util");
  }

  if (normalizedName.startsWith("local-performance")) {
    tags.push("performance");
  }

  return tags;
}

export default function App() {
  const [dir, setDir] = useState("");
  const [profiles, setProfiles] = useState<McProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [error, setError] = useState("");
  const [isInstalling, setIsInstalling] = useState(false);
  const [requiredForgeVersionId, setRequiredForgeVersionId] = useState("");
  const [isLoadingRequiredForgeVersion, setIsLoadingRequiredForgeVersion] =
    useState(true);
  const [serverMods, setServerMods] = useState<ServerModInfo[]>([]);
  const [isLoadingServerMods, setIsLoadingServerMods] = useState(true);
  const [installedMods, setInstalledMods] = useState<InstalledModInfo[]>([]);
  const [isLoadingInstalledMods, setIsLoadingInstalledMods] = useState(false);
  const [profileNameInput, setProfileNameInput] = useState("");
  const [systemMemoryMb, setSystemMemoryMb] = useState(2048);
  const [profileRamMb, setProfileRamMb] = useState(1024);
  const [profileHasServerIp, setProfileHasServerIp] = useState(false);
  const [isLoadingProfileServerIp, setIsLoadingProfileServerIp] =
    useState(false);
  const [removeUnusedMods, setRemoveUnusedMods] = useState(true);
  const [isLaunchingGame, setIsLaunchingGame] = useState(false);
  const [playFeedback, setPlayFeedback] = useState("");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [defaultMinecraftDir, setDefaultMinecraftDir] = useState("");
  const [defaultMinecraftDirExists, setDefaultMinecraftDirExists] =
    useState(true);
  const [hasCustomMinecraftDir, setHasCustomMinecraftDir] = useState(false);
  const [progress, setProgress] = useState<ForgeInstallProgress>({
    stage: "searching",
    percent: 0,
    message: "",
  });

  const selectedProfile =
    profiles.find((profile) => profile.id === selectedProfileId) ?? null;

  useEffect(() => {
    setProfileNameInput(selectedProfile?.name ?? "");
  }, [selectedProfile?.id, selectedProfile?.name]);

  useEffect(() => {
    const defaultRamMb = Math.max(1024, Math.floor(systemMemoryMb / 2));
    const configuredRamMb = parseRamMbFromJavaArgs(selectedProfile?.javaArgs);
    setProfileRamMb(configuredRamMb ?? defaultRamMb);
  }, [selectedProfile?.id, selectedProfile?.javaArgs, systemMemoryMb]);

  useEffect(() => {
    const unsubscribe = window.mc.onForgeInstallProgress((payload) => {
      setProgress(payload);
    });

    return unsubscribe;
  }, []);

  const versionMatches =
    !!selectedProfile?.lastVersionId &&
    !!requiredForgeVersionId &&
    selectedProfile.lastVersionId === requiredForgeVersionId;

  const requiredServerModsCount = useMemo(
    () =>
      serverMods.reduce(
        (count, mod) =>
          normalizeModName(mod.name).startsWith("local") ? count : count + 1,
        0
      ),
    [serverMods]
  );

  const optionalServerModsCount = serverMods.length - requiredServerModsCount;

  const installedModNames = useMemo(
    () => new Set(installedMods.map((mod) => normalizeModName(mod.name))),
    [installedMods]
  );

  const serverModNames = useMemo(
    () => new Set(serverMods.map((mod) => normalizeModName(mod.name))),
    [serverMods]
  );

  const installedRequiredModsCount = useMemo(() => {
    if (serverMods.length === 0 || installedMods.length === 0) {
      return 0;
    }

    return serverMods.reduce((count, mod) => {
      const normalizedName = normalizeModName(mod.name);
      return !normalizedName.startsWith("local") &&
        installedModNames.has(normalizedName)
        ? count + 1
        : count;
    }, 0);
  }, [installedModNames, serverMods]);

  const installedOptionalModsCount = useMemo(() => {
    if (serverMods.length === 0 || installedMods.length === 0) {
      return 0;
    }

    return serverMods.reduce((count, mod) => {
      const normalizedName = normalizeModName(mod.name);
      return normalizedName.startsWith("local") &&
        installedModNames.has(normalizedName)
        ? count + 1
        : count;
    }, 0);
  }, [installedModNames, serverMods]);

  const isProfileUpToDate =
    !!selectedProfile &&
    versionMatches &&
    installedRequiredModsCount === requiredServerModsCount &&
    profileHasServerIp;
  const isServerInfoUnavailable =
    !isLoadingRequiredForgeVersion &&
    !isLoadingServerMods &&
    !requiredForgeVersionId;
  const isOnboardingMinecraftDirMissing =
    showOnboarding && !defaultMinecraftDirExists && !hasCustomMinecraftDir;
  const selectedProfileIcon = selectedProfile?.icon
    ? PROFILE_ICON_EMOJIS[selectedProfile.icon] ?? "🎮"
    : "🎮";
  const areServerActionsDisabled =
    isInstalling ||
    isLaunchingGame ||
    !dir ||
    !selectedProfileId ||
    isServerInfoUnavailable;

  const installedModListItems = useMemo<ModListItem[]>(
    () =>
      installedMods.map((mod) => {
        const normalizedName = normalizeModName(mod.name);
        const tags: ModTag[] = serverModNames.has(normalizedName)
          ? getModTags(mod.name)
          : ["extra"];

        return {
          key: `${mod.name}-${mod.modified}`,
          name: mod.name,
          tags,
          status: tags.includes("extra") ? undefined : "installed",
          subtitle: new Date(mod.modified).toLocaleString(),
        };
      }),
    [installedMods, serverModNames]
  );

  const serverModListItems = useMemo<ModListItem[]>(
    () =>
      serverMods.map((mod) => ({
        key: mod.id,
        name: mod.name,
        tags: getModTags(mod.name),
        status: installedModNames.has(normalizeModName(mod.name))
          ? "installed"
          : "missing",
      })),
    [installedModNames, serverMods]
  );

  useEffect(() => {
    async function loadInitialDir() {
      try {
        const [dirStatus, totalMemoryMb, config] = await Promise.all([
          window.mc.getMinecraftDirStatus(),
          window.mc.getSystemMemoryMb(),
          window.mc.getAppConfig(),
        ]);
        setDir(dirStatus.minecraftDir);
        setSystemMemoryMb(totalMemoryMb);
        setDefaultMinecraftDir(dirStatus.defaultDir);
        setDefaultMinecraftDirExists(dirStatus.defaultExists);
        setHasCustomMinecraftDir(dirStatus.hasCustomDir);
        setShowOnboarding(!config.onboardingDismissed);
      } catch {
        setError("Failed to load Minecraft directory.");
      }
    }

    void loadInitialDir();
  }, []);

  useEffect(() => {
    let isActive = true;

    async function loadServerInfo() {
      try {
        setIsLoadingRequiredForgeVersion(true);
        setIsLoadingServerMods(true);

        const [forgeInfo, mods] = await Promise.all([
          window.mc.getRequiredForgeInfo(),
          window.mc.getServerMods(),
        ]);

        if (!isActive) return;

        setRequiredForgeVersionId(forgeInfo.forgeVersionId);
        setServerMods(mods);
      } catch {
        if (!isActive) return;

        setRequiredForgeVersionId("");
        setServerMods([]);
      } finally {
        if (isActive) {
          setIsLoadingRequiredForgeVersion(false);
          setIsLoadingServerMods(false);
        }
      }
    }

    void loadServerInfo();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!dir) return;

    async function loadProfiles() {
      try {
        const profilesRes = await window.mc.getProfiles(dir);
        setProfiles(profilesRes);

        if (profilesRes.length > 0) {
          setSelectedProfileId(profilesRes[0].id);
        } else {
          setSelectedProfileId("");
        }
      } catch {
        setError("Failed to load profiles.");
        setProfiles([]);
        setSelectedProfileId("");
      }
    }

    void loadProfiles();
  }, [dir]);

  useEffect(() => {
    if (!dir || !selectedProfileId) {
      setInstalledMods([]);
      setIsLoadingInstalledMods(false);
      return;
    }

    let isActive = true;

    async function loadInstalledMods() {
      try {
        setIsLoadingInstalledMods(true);
        const mods = await window.mc.getInstalledMods(dir, selectedProfileId);

        if (!isActive) return;

        setInstalledMods(mods);
      } catch {
        if (!isActive) return;

        setInstalledMods([]);
      } finally {
        if (isActive) {
          setIsLoadingInstalledMods(false);
        }
      }
    }

    void loadInstalledMods();

    return () => {
      isActive = false;
    };
  }, [dir, selectedProfileId]);

  useEffect(() => {
    if (!dir || !selectedProfileId) {
      setProfileHasServerIp(false);
      setIsLoadingProfileServerIp(false);
      return;
    }

    let isActive = true;

    async function loadProfileServerIpStatus() {
      try {
        setIsLoadingProfileServerIp(true);
        const hasServerIp = await window.mc.profileHasServerIp(
          dir,
          selectedProfileId
        );

        if (!isActive) return;

        setProfileHasServerIp(hasServerIp);
      } catch {
        if (!isActive) return;

        setProfileHasServerIp(false);
      } finally {
        if (isActive) {
          setIsLoadingProfileServerIp(false);
        }
      }
    }

    void loadProfileServerIpStatus();

    return () => {
      isActive = false;
    };
  }, [dir, selectedProfileId]);

  async function chooseFolder() {
    try {
      setError("");
      const selectedDir = await window.mc.pickMinecraftDir();

      if (!selectedDir) return;

      setDir(selectedDir);
      setHasCustomMinecraftDir(true);
      setDefaultMinecraftDirExists(true);
      setProfiles([]);
    } catch {
      setError("Failed to select Minecraft directory.");
    }
  }

  async function reloadProfiles(): Promise<McProfile[]> {
    try {
      const profilesRes = await window.mc.getProfiles(dir);

      setProfiles(profilesRes);

      setSelectedProfileId((prev) => {
        if (prev && profilesRes.some((profile) => profile.id === prev)) {
          return prev;
        }

        return profilesRes[0]?.id ?? "";
      });

      return profilesRes;
    } catch {
      setError("Failed to reload profiles.");
      setProfiles([]);
      setSelectedProfileId("");
      return [];
    }
  }

  async function handleCleanInstall() {
    try {
      setError("");
      setPlayFeedback("");
      setShowOnboarding(false);
      setIsInstalling(true);
      setSelectedProfileId("");
      setInstalledMods([]);
      setProfileHasServerIp(false);
      setProgress({
        stage: "searching",
        percent: 0,
        message: "Starting...",
      });

      const result = await window.mc.installForgeClean(dir);
      if (result.cancelled) {
        setProgress({
          stage: "searching",
          percent: 0,
          message: "Clean installation cancelled.",
        });
        return;
      }
      const updatedProfiles = await reloadProfiles();
      const createdProfileStillExists = updatedProfiles.some(
        (profile) => profile.id === result.profileId
      );

      if (createdProfileStillExists) {
        setSelectedProfileId(result.profileId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to install Forge.");
      setProgress({
        stage: "error",
        percent: 0,
        message: "Forge installation failed.",
      });
    } finally {
      setIsInstalling(false);
    }
  }

  async function handleOnboardingInstallDefault() {
    try {
      setError("");
      setPlayFeedback("");
      setShowOnboarding(false);
      setIsInstalling(true);
      setSelectedProfileId("");
      setInstalledMods([]);
      setProfileHasServerIp(false);
      setProgress({
        stage: "searching",
        percent: 0,
        message: "Starting...",
      });

      const installDir = defaultMinecraftDir || dir;
      const result = await window.mc.installForgeCleanDefault(installDir);
      if (result.cancelled) {
        setProgress({
          stage: "searching",
          percent: 0,
          message: "Clean installation cancelled.",
        });
        setShowOnboarding(true);
        return;
      }

      const updatedProfiles = await reloadProfiles();
      const createdProfileStillExists = updatedProfiles.some(
        (profile) => profile.id === result.profileId
      );

      if (createdProfileStillExists) {
        setSelectedProfileId(result.profileId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to install Forge.");
      setProgress({
        stage: "error",
        percent: 0,
        message: "Forge installation failed.",
      });
    } finally {
      setIsInstalling(false);
    }
  }

  async function dismissOnboarding() {
    try {
      await window.mc.dismissOnboarding();
      setShowOnboarding(false);
    } catch {
      setShowOnboarding(false);
    }
  }

  async function handleUpdateSelectedProfile() {
    try {
      if (!selectedProfileId) {
        setError("No profile selected.");
        return;
      }

      setError("");
      setIsInstalling(true);
      setProgress({
        stage: "searching",
        percent: 0,
        message: isProfileUpToDate ? "Profile is ready." : "Starting update...",
      });

      if (!isProfileUpToDate) {
        await window.mc.updateSelectedProfile(
          dir,
          selectedProfileId,
          removeUnusedMods
        );
        await reloadProfiles();
      }

      const [mods, hasServerIp] = await Promise.all([
        window.mc.getInstalledMods(dir, selectedProfileId),
        window.mc.profileHasServerIp(dir, selectedProfileId),
      ]);
      setInstalledMods(mods);
      setProfileHasServerIp(hasServerIp);
      setProgress({
        stage: "done",
        percent: 100,
        message: "Profile is ready.",
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update profile."
      );
      setProgress({
        stage: "error",
        percent: 0,
        message: "Profile update failed.",
      });
    } finally {
      setIsInstalling(false);
    }
  }

  async function handlePlaySelectedProfile() {
    try {
      if (!dir || !selectedProfileId) {
        setError("No profile selected.");
        return;
      }

      setError("");
      setPlayFeedback("Opening Minecraft Launcher...");
      setIsLaunchingGame(true);
      await window.mc.launchSelectedProfile(dir, selectedProfileId);
      setPlayFeedback("Minecraft Launcher opened.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to launch profile."
      );
      setPlayFeedback("Failed to open Minecraft Launcher.");
    } finally {
      setIsLaunchingGame(false);
    }
  }

  async function saveProfileName() {
    const trimmedName = profileNameInput.trim();

    if (!dir || !selectedProfileId || !selectedProfile) {
      return;
    }

    if (!trimmedName) {
      setProfileNameInput(selectedProfile.name);
      return;
    }

    if (trimmedName === selectedProfile.name) {
      return;
    }

    try {
      setError("");
      await window.mc.updateProfileName(dir, selectedProfileId, trimmedName);
      setProfiles((prev) =>
        prev.map((profile) =>
          profile.id === selectedProfileId
            ? { ...profile, name: trimmedName }
            : profile
        )
      );
    } catch {
      setError("Failed to update profile name.");
      setProfileNameInput(selectedProfile.name);
    }
  }

  async function openSelectedProfileFolder() {
    if (!dir || !selectedProfileId) {
      return;
    }

    try {
      setError("");
      await window.mc.openProfileFolder(dir, selectedProfileId);
    } catch {
      setError("Failed to open profile folder.");
    }
  }

  async function saveProfileRamMb(ramMb: number) {
    if (!dir || !selectedProfileId) {
      return;
    }

    try {
      setError("");
      await window.mc.updateProfileRamMb(dir, selectedProfileId, ramMb);
      setProfiles((prev) =>
        prev.map((profile) =>
          profile.id === selectedProfileId
            ? {
                ...profile,
                javaArgs: buildJavaArgsPreview(profile.javaArgs, ramMb),
              }
            : profile
        )
      );
    } catch {
      setError("Failed to update profile RAM.");
    }
  }

  return (
    <div className="app-shell">
      <div className="window-drag-region">
        <div className="window-title">1percent launcher ({APP_VERSION})</div>
        <div className="window-controls">
          <button
            className="window-control-button"
            onClick={() => void window.mc.minimizeWindow()}
            aria-label="Minimize window"
            title="Minimize"
          >
            _
          </button>
          <button
            className="window-control-button window-control-button-close"
            onClick={() => void window.mc.closeWindow()}
            aria-label="Close window"
            title="Close"
          >
            X
          </button>
        </div>
      </div>
      {showOnboarding ? (
        <div className="onboarding-overlay">
          <div className="onboarding-modal">
            <h3 className="onboarding-title">1Percent Launcher</h3>
            {isOnboardingMinecraftDirMissing ? (
              <>
                <p className="onboarding-copy">
                  Minecraft default directory was not found. Install Minecraft
                  first, or choose your Minecraft directory to continue.
                </p>
                <button
                  className="onboarding-install-button"
                  onClick={() => void chooseFolder()}
                  disabled={isInstalling}
                >
                  Choose Minecraft Directory
                </button>
                <p className="onboarding-copy">
                  Install Minecraft first if you do not have a valid directory
                  yet.
                </p>
              </>
            ) : (
              <>
                <button
                  className="onboarding-install-button"
                  onClick={() => void handleOnboardingInstallDefault()}
                  disabled={isInstalling}
                >
                  Install mods
                </button>
                <button
                  className="onboarding-existing-button"
                  onClick={() => void dismissOnboarding()}
                  disabled={isInstalling}
                >
                  Install in existing profile
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
      <div className="app-container">
        <div className="app-grid">
          <section className="panel settings-panel">
            <h2 className="panel-title">Settings</h2>

            <strong className="field-label">Current Profile:</strong>
            <div className="field-block profile-row">
              <div
                className="profile-icon-badge"
                title={selectedProfile?.icon || "Profile icon"}
              >
                {selectedProfileIcon}
              </div>
              <select
                className="select-input"
                value={selectedProfileId}
                onChange={(e) => setSelectedProfileId(e.target.value)}
                disabled={isInstalling || profiles.length === 0}
              >
                {profiles.length === 0 ? (
                  <option value="">No profiles found</option>
                ) : (
                  profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                      {profile.lastVersionId
                        ? ` (${profile.lastVersionId})`
                        : ""}
                    </option>
                  ))
                )}
              </select>
              <button
                className="open-folder-button"
                onClick={() => void openSelectedProfileFolder()}
                disabled={areServerActionsDisabled}
                title="Open selected profile folder"
              >
                📂
              </button>
            </div>

            <div className="flex ac">
              <label className="field-label">
                {" "}
                <strong>Profile Name:</strong>{" "}
              </label>{" "}
              <input
                className="text-input"
                style={{ maxWidth: "200px", marginLeft: "6px" }}
                type="text"
                value={profileNameInput}
                placeholder="Enter profile name..."
                onChange={(e) => setProfileNameInput(e.target.value)}
                onBlur={() => void saveProfileName()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.currentTarget.blur();
                  }
                }}
                disabled={isInstalling || !selectedProfile}
              />
            </div>

            <div className="flex ac mt-4">
              {" "}
              <strong className="field-label">Version:</strong>
              {selectedProfile?.lastVersionId ? (
                <span>
                  {selectedProfile.lastVersionId}
                  {getMatchStatusIcon(versionMatches)}
                </span>
              ) : (
                <span>Unavailable</span>
              )}
            </div>

            <div className="mt-4">
              <div className="flex ac">
                <div className="field-label mr-2">
                  <strong>Required Mods Installed:</strong>{" "}
                </div>
                <span>
                  {installedRequiredModsCount} / {requiredServerModsCount}{" "}
                  {getMatchStatusIcon(
                    installedRequiredModsCount === requiredServerModsCount
                  )}
                </span>
              </div>
              <div className="flex ac">
                <div className="field-label mr-2">
                  <span>Optional Mods Installed:</span>
                </div>
                <span>
                  {installedOptionalModsCount} / {optionalServerModsCount}{" "}
                  {getMatchStatusIcon(
                    installedOptionalModsCount === optionalServerModsCount
                  )}
                </span>
              </div>
            </div>
            <div className="field-block">
              {isLoadingInstalledMods ? (
                <span>Checking installed mods...</span>
              ) : (
                <div className="mods-summary">
                  <div className="mods-list">
                    {installedModListItems.length === 0 ? (
                      <div>No installed mods found.</div>
                    ) : (
                      <ModList items={installedModListItems} />
                    )}
                  </div>
                  {/* {TODO: Add a small btn here to delete extra mods, with a popup to confirm} */}
                </div>
              )}
            </div>

            <strong className="field-label">Minecraft Directory:</strong>
            <div className="field-block directory-row">
              <input
                className="text-input"
                type="text"
                value={dir}
                placeholder="Enter or select Minecraft directory..."
                onChange={(e) => setDir(e.target.value)}
                readOnly
                disabled={isInstalling}
              />
              <button
                className="browse-button"
                onClick={chooseFolder}
                disabled={isInstalling}
              >
                📂
              </button>
            </div>
          </section>

          <section className="panel server-panel">
            <h2 className="panel-title">
              {isServerInfoUnavailable
                ? "Server Info (Unable to reach server)"
                : "Server Info"}
            </h2>
            <div className="flex">
              <strong className="field-label">Version: </strong>
              <div>
                {isLoadingRequiredForgeVersion
                  ? "Checking required Forge version..."
                  : requiredForgeVersionId
                  ? formatForgeVersion(requiredForgeVersionId)
                  : "Unavailable"}
              </div>
            </div>

            <div>
              <div className="field-label">
                <strong>Required mods: </strong> {requiredServerModsCount}{" "}
                <strong>Optional mods: </strong> {optionalServerModsCount}
              </div>
              <div className="server-mods-list">
                {isLoadingServerMods ? (
                  <div>Loading server mods...</div>
                ) : serverModListItems.length === 0 ? (
                  <div>No mod data available.</div>
                ) : (
                  <ModList items={serverModListItems} />
                )}
              </div>
            </div>
          </section>
        </div>

        <div className="installer-card">
          <div className="installer-progress">
            <div>
              {isInstalling ? (
                <div>{progress.message || "Installing Forge and mods..."}</div>
              ) : isLoadingRequiredForgeVersion || isLoadingServerMods ? (
                <div>Checking whether the profile is up to date...</div>
              ) : !selectedProfile ? (
                <div>Select a profile to check its status.</div>
              ) : isLaunchingGame || playFeedback ? (
                <div>{playFeedback || "Opening Minecraft Launcher..."}</div>
              ) : isLoadingInstalledMods || isLoadingProfileServerIp ? (
                <div>Checking installed mods and server info...</div>
              ) : isProfileUpToDate ? (
                <div>Your profile is up to date with server mods! ✅</div>
              ) : (
                <div>Your profile is not up to date with server mods. ❌</div>
              )}
            </div>
            <ProgressBar progress={progress} />
            <div className="ram-control">
              <strong className="ram-label">Profile RAM:</strong>
              <input
                className="ram-slider"
                type="range"
                min={1024}
                max={Math.max(1024, systemMemoryMb)}
                step={512}
                value={profileRamMb}
                onChange={(e) => setProfileRamMb(Number(e.target.value))}
                onPointerUp={(e) =>
                  void saveProfileRamMb(
                    Number((e.target as HTMLInputElement).value)
                  )
                }
                onMouseUp={(e) =>
                  void saveProfileRamMb(
                    Number((e.target as HTMLInputElement).value)
                  )
                }
                onTouchEnd={(e) =>
                  void saveProfileRamMb(
                    Number((e.target as HTMLInputElement).value)
                  )
                }
                onKeyUp={(e) =>
                  void saveProfileRamMb(
                    Number((e.target as HTMLInputElement).value)
                  )
                }
                onBlur={(e) =>
                  void saveProfileRamMb(
                    Number((e.target as HTMLInputElement).value)
                  )
                }
                disabled={isInstalling || !dir || !selectedProfileId}
              />
              <span className="ram-value">{formatRamLabel(profileRamMb)}</span>
            </div>
          </div>
          <div className="actions">
            <div className="clean-row">
              <button
                className="forge-installer-button clean"
                onClick={() => void handleCleanInstall()}
                disabled={
                  isInstalling ||
                  isLaunchingGame ||
                  !dir ||
                  isServerInfoUnavailable
                }
              >
                {isInstalling ? "Installing Forge..." : "Clean Installation"}
              </button>
              <label className="remove-unused-toggle">
                <input
                  type="checkbox"
                  checked={removeUnusedMods}
                  onChange={(e) => setRemoveUnusedMods(e.target.checked)}
                  disabled={areServerActionsDisabled}
                />
                <span>remove unused mods</span>
              </label>
            </div>

            <button
              className="forge-installer-button update"
              onClick={() =>
                void (isProfileUpToDate
                  ? handlePlaySelectedProfile()
                  : handleUpdateSelectedProfile())
              }
              disabled={areServerActionsDisabled}
            >
              {isProfileUpToDate ? "OPEN" : "Update"}
            </button>
          </div>
        </div>

        {error ? <p className="app-error">{error}</p> : null}
      </div>
    </div>
  );
}
