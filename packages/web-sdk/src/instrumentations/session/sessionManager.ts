import { dateNow, genShortID } from '@grafana/faro-core';

import { throttle } from '../../utils';
import { getItem, removeItem, setItem } from '../../utils/webStorage';

export interface FaroUserSession {
  sessionId: string;
  lastActivity: number;
  started: number;
}

const SESSION_TIMEOUT = 4 * 60 * 60 * 1000; // 4 hrs
const SESSION_INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes
const STORAGE_UPDATE_DELAY = 4 * 1000; // 4 seconds

export const STORAGE_KEY = '__FARO_SESSION__';

export function createUserSession(sessionId: string): Readonly<FaroUserSession> {
  const now = dateNow();

  return {
    sessionId,
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

export function storeUserSessionAsync(session: FaroUserSession): void {
  new Promise(() => {
    storeUserSession(session);
  });
}

export function receiveUserSession(): FaroUserSession | null {
  const sessionStr = getItem(STORAGE_KEY);

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

export function createAndStoreNewUserSession(sessionId?: string): void {
  storeUserSession(createUserSession(sessionId ?? genShortID()));
}

export function userSessionManager() {
  const throttledSessionUpdate = throttle(getOrExpandOrCreateUserSession, STORAGE_UPDATE_DELAY);

  function onActivity() {
    throttledSessionUpdate();
  }

  return {
    onActivity: onActivity,
  };
}
