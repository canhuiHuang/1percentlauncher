import { useEffect, useState } from "react";

type ForgeInstallProgress = {
  stage: "searching" | "downloading" | "installing" | "done" | "error";
  percent: number;
  message: string;
};

export default function ForgeInstaller({ mcDir }: { mcDir: string }) {
  const [progress, setProgress] = useState<ForgeInstallProgress>({
    stage: "searching",
    percent: 0,
    message: "",
  });
  const [isInstalling, setIsInstalling] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = window.mc.onForgeInstallProgress((payload) => {
      setProgress(payload);
    });

    return unsubscribe;
  }, []);

  async function handleInstallForge() {
    try {
      setError("");
      setIsInstalling(true);
      setProgress({
        stage: "searching",
        percent: 0,
        message: "Starting...",
      });

      await window.mc.installForgeFromDropbox(mcDir);
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
      <button onClick={handleInstallForge} disabled={isInstalling || !mcDir}>
        {isInstalling ? "Installing Forge..." : "Install Forge"}
      </button>

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
