import { useEffect, useMemo, useState } from "react";
import ModList, { ModListItem, ModTag } from "./components/ModList";
import ProgressBar from "./components/ProgressBar";
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

function normalizeModName(name: string): string {
  return name.trim().toLowerCase();
}

function formatForgeVersion(versionId: string): string {
  return versionId.replace(/^forge-/, "Forge ");
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

  const selectedProfile =
    profiles.find((profile) => profile.id === selectedProfileId) ?? null;

  useEffect(() => {
    setProfileNameInput(selectedProfile?.name ?? "");
  }, [selectedProfile?.id, selectedProfile?.name]);

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
        const savedDir = await window.mc.getSavedMinecraftDir();
        setDir(savedDir);
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

  async function chooseFolder() {
    try {
      setError("");
      const selectedDir = await window.mc.pickMinecraftDir();

      if (!selectedDir) return;

      setDir(selectedDir);
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

  return (
    <div className="app-shell">
      <div className="app-container">
        <h1 className="app-title">Minecraft Installer</h1>

        <div className="app-grid">
          <section className="panel settings-panel">
            <h2 className="panel-title">Settings</h2>

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

            <strong className="field-label">Current Profile:</strong>
            <div className="field-block">
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
            </div>

            <div className="flex ac">
              <label className="field-label">
                {" "}
                <strong>Profile Name:</strong>{" "}
              </label>{" "}
              <input
                className="text-input"
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

            <div className="flex ac">
              {" "}
              <strong className="field-label">Version:</strong>
              {selectedProfile?.lastVersionId ? (
                <span>
                  {selectedProfile.lastVersionId}
                  <span
                    className={`status-icon ${
                      versionMatches ? "status-ok" : "status-bad"
                    }`}
                  >
                    {versionMatches ? "✅" : "❌"}
                  </span>
                </span>
              ) : (
                <span>Unavailable</span>
              )}
            </div>

            <div>
              <div className="flex ac">
                <div className="field-label mr-2">Required Mods Installed:</div>
                <span>
                  {installedRequiredModsCount} / {requiredServerModsCount}{" "}
                  <span
                    className={`status-icon ${
                      installedRequiredModsCount === requiredServerModsCount
                        ? "status-ok"
                        : "status-bad"
                    }`}
                  >
                    {" "}
                    {installedRequiredModsCount === requiredServerModsCount
                      ? "✅"
                      : "❌"}
                  </span>
                </span>
              </div>
              <div className="flex ac">
                <div className="field-label mr-2">Optional Mods Installed:</div>
                <span>
                  {installedOptionalModsCount} / {optionalServerModsCount}{" "}
                  <span
                    className={`status-icon ${
                      installedOptionalModsCount === optionalServerModsCount
                        ? "status-ok"
                        : "status-bad"
                    }`}
                  >
                    {installedOptionalModsCount === optionalServerModsCount
                      ? "✅"
                      : "❌"}
                  </span>
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
                </div>
              )}
            </div>
          </section>

          <section className="panel server-panel">
            <h2 className="panel-title">Server Info</h2>
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
          <ProgressBar
            mcDir={dir}
            selectedProfileId={selectedProfileId}
            setSelectedProfileId={setSelectedProfileId}
            error={error}
            setError={setError}
            isInstalling={isInstalling}
            setIsInstalling={setIsInstalling}
            reloadProfiles={reloadProfiles}
          />
        </div>

        {error ? <p className="app-error">{error}</p> : null}
      </div>
    </div>
  );
}
