export type McProfile = {
  id: string;
  name: string;
  gameDir?: string;
  lastVersionId?: string;
  javaArgs?: string;
  ramInitialized?: boolean;
  lastUsed?: string;
  icon?: string;
  created?: string;
  type?: string;
};

export type LauncherProfilesFile = {
  profiles?: Record<
    string,
    {
      name?: string;
      gameDir?: string;
      lastVersionId?: string;
      javaArgs?: string;
      ramInitialized?: boolean;
      lastUsed?: string;
      icon?: string;
      created?: string;
      type?: string;
    }
  >;
};

export type ForgeMatchResult = {
  profile: McProfile | null;
  requiredVersionId: string;
  profileVersionId: string | null;
  matches: boolean;
};
