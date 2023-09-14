import { dateNow, genShortID } from '@grafana/faro-core';

import { throttle } from '../../utils';
import { getItem, localStorageAvailable, removeItem, setItem } from '../../utils/webStorage';

export interface FaroUserSession {
  sessionId: string;
  lastActivity: number;
  started: number;
}

const SESSION_TIMEOUT = 4 * 60 * 60 * 1000; // n hrs
const SESSION_INACTIVITY_TIMEOUT = 15 * 60 * 1000; // n minutes
const STORAGE_UPDATE_DELAY = 1 * 1000; // n seconds

export const STORAGE_KEY = '__FARO_SESSION__';

export function createUserSession(sessionId?: string): Readonly<FaroUserSession> {
  const now = dateNow();

  return {
    sessionId: sessionId ?? genShortID(),
    lastActivity: now,
    started: now,
  };
}

export function removeUserSession() {
  removeItem(STORAGE_KEY);
}

export function storeUserSession(session: FaroUserSession): void {
  setItem(STORAGE_KEY, JSON.stringify(session));
}

export function receiveUserSession(): FaroUserSession | null {
  const storedSession = getItem(STORAGE_KEY);

  if (storedSession) {
    return JSON.parse(storedSession) as FaroUserSession;
  }

  return null;
}

export interface UserSessionState {
  isActive: boolean;
  reason?: string;
}

export const reasonMaxSessionTimeout = 'max-session-timeout';
export const reasonInactivityTimeout = 'inactivity-timeout';
export const reasonAllTimeout = 'all-timeout';

export function getUserSessionActiveState(session: FaroUserSession | null): Readonly<UserSessionState> {
  if (!session) {
    return { isActive: false };
  }

  const now = dateNow();

  let reason: undefined | string;
  const maxDurationValid = now - session.started < SESSION_TIMEOUT;
  if (!maxDurationValid) {
    reason = 'max-session-timeout';
  }

  const maxInactivityPeriodValid = now - session.lastActivity < SESSION_INACTIVITY_TIMEOUT;
  if (!maxInactivityPeriodValid) {
    reason = 'inactivity-timeout';
  }

  if (!maxDurationValid && !maxDurationValid) {
    reason = 'all-timeout';
  }

  const timingsOrderValid = session.lastActivity <= session.started + SESSION_TIMEOUT;

  return {
    isActive: maxDurationValid && maxInactivityPeriodValid && timingsOrderValid,
    reason,
  };
}

export function getOrExpandOrCreateUserSession(): FaroUserSession {
  const session = receiveUserSession();
  const { isActive, reason } = getUserSessionActiveState(session);

  if (isActive) {
    // update user session timestamps
    return createUserSession(session!.sessionId);
  }

  // expand session
  if (reason === reasonInactivityTimeout || reason === reasonMaxSessionTimeout) {
    return createUserSession(session!.sessionId);
  }

  // create new session
  if (reason === reasonAllTimeout || !reason) {
    const session = createUserSession();
    return session;
  }

  return {} as FaroUserSession;
}

interface PersistentUserSessionManager {
  onActivity: () => void;
}

// TODO: provide fallback mechanism if LocalStorage is disabled.
export function persistentUserSessionsManager(initialSessionId?: string): PersistentUserSessionManager {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      storeUserSession(getOrExpandOrCreateUserSession());
    }
  });

  const throttledSessionUpdate = throttle(
    () => storeUserSession(getOrExpandOrCreateUserSession()),
    STORAGE_UPDATE_DELAY
  );

  const session = createUserSession(initialSessionId);
  storeUserSession(session);

  return {
    onActivity: throttledSessionUpdate,
  };
}

interface InMemoryUserSessionsManager {
  onActivity: () => void;
}

export function inMemoryUserSessionsManager(initialSessionId?: string): InMemoryUserSessionsManager {
  return {
    onActivity: () => {
      console.log('initialSessionId', initialSessionId);
    },
  };
}

export const sessionManagerTypePersistent = 'persistent';
export const sessionManagerTypeInMemory = 'in-memory';

interface SessionManager {
  manager: (initialSessionId?: string | undefined) => PersistentUserSessionManager | InMemoryUserSessionsManager;
  type: typeof sessionManagerTypePersistent | typeof sessionManagerTypeInMemory;
}

export function getSessionManager(): SessionManager {
  // TODO: respect user choice once implemented
  if (localStorageAvailable) {
    return { manager: persistentUserSessionsManager, type: sessionManagerTypePersistent };
  }

  return { manager: inMemoryUserSessionsManager, type: sessionManagerTypeInMemory };
}

// export function isPersistentSessionManager(manager: any): manager is PersistentUserSessionManager {
//   return typeof manager === 'function' && manager.name === 'persistentUserSessionsManager';
// }

// export function isInMemorySessionManager(manager: any): manager is InMemoryUserSessionsManager {
//   return typeof manager === 'function' && manager.name === 'inMemoryUserSessionsManager';
// }
