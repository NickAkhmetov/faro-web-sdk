import type { MetaSession } from '@grafana/faro-core';

import { getOrExpandOrCreateUserSession } from '../../instrumentations/session';

export function createSession(attributes?: MetaSession['attributes']): MetaSession {
  const { sessionId } = getOrExpandOrCreateUserSession();

  return {
    id: sessionId,
    attributes,
  };
}
