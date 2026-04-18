import { useEffect, useState } from "react";
import { McProfile } from "../../electron/types/minecraft";
import "./ProgressBar.css";

type ForgeInstallProgress = {
  stage: "searching" | "downloading" | "installing" | "done" | "error";
  percent: number;
  message: string;
};

type ForgeInstallerProps = {
  mcDir: string;
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
    <div>
      <div className="forge-installer-actions">
        <button
          className="forge-installer-button"
          onClick={handleCleanInstall}
          disabled={isInstalling || !mcDir}
        >
          {isInstalling ? "Installing Forge..." : "Clean Installation"}
        </button>

        <button
          className="forge-installer-button"
          onClick={handleInstallInSelectedProfile}
          disabled={isInstalling || !mcDir || !selectedProfileId}
        >
          Install in selected profile
        </button>
      </div>

      <div className="forge-progress-track">
        <div
          className="forge-progress-fill"
          style={{ width: `${progress.percent}%` }}
        />
      </div>

      <div className="forge-progress-message">{progress.message || "Idle"}</div>

      {error ? <div className="forge-progress-error">{error}</div> : null}
    </div>
  );
}
