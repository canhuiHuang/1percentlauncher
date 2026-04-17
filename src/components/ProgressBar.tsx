import { useEffect, useState } from "react";

type McProfile = {
  id: string;
  name: string;
  gameDir?: string;
  lastVersionId?: string;
  lastUsed?: string;
};

type ForgeInstallProgress = {
  stage: "searching" | "downloading" | "installing" | "done" | "error";
  percent: number;
  message: string;
};

type ForgeInstallerProps = {
  mcDir: string;
  profiles: McProfile[];
  selectedProfileId: string;
  setSelectedProfileId: React.Dispatch<React.SetStateAction<string>>;
  error: string;
  setError: React.Dispatch<React.SetStateAction<string>>;
  isInstalling: boolean;
  setIsInstalling: React.Dispatch<React.SetStateAction<boolean>>;
  reloadProfiles: () => Promise<McProfile[]>;
};

export default function ForgeInstaller({
  mcDir,
  profiles,
  selectedProfileId,
  setSelectedProfileId,
  error,
  setError,
  isInstalling,
  setIsInstalling,
  reloadProfiles,
}: ForgeInstallerProps) {
  const [progress, setProgress] = useState<ForgeInstallProgress>({
    stage: "searching",
    percent: 0,
    message: "",
  });

  useEffect(() => {
    const unsubscribe = window.mc.onForgeInstallProgress((payload) => {
      setProgress(payload);
    });

    return unsubscribe;
  }, []);

  async function handleCleanInstall() {
    try {
      setError("");
      setIsInstalling(true);
      setProgress({
        stage: "searching",
        percent: 0,
        message: "Starting...",
      });

      const result = await window.mc.installForgeClean(mcDir);
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

  async function handleInstallInSelectedProfile() {
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
        message: "Starting...",
      });

      await window.mc.installForgeIntoProfile(mcDir, selectedProfileId);
      await reloadProfiles();
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

  return (
    <div style={{ maxWidth: 420 }}>
      <select
        value={selectedProfileId}
        onChange={(e) => setSelectedProfileId(e.target.value)}
        disabled={isInstalling || profiles.length === 0}
        style={{ width: "100%", marginBottom: 12 }}
      >
        {profiles.map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.name}
            {profile.lastVersionId ? ` (${profile.lastVersionId})` : ""}
          </option>
        ))}
      </select>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={handleCleanInstall} disabled={isInstalling || !mcDir}>
          {isInstalling ? "Installing Forge..." : "Clean Installation"}
        </button>

        <button
          onClick={handleInstallInSelectedProfile}
          disabled={isInstalling || !mcDir || !selectedProfileId}
        >
          Install in selected profile
        </button>
      </div>

      <div
        style={{
          marginTop: 12,
          width: "100%",
          height: 16,
          border: "1px solid #999",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${progress.percent}%`,
            height: "100%",
            transition: "width 0.2s ease",
            background: "#4caf50",
          }}
        />
      </div>

      <div style={{ marginTop: 8 }}>{progress.message || "Idle"}</div>

      {error ? <div style={{ marginTop: 8, color: "red" }}>{error}</div> : null}
    </div>
  );
}
