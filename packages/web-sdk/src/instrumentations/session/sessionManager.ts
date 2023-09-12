import { dateNow, deepEqual, genShortID } from '@grafana/faro-core';

import { throttle } from '../../utils';
import { getItem, removeItem, setItem } from '../../utils/webStorage';

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

export function userSessionManager() {
  const throttledSessionUpdate = throttle(
    () => storeUserSession(getOrExpandOrCreateUserSession()),
    STORAGE_UPDATE_DELAY
  );

  // const debouncedSessionUpdate = debounce(() => {
  //   storeUserSession(getOrExpandOrCreateUserSession());
  //   console.log('debounce after', new Date());
  // }, STORAGE_UPDATE_DELAY);

  function initialize() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        console.log('visibilitychange');
        storeUserSession(getOrExpandOrCreateUserSession());
      }
    });

    window.addEventListener('storage', function (event: StorageEvent) {
      if (event.key !== STORAGE_KEY) {
        return;
      }

      console.log('storage event => before');

      const session = receiveUserSession();
      if (deepEqual(JSON.parse(event.newValue ?? ''), session)) {
        return;
      }

      console.log('storage event => after');

      storeUserSession(session!);
    });
  }

  return {
    initialize,
    onActivity: throttledSessionUpdate,
    // onActivity2: debouncedSessionUpdate,
  };
}
