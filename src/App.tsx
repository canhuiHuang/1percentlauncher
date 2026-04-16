import { useEffect, useState } from "react";
import ForgeInstaller from "./components/ProgressBar";

type McProfile = {
  id: string;
  name: string;
  gameDir?: string;
  lastVersionId?: string;
};

export default function App() {
  const [dir, setDir] = useState("");
  const [profiles, setProfiles] = useState<McProfile[]>([]);
  const [error, setError] = useState("");

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

  async function chooseFolder() {
    try {
      setError("");
      const selectedDir = await window.mc.pickMinecraftDir();

      if (!selectedDir) {
        return;
      }

      setDir(selectedDir);
      setProfiles([]);
    } catch {
      setError("Failed to select Minecraft directory.");
    }
  }

  async function loadProfiles() {
    try {
      setError("");
      const nextProfiles = await window.mc.getProfiles(dir);
      setProfiles(nextProfiles);
    } catch {
      setError("Failed to load profiles from this directory.");
      setProfiles([]);
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
        <button onClick={loadProfiles} disabled={!dir}>
          Load Profiles
        </button>
      </div>

      <ForgeInstaller mcDir={dir} />

      {error ? <p style={{ color: "red" }}>{error}</p> : null}

      <ul>
        {profiles.map((profile) => (
          <li key={profile.id}>
            {profile.name}
            {profile.lastVersionId ? ` (${profile.lastVersionId})` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
