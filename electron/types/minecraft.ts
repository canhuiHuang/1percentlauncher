export type McProfile = {
  id: string;
  name: string;
  gameDir?: string;
  lastVersionId?: string;
};

export type LauncherProfilesFile = {
  profiles?: Record<
    string,
    {
      name?: string;
      gameDir?: string;
      lastVersionId?: string;
      lastUsed?: string;
      icon?: string;
      created?: string;
      type?: string;
    }
  >;
};
