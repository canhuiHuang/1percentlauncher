import { useEffect, useMemo, useRef, useState } from "react";
import ModList, {
  ModListAction,
  ModListItem,
  ModTag,
} from "./components/ModList";
import ProgressBar, { ForgeInstallProgress } from "./components/ProgressBar";
import { McProfile } from "../electron/types/minecraft";
import mcIcon from "./assets/mc-icon.png";

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
  disabled?: boolean;
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

const APP_VERSION = "0.0.3";

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
  const mc = window.mc;
  const modFilterOptions = [
    { value: "all", label: "All mods" },
    { value: "active", label: "Active only" },
    { value: "disabled", label: "Disabled only" },
    { value: "required", label: "Tag: required" },
    { value: "local", label: "Tag: local" },
    { value: "ambient", label: "Tag: ambient" },
    { value: "util", label: "Tag: util" },
    { value: "performance", label: "Tag: performance" },
    { value: "extra", label: "Tag: extra" },
  ] as const;
  const [dir, setDir] = useState("");
  const [profiles, setProfiles] = useState<McProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [error, setError] = useState("");
  const [isInstalling, setIsInstalling] = useState(false);
  const [requiredForgeVersionId, setRequiredForgeVersionId] = useState("");
  const [serverIp, setServerIp] = useState("");
  const [isLoadingRequiredForgeVersion, setIsLoadingRequiredForgeVersion] =
    useState(true);
  const [serverMods, setServerMods] = useState<ServerModInfo[]>([]);
  const [isLoadingServerMods, setIsLoadingServerMods] = useState(true);
  const [copyServerIpLabel, setCopyServerIpLabel] = useState("COPY");
  const [installedMods, setInstalledMods] = useState<InstalledModInfo[]>([]);
  const [isLoadingInstalledMods, setIsLoadingInstalledMods] = useState(false);
  const [profileNameInput, setProfileNameInput] = useState("");
  const [systemMemoryMb, setSystemMemoryMb] = useState(2048);
  const [profileRamMb, setProfileRamMb] = useState(1024);
  const [profileHasServerIp, setProfileHasServerIp] = useState(false);
  const [isLoadingProfileServerIp, setIsLoadingProfileServerIp] =
    useState(false);
  const [installedModFilter, setInstalledModFilter] =
    useState<(typeof modFilterOptions)[number]["value"]>("all");
  const [isLaunchingGame, setIsLaunchingGame] = useState(false);
  const [playFeedback, setPlayFeedback] = useState("");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingRemoveUnusedMods, setOnboardingRemoveUnusedMods] =
    useState(false);
  const [defaultMinecraftDir, setDefaultMinecraftDir] = useState("");
  const [defaultMinecraftDirExists, setDefaultMinecraftDirExists] =
    useState(true);
  const [hasCustomMinecraftDir, setHasCustomMinecraftDir] = useState(false);
  const [progress, setProgress] = useState<ForgeInstallProgress>({
    stage: "searching",
    percent: 0,
    message: "",
  });
  const [appUpdateState, setAppUpdateState] = useState<{
    status:
      | "idle"
      | "disabled"
      | "checking"
      | "available"
      | "downloading"
      | "downloaded"
      | "up-to-date"
      | "error";
    message: string;
    progress: number | null;
  }>({
    status: "idle",
    message: "",
    progress: null,
  });
  const hasPromptedForUpdateRef = useRef(false);
  const hasPromptedToInstallUpdateRef = useRef(false);

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
    if (!mc) {
      return;
    }

    const unsubscribe = window.mc.onForgeInstallProgress((payload) => {
      setProgress(payload);
    });

    return unsubscribe;
  }, [mc]);

  useEffect(() => {
    if (!mc) {
      setError("Electron bridge is unavailable.");
      return;
    }

    function handleAppUpdateState(payload: {
      status:
        | "idle"
        | "disabled"
        | "checking"
        | "available"
        | "downloading"
        | "downloaded"
        | "up-to-date"
        | "error";
      message: string;
      progress: number | null;
    }) {
      setAppUpdateState(payload);

      if (payload.status === "available" && !hasPromptedForUpdateRef.current) {
        hasPromptedForUpdateRef.current = true;

        const shouldUpdate = window.confirm(
          `${payload.message}\n\nPress OK to download and install it.`
        );

        if (shouldUpdate) {
          void mc.downloadAppUpdate();
        }
      }

      if (
        payload.status === "downloaded" &&
        !hasPromptedToInstallUpdateRef.current
      ) {
        hasPromptedToInstallUpdateRef.current = true;

        const shouldInstall = window.confirm(
          `${payload.message}\n\nPress OK to restart and install it now.`
        );

        if (shouldInstall) {
          void mc.installDownloadedUpdate();
        }
      }
    }

    void mc.getAppUpdateState().then(handleAppUpdateState);

    const unsubscribe = mc.onAppUpdateState(handleAppUpdateState);

    return unsubscribe;
  }, [mc]);

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

  // const appUpdateSummary =
  //   appUpdateState.status === "checking"
  //     ? "Checking for launcher updates..."
  //     : appUpdateState.status === "downloading"
  //     ? `Downloading launcher update${
  //         appUpdateState.progress != null
  //           ? ` (${Math.round(appUpdateState.progress)}%)`
  //           : "..."
  //       }`
  //     : appUpdateState.status === "available"
  //     ? "Launcher update available"
  //     : appUpdateState.status === "downloaded"
  //     ? "Launcher update ready to install"
  //     : appUpdateState.status === "up-to-date"
  //     ? "Launcher is up to date"
  //     : appUpdateState.status === "error"
  //     ? "Launcher update check failed"
  //     : appUpdateState.status === "disabled"
  //     ? "Launcher updates disabled in development build"
  //     : "Launcher update status idle";

  const activeInstalledModNames = useMemo(
    () =>
      new Set(
        installedMods
          .filter((mod) => !mod.disabled)
          .map((mod) => normalizeModName(mod.name))
      ),
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
        activeInstalledModNames.has(normalizedName)
        ? count + 1
        : count;
    }, 0);
  }, [activeInstalledModNames, serverMods]);

  const installedOptionalModsCount = useMemo(() => {
    if (serverMods.length === 0 || installedMods.length === 0) {
      return 0;
    }

    return serverMods.reduce((count, mod) => {
      const normalizedName = normalizeModName(mod.name);
      return normalizedName.startsWith("local") &&
        activeInstalledModNames.has(normalizedName)
        ? count + 1
        : count;
    }, 0);
  }, [activeInstalledModNames, serverMods]);

  const extraInstalledModsCount = useMemo(
    () =>
      installedMods.filter((mod) => {
        if (mod.disabled) {
          return false;
        }

        return !serverModNames.has(normalizeModName(mod.name));
      }).length,
    [installedMods, serverModNames]
  );

  const disabledModsCount = useMemo(
    () => installedMods.filter((mod) => mod.disabled).length,
    [installedMods]
  );

  const selectedProfileHasServerIp =
    !!selectedProfile && !isLoadingProfileServerIp && profileHasServerIp;
  const hasRequiredModsInstalled =
    installedRequiredModsCount === requiredServerModsCount;
  const isOnlyMissingServerIp =
    !!selectedProfile &&
    versionMatches &&
    hasRequiredModsInstalled &&
    !selectedProfileHasServerIp;

  const isProfileUpToDate =
    !!selectedProfile &&
    versionMatches &&
    hasRequiredModsInstalled &&
    selectedProfileHasServerIp;
  const isLoadingServerInfo =
    isLoadingRequiredForgeVersion || isLoadingServerMods;
  const isServerInfoUnavailable =
    !isLoadingRequiredForgeVersion &&
    !isLoadingServerMods &&
    !requiredForgeVersionId;
  const isOnboardingMinecraftDirMissing =
    showOnboarding && !defaultMinecraftDirExists && !hasCustomMinecraftDir;
  const selectedProfileIcon = selectedProfile?.icon
    ? PROFILE_ICON_EMOJIS[selectedProfile.icon] ?? "🎮"
    : "🎮";
  const isSelectedProfileCustomIcon =
    !!selectedProfile?.icon && selectedProfile.icon.startsWith("data:image/");
  const areServerActionsDisabled =
    isInstalling ||
    isLaunchingGame ||
    !dir ||
    !selectedProfileId ||
    isServerInfoUnavailable;
  const areModActionsDisabled =
    isInstalling || isLaunchingGame || !dir || !selectedProfileId;
  const extraModNames = useMemo(
    () =>
      installedMods
        .filter((mod) => !serverModNames.has(normalizeModName(mod.name)))
        .map((mod) => mod.name),
    [installedMods, serverModNames]
  );

  const installedModListItems = useMemo<ModListItem[]>(
    () =>
      installedMods.map((mod) => {
        const normalizedName = normalizeModName(mod.name);
        const tags: ModTag[] = serverModNames.has(normalizedName)
          ? getModTags(mod.name)
          : ["extra"];
        const actions: ModListAction[] = [];

        if (mod.disabled) {
          tags.push("disabled");
          actions.push({
            key: "enable",
            label: "Enable",
            onClick: () => void handleEnableMod(mod.name),
            disabled: areModActionsDisabled,
          });
          actions.push({
            key: "remove",
            label: "Remove",
            tone: "danger",
            onClick: () => void handleRemoveMod(mod.name),
            disabled: areModActionsDisabled,
          });
        } else {
          if (tags.includes("extra")) {
            actions.push({
              key: "disable",
              label: "Disable",
              onClick: () => void handleDisableMod(mod.name),
              disabled: areModActionsDisabled,
            });
          }

          actions.push({
            key: "remove",
            label: "Remove",
            tone: "danger",
            onClick: () => void handleRemoveMod(mod.name),
            disabled: areModActionsDisabled,
          });
        }

        return {
          key: `${mod.name}-${mod.modified}`,
          name: mod.name,
          tags,
          status:
            tags.includes("extra") || mod.disabled ? undefined : "installed",
          actions,
        };
      }),
    [
      areModActionsDisabled,
      handleDisableMod,
      handleEnableMod,
      handleRemoveMod,
      installedMods,
      serverModNames,
    ]
  );

  const serverModListItems = useMemo<ModListItem[]>(
    () =>
      serverMods.map((mod) => ({
        key: mod.id,
        name: mod.name,
        tags: getModTags(mod.name),
        status: activeInstalledModNames.has(normalizeModName(mod.name))
          ? "installed"
          : "missing",
      })),
    [activeInstalledModNames, serverMods]
  );

  const filteredInstalledModListItems = useMemo(() => {
    if (installedModFilter === "all") {
      return installedModListItems;
    }

    return installedModListItems.filter((item) => {
      if (installedModFilter === "active") {
        return !item.tags.includes("disabled");
      }

      if (installedModFilter === "disabled") {
        return item.tags.includes("disabled");
      }

      return item.tags.includes(installedModFilter as ModTag);
    });
  }, [installedModFilter, installedModListItems]);

  useEffect(() => {
    if (!mc) {
      setError("Electron bridge is unavailable.");
      return;
    }

    async function loadInitialDir() {
      try {
        const [dirStatus, totalMemoryMb, config] = await Promise.all([
          mc.getMinecraftDirStatus(),
          mc.getSystemMemoryMb(),
          mc.getAppConfig(),
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
  }, [mc]);

  useEffect(() => {
    if (!mc) {
      return;
    }

    let isActive = true;

    async function loadServerInfo() {
      try {
        setIsLoadingRequiredForgeVersion(true);
        setIsLoadingServerMods(true);

        const [forgeInfo, mods] = await Promise.all([
          mc.getRequiredForgeInfo(),
          mc.getServerMods(),
        ]);

        if (!isActive) return;

        setRequiredForgeVersionId(forgeInfo.forgeVersionId);
        setServerIp(forgeInfo.serverIp);
        setServerMods(mods);
      } catch {
        if (!isActive) return;

        setRequiredForgeVersionId("");
        setServerIp("");
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
  }, [mc]);

  useEffect(() => {
    if (!mc || !dir) return;

    async function loadProfiles() {
      try {
        const profilesRes = await mc.getProfiles(dir);
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
  }, [dir, mc]);

  useEffect(() => {
    if (copyServerIpLabel === "COPY") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCopyServerIpLabel("COPY");
    }, 1800);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [copyServerIpLabel]);

  async function handleCopyServerIp() {
    if (!serverIp) {
      return;
    }

    try {
      await navigator.clipboard.writeText(serverIp);
      setCopyServerIpLabel("COPIED");
    } catch {
      setCopyServerIpLabel("FAILED");
    }
  }

  useEffect(() => {
    if (!mc || !dir || !selectedProfileId) {
      setInstalledMods([]);
      setIsLoadingInstalledMods(false);
      return;
    }

    let isActive = true;

    async function loadInstalledMods() {
      try {
        setIsLoadingInstalledMods(true);
        const mods = await mc.getInstalledMods(dir, selectedProfileId);

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
  }, [dir, selectedProfileId, mc]);

  useEffect(() => {
    if (!mc || !dir || !selectedProfileId) {
      setProfileHasServerIp(false);
      setIsLoadingProfileServerIp(false);
      return;
    }

    let isActive = true;

    async function loadProfileServerIpStatus() {
      try {
        setProfileHasServerIp(false);
        setIsLoadingProfileServerIp(true);
        const hasServerIp = await mc.profileHasServerIp(dir, selectedProfileId);

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
  }, [dir, selectedProfileId, mc]);

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

  async function reloadInstalledMods(profileId = selectedProfileId) {
    if (!dir || !profileId) {
      setInstalledMods([]);
      return;
    }

    const mods = await window.mc.getInstalledMods(dir, profileId);
    setInstalledMods(mods);
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
      const result = await window.mc.installForgeCleanDefault(
        installDir,
        onboardingRemoveUnusedMods
      );
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
        await window.mc.updateSelectedProfile(dir, selectedProfileId, false);
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

  async function handleDisableMod(modName: string) {
    if (!dir || !selectedProfileId) {
      return;
    }

    try {
      setError("");
      await window.mc.disableProfileMod(dir, selectedProfileId, modName);
      await reloadInstalledMods();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disable mod.");
    }
  }

  async function handleEnableMod(modName: string) {
    if (!dir || !selectedProfileId) {
      return;
    }

    try {
      setError("");
      await window.mc.enableProfileMod(dir, selectedProfileId, modName);
      await reloadInstalledMods();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enable mod.");
    }
  }

  async function handleRemoveMod(modName: string) {
    if (!dir || !selectedProfileId) {
      return;
    }

    const shouldRemove = window.confirm(
      `Remove ${modName} from this profile? This deletes the file from the active or disabled mod storage for the selected profile.`
    );

    if (!shouldRemove) {
      return;
    }

    try {
      setError("");
      await window.mc.removeProfileMod(dir, selectedProfileId, modName);
      await reloadInstalledMods();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove mod.");
    }
  }

  async function handleRemoveAllExtraMods() {
    if (!dir || !selectedProfileId || extraModNames.length === 0) {
      return;
    }

    const uniqueExtraModNames = [...new Set(extraModNames)];
    const shouldRemove = window.confirm(
      `Remove all ${uniqueExtraModNames.length} extra mods from this profile? This will delete active and disabled extra mod files that are not part of the server mod list.`
    );

    if (!shouldRemove) {
      return;
    }

    try {
      setError("");
      await Promise.all(
        uniqueExtraModNames.map((modName) =>
          window.mc.removeProfileMod(dir, selectedProfileId, modName)
        )
      );
      await reloadInstalledMods();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to remove extra mods."
      );
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

  async function openLauncherDownloadsFolder() {
    try {
      setError("");
      await window.mc.openLauncherDownloadsFolder();
    } catch {
      setError("Failed to open launcher's download folder.");
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
                <label className="onboarding-checkbox-row">
                  <input
                    type="checkbox"
                    checked={onboardingRemoveUnusedMods}
                    onChange={(e) =>
                      setOnboardingRemoveUnusedMods(e.target.checked)
                    }
                    disabled={isInstalling}
                  />
                  <span>Remove unused mods</span>
                </label>
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
            <h2 className="panel-title panel-title-with-icon">
              <img className="panel-title-icon" src={mcIcon} alt="" />
              <span>Current Profile</span>
            </h2>
            <div className="field-block profile-row">
              <div
                className="profile-icon-badge"
                title={selectedProfile?.icon || "Profile icon"}
              >
                {isSelectedProfileCustomIcon ? (
                  <img
                    className="profile-icon-image"
                    src={selectedProfile.icon}
                    alt={`${selectedProfile?.name || "Profile"} icon`}
                  />
                ) : (
                  selectedProfileIcon
                )}
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
              <div className="flex ac">
                <div className="field-label mr-2">
                  <span>Extra Mods:</span>
                </div>
                <span>
                  {extraInstalledModsCount}{" "}
                  <strong className="mods-counter-sep">|</strong>{" "}
                  <span>Disabled Mods:</span> {disabledModsCount}
                </span>
              </div>
              {extraInstalledModsCount > 0 ? (
                <div className="mods-warning">
                  You currently have extra mods installed. If the game crashes,
                  try removing some or all of those.
                </div>
              ) : null}
            </div>
            <div className="field-block">
              {isLoadingInstalledMods ? (
                <span>Checking installed mods...</span>
              ) : (
                <div className="mods-summary">
                  <div className="mods-toolbar">
                    <select
                      className="select-input mods-filter-select"
                      value={installedModFilter}
                      onChange={(e) =>
                        setInstalledModFilter(
                          e.target
                            .value as (typeof modFilterOptions)[number]["value"]
                        )
                      }
                      disabled={areModActionsDisabled}
                    >
                      {modFilterOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="mods-bulk-remove-button"
                      onClick={() => void handleRemoveAllExtraMods()}
                      disabled={
                        areModActionsDisabled || extraModNames.length === 0
                      }
                    >
                      Remove all extra mods
                    </button>
                  </div>
                  <div className="mods-list">
                    {filteredInstalledModListItems.length === 0 ? (
                      <div>No installed mods found.</div>
                    ) : (
                      <ModList items={filteredInstalledModListItems} />
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="f-last">
              <strong className="field-label mb-2">Minecraft Directory:</strong>
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
                  title="Choose a different minecraft directory"
                >
                  📂
                </button>
              </div>
            </div>
          </section>

          <section className="panel server-panel">
            {isLoadingServerInfo ? (
              <div
                className="server-info-loading"
                role="status"
                aria-live="polite"
              >
                <span
                  className="server-info-loading-spinner"
                  aria-hidden="true"
                />
                <span>Loading server info...</span>
              </div>
            ) : null}
            <h2 className="panel-title">
              {isServerInfoUnavailable
                ? "🌐 Server Info (Unable to reach server)"
                : "🌐 Server Info"}
            </h2>
            <div className="server-ip-card">
              <div className="server-ip-label">Server IP</div>
              <div className="server-ip-row">
                <div className="server-ip-value">
                  {isLoadingRequiredForgeVersion
                    ? "Checking server IP..."
                    : serverIp || "Unavailable"}
                </div>
                <button
                  type="button"
                  className="server-ip-copy-button"
                  onClick={() => void handleCopyServerIp()}
                  disabled={isLoadingRequiredForgeVersion || !serverIp}
                >
                  {copyServerIpLabel}
                </button>
              </div>
            </div>
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
              ) : isOnlyMissingServerIp ? (
                <div>
                  Your profile is missing the server in the multiplayer list.
                  Press Update to add it. ❌
                </div>
              ) : (
                <div>Your profile is not up to date with server mods. ❌</div>
              )}
            </div>
            <ProgressBar progress={progress} />
            <div className="below-progress-bar row flex mt-4">
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
                <span className="ram-value">
                  {formatRamLabel(profileRamMb)}
                </span>
              </div>

              <button
                className="open-folder-button-2"
                onClick={() => void openLauncherDownloadsFolder()}
                disabled={isInstalling}
                title="Open launcher's download folder"
              >
                📂
              </button>
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
            </div>

            <button
              className={`forge-installer-button ${
                isProfileUpToDate ? "open" : "update"
              }`}
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

        <div
          className={`update-status-bar update-status-${appUpdateState.status}`}
        >
          {/* <div className="update-status-summary">{appUpdateSummary}</div> */}
          <div className="update-status-message">
            {appUpdateState.message || " "}
          </div>
        </div>

        {error ? <p className="app-error">{error}</p> : null}
      </div>
    </div>
  );
}
