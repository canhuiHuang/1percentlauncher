import { useEffect, useState } from "react";
import type { MinecraftProfile } from "./types/minecraft";

function useDefaultMinecraftDirectory() {
  const [directory, setDirectory] = useState("");
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(true);
  const [directoryError, setDirectoryError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadDirectory() {
      try {
        const defaultDirectory = await window.mc.getDefaultDir();

        if (isMounted) setDirectory(defaultDirectory);
      } catch {
        if (isMounted)
          setDirectoryError("Could not load the default Minecraft directory.");
      } finally {
        if (isMounted) setIsLoadingDirectory(false);
      }
    }

    loadDirectory();

    return () => {
      isMounted = false;
    };
  }, []);

  return { directory, isLoadingDirectory, directoryError };
}

function ProfileList({ profiles }: { profiles: MinecraftProfile[] }) {
  if (profiles.length === 0) return <p>No profiles loaded yet.</p>;

  return (
    <ul>
      {profiles.map((profile) => (
        <li key={profile.id}>
          {profile.name}
          {profile.lastVersionId ? ` (${profile.lastVersionId})` : ""}
        </li>
      ))}
    </ul>
  );
}

export default function App() {
  const { directory, isLoadingDirectory, directoryError } =
    useDefaultMinecraftDirectory();
  const [profiles, setProfiles] = useState<MinecraftProfile[]>([]);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
  const [profilesError, setProfilesError] = useState("");

  async function handleLoadProfiles() {
    if (!directory) {
      return;
    }

    setIsLoadingProfiles(true);
    setProfilesError("");

    try {
      const loadedProfiles = await window.mc.getProfiles(directory);
      setProfiles(loadedProfiles);
    } catch {
      setProfiles([]);
      setProfilesError("Could not load profiles from the selected directory.");
    } finally {
      setIsLoadingProfiles(false);
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>1Percent Launcher</h1>

      <p>
        <strong>Directory:</strong>{" "}
        {isLoadingDirectory ? "Loading..." : directory || "Not found"}
      </p>

      {directoryError ? <p>{directoryError}</p> : null}

      <button
        onClick={handleLoadProfiles}
        disabled={isLoadingDirectory || isLoadingProfiles || !directory}
      >
        {isLoadingProfiles ? "Loading Profiles..." : "Load Profiles"}
      </button>

      {profilesError ? <p>{profilesError}</p> : null}

      <ProfileList profiles={profiles} />
    </div>
  );
}
