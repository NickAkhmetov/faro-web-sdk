import { dateNow, genShortID } from '@grafana/faro-core';

import { getItem, setItem } from '../../utils/webStorage';

export interface FaroUserSession {
  sessionId: string;
  lastActivity: number;
  started: number;
}

const SESSION_TIMEOUT = 4 * 60 * 60 * 1000; // 4 hrs
const SESSION_INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes
const STORAGE_UPDATE_DELAY = 4 * 1000; // 4 seconds

export const SESSION_STORAGE_KEY = '__FARO_SESSION__';

export function createUserSession(sessionId: string): Readonly<FaroUserSession> {
  const now = dateNow();

  return {
    sessionId,
    lastActivity: now,
    started: now,
  };
}

export function removeUserSession() {}

export function storeUserSession(session: FaroUserSession): void {
  setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function storeUserSessionAsync(session: FaroUserSession): void {
  new Promise(() => {
    storeUserSession(session);
  });
}

export function invalidateUserSession() {}

export function receiveUserSession(): FaroUserSession | null {
  const sessionStr = getItem(SESSION_STORAGE_KEY);

  if (sessionStr) {
    return JSON.parse(sessionStr) as FaroUserSession;
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
    const userSession = createUserSession(session!.sessionId);
    storeUserSession(userSession);
    return userSession;
  }

  if (reason === reasonInactivityTimeout || reason === reasonMaxSessionTimeout) {
    // TODO: expand user session
    return createUserSession(genShortID());
  }

  if (reason === reasonAllTimeout || !reason) {
    const session = createUserSession(genShortID());
    storeUserSession(session);
    return session;
  }

  return {} as FaroUserSession;
}

export function createAndSaveNewUserSession(sessionId?: string): void {
  storeUserSession(createUserSession(sessionId ?? genShortID()));
}

export function userSessionManager() {
  let lastActivity: number;
  let started: number;

  function onActivity() {
    const now = dateNow();
    if (lastActivity == null || started == null) {
      lastActivity = now;
      started = now;
    }

    const { isActive } = getUserSessionActiveState({ lastActivity, started, sessionId: '' });

    if (isActive) {
      lastActivity = now;
      started = now;

      setTimeout(() => {
        const session = receiveUserSession();
        if (session) {
          // TODO: persist to local storage
        }
      }, STORAGE_UPDATE_DELAY);
      // TODO: if we keep this mechanism add STORAGE_UPDATE_DELAY to the calculations in getUserSessionActiveState()
    } else {
      // TODO:
      getOrExpandOrCreateUserSession();
    }
  }

  return {
    onActivity: onActivity,
  };
}
