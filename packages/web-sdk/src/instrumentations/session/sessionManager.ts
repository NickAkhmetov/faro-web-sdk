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

export function createUserSession(sessionId: string): FaroUserSession {
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

export function userSessionActive(session: FaroUserSession): boolean {
  if (!session) {
    return false;
  }

  const now = dateNow();

  const maxDurationValid = now - session.started < SESSION_TIMEOUT;
  const maxInactivityPeriodValid = now - session.lastActivity < SESSION_INACTIVITY_TIMEOUT;

  return maxDurationValid && maxInactivityPeriodValid;
}

export function getOrCreateUserSession(): FaroUserSession {
  const session = receiveUserSession();
  const isValidSession = session && userSessionActive(session);
  const sessionId = isValidSession ? session.sessionId : genShortID();
  const userSession = createUserSession(sessionId);

  storeUserSession(userSession);

  return userSession;
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

    const isActive = userSessionActive({ lastActivity, started, sessionId: '' });

    if (isActive) {
      lastActivity = now;
      started = now;

      setTimeout(() => {
        const session = receiveUserSession();
        if (session) {
          // TODO: persist to local storage
        }
      }, STORAGE_UPDATE_DELAY);
    }
  }

  return {
    onActivity: onActivity,
  };
}
