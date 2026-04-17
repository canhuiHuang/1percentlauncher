import { useEffect, useState } from "react";
import ForgeInstaller from "./components/ProgressBar";
import { McProfile } from "../electron/types/minecraft";

export default function App() {
  const [dir, setDir] = useState("");
  const [profiles, setProfiles] = useState<McProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [error, setError] = useState("");
  const [isInstalling, setIsInstalling] = useState(false);

  // Load Minecraft Directory
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

  // Load Profiles
  useEffect(() => {
    if (!dir) return;

    async function loadProfiles() {
      try {
        const profilesRes = await window.mc.getProfiles(dir);
        setProfiles(profilesRes);

        if (profilesRes.length > 0) setSelectedProfileId(profilesRes[0].id);
      } catch {
        setError("Failed to load profiles.");
        setProfiles([]);
      }
    }

    loadProfiles();
  }, [dir]);

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
        // keep current selection if it still exists
        if (prev && profilesRes.some((p) => p.id === prev)) {
          return prev;
        }

        // otherwise default to most recently used
        return profilesRes[0]?.id ?? "";
      });

      return profilesRes;
    } catch (err) {
      setError("Failed to reload profiles.");
      setProfiles([]);
      setSelectedProfileId("");
      return [];
    }
  }

  return (
    <div style={{ padding: 20, fontFamily: "Arial, sans-serif" }}>
      <h1>Minecraft Installer</h1>

      <p>
        <strong>Directory:</strong> {dir || "None selected"}
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={chooseFolder}>Choose Minecraft Folder</button>
      </div>

      <ForgeInstaller
        mcDir={dir}
        profiles={profiles}
        selectedProfileId={selectedProfileId}
        setSelectedProfileId={setSelectedProfileId}
        error={error}
        setError={setError}
        isInstalling={isInstalling}
        setIsInstalling={setIsInstalling}
        reloadProfiles={reloadProfiles}
      />

      {error ? <p style={{ color: "red" }}>{error}</p> : null}
    </div>
  );
}
