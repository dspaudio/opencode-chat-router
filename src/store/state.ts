interface UserState {
  activeProject: string;
  sessions: Map<string, string>;
}

const store = new Map<string, UserState>();

export function getOrCreateState(userId: string, defaultProject: string): UserState {
  let state = store.get(userId);
  if (!state) {
    state = {
      activeProject: defaultProject,
      sessions: new Map(),
    };
    store.set(userId, state);
  }
  return state;
}

export function setActiveProject(userId: string, projectAlias: string): void {
  const state = store.get(userId);
  if (state) {
    state.activeProject = projectAlias;
  }
}

export function getSessionId(
  userId: string,
  projectAlias: string,
): string | undefined {
  return store.get(userId)?.sessions.get(projectAlias);
}

export function setSessionId(
  userId: string,
  projectAlias: string,
  sessionId: string,
): void {
  store.get(userId)?.sessions.set(projectAlias, sessionId);
}
