import type { MetaSession } from '@grafana/faro-core';

import { getOrCreateUserSession } from '../../instrumentations/session';

export function createSession(attributes?: MetaSession['attributes']): MetaSession {
  const { sessionId } = getOrCreateUserSession();

  return {
    id: sessionId,
    attributes,
  };
}
