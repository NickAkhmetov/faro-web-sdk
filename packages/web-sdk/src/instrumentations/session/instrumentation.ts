import { BaseInstrumentation, Conventions, Meta, MetaSession, VERSION } from '@grafana/faro-core';

import { localStorageAvailable } from '../../utils';

import { userSessionManager } from './sessionManager';

// all this does is send SESSION_START event
export class SessionInstrumentation extends BaseInstrumentation {
  readonly name = '@grafana/faro-web-sdk:instrumentation-session';
  readonly version = VERSION;

  // previously notified session, to ensure we don't send session start
  // event twice for the same session
  private notifiedSession: MetaSession | undefined;

  private sendSessionStartEvent(meta: Meta): void {
    const session = meta.session;

    if (session && session !== this.notifiedSession) {
      this.notifiedSession = session;

      // no need to add attributes and session id, they are included as part of meta
      // automatically
      this.api.pushEvent(Conventions.EventNames.SESSION_START, {}, undefined, { skipDedupe: true });
    }
  }

  initialize() {
    // TODO: Add an "onApiExecute" lifecycle event to each Faro API which is called on every api call
    // TODO: ... this is because the point in time when the before send hook is called can be influenced by the user (batch timeout)
    // TODO: ... for the sake of simplicity and reviewability I'll use the hook here for the PoC
    // TODO: maybe the possible delay is not that important

    // TODO: a user can completely mutate or overwrite the beforeSendHooks list.

    if (localStorageAvailable) {
      const { initialize, onActivity } = userSessionManager();
      const { addBeforeSendHooks, getBeforeSendHooks } = this.transports;

      addBeforeSendHooks(...getBeforeSendHooks(), () => {
        onActivity();
        return null;
      });
    } else {
      this.logDebug('Local Storage not supported or disabled. Fall back to in-memory session management');
    }

    this.sendSessionStartEvent(this.metas.value);

    this.metas.addListener(this.sendSessionStartEvent.bind(this));
  }
}
