import { dateNow, faro, genShortID } from '@grafana/faro-core';

import { throttle } from '../../utils';
import { getItem, isWebStorageAvailable, removeItem, setItem } from '../../utils/webStorage';

export interface FaroUserSession {
  sessionId: string;
  lastActivity: number;
  started: number;
}

const SESSION_TIMEOUT = 4 * 60 * 60 * 1000; // n hrs
const SESSION_INACTIVITY_TIMEOUT = 15 * 60 * 1000; // n minutes
const STORAGE_UPDATE_DELAY = 1 * 1000; // n seconds

export const STORAGE_KEY = '__FARO_SESSION__';

export function createUserSessionState(sessionId?: string): Readonly<FaroUserSession> {
  faro.internalLogger?.debug('Create user session object.');
  const now = dateNow();

  return {
    sessionId: sessionId ?? genShortID(),
    lastActivity: now,
    started: now,
  };
}

export function removeUserSession() {
  faro.internalLogger?.debug('Remove user session from local storage.');
  removeItem(STORAGE_KEY);
}

export function storeUserSession(session: FaroUserSession): void {
  faro.internalLogger?.debug('Store user session in local storage.');
  setItem(STORAGE_KEY, JSON.stringify(session));
}

export function receiveUserSession(): FaroUserSession | null {
  const storedSession = getItem(STORAGE_KEY);

  if (storedSession) {
    faro.internalLogger?.debug('Receive user session from local storage.');
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
  faro.internalLogger?.debug(`Get user session active state.`);

  if (!session) {
    return { isActive: false };
  }

  const now = dateNow();

  let reason: undefined | string;
  const maxDurationValid = now - session.started < SESSION_TIMEOUT;
  if (!maxDurationValid) {
    faro.internalLogger?.debug('User session max lifetime timeout.');
    reason = 'max-session-timeout';
  }

  const maxInactivityPeriodValid = now - session.lastActivity < SESSION_INACTIVITY_TIMEOUT;
  if (!maxInactivityPeriodValid) {
    faro.internalLogger?.debug('User session max inactivity timeout.');
    reason = 'inactivity-timeout';
  }

  if (!maxDurationValid && !maxDurationValid) {
    faro.internalLogger?.debug('User session max lifetime and max inactivity timeout.');
    reason = 'all-timeout';
  }

  const timingsOrderValid = session.lastActivity <= session.started + SESSION_TIMEOUT;

  faro.internalLogger?.debug(
    `User session active: ${maxDurationValid && maxInactivityPeriodValid && timingsOrderValid}.`
  );

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
    faro.internalLogger?.debug('Update user session.');
    return createUserSessionState(session!.sessionId);
  }

  // expand session
  if (reason === reasonInactivityTimeout || reason === reasonMaxSessionTimeout) {
    faro.internalLogger?.debug('Expand user session.');
    return createUserSessionState(session!.sessionId);
  }

  // create new session
  if (reason === reasonAllTimeout || !reason) {
    faro.internalLogger?.debug('Create new user session.');
    const session = createUserSessionState();
    return session;
  }

  return {} as FaroUserSession;
}

interface PersistentUserSessionManager {
  onActivity: () => void;
}

// TODO: provide fallback mechanism if LocalStorage is disabled.
export function persistentUserSessionsManager(initialSessionId?: string): PersistentUserSessionManager {
  faro.internalLogger?.debug('Initialize persistent user session manager');

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      storeUserSession(getOrExpandOrCreateUserSession());
    }
  });

  const session = createUserSessionState(initialSessionId);
  storeUserSession(session);

  const throttledSessionUpdate = throttle(
    () => storeUserSession(getOrExpandOrCreateUserSession()),
    STORAGE_UPDATE_DELAY
  );

  return {
    onActivity: throttledSessionUpdate,
  };
}

interface InMemoryUserSessionsManager {
  onActivity: () => void;
}

export function inMemoryUserSessionsManager(): InMemoryUserSessionsManager {
  faro.internalLogger?.debug('Initialize in-memory user session manager');
  let session: FaroUserSession = createUserSessionState(faro.metas.value.session?.id);

  function onActivity() {
    const { isActive, reason } = getUserSessionActiveState(session);
    const now = dateNow();

    if (isActive) {
      // update user session timestamps
      faro.internalLogger?.debug('Update in-memory user session.');
      session.lastActivity = now;
    }

    // expand session
    if (reason === reasonInactivityTimeout || reason === reasonMaxSessionTimeout) {
      faro.internalLogger?.debug('Expand in-memory user session.');
      session = session = createUserSessionState(session.sessionId);
    }

    // create new session
    if (reason === reasonAllTimeout || !reason) {
      faro.internalLogger?.debug('Create new in-memory user session.');
      session = createUserSessionState();
    }
  }

  return {
    onActivity,
  };
}

export const sessionManagerTypePersistent = 'persistent';
export const sessionManagerTypeInMemory = 'in-memory';

interface SessionManager {
  manager: () => PersistentUserSessionManager | InMemoryUserSessionsManager;
  type: typeof sessionManagerTypePersistent | typeof sessionManagerTypeInMemory;
}

export function getSessionManager(): SessionManager {
  faro.internalLogger?.debug('Get session manager');
  // TODO: respect user choice to use either mechanism once implemented
  if (isWebStorageAvailable('localStorage')) {
    return { manager: persistentUserSessionsManager, type: sessionManagerTypePersistent };
  }

  return { manager: inMemoryUserSessionsManager, type: sessionManagerTypeInMemory };
}
