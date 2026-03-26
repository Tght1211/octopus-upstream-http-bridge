export const ERROR_CODES = {
  SHUTTING_DOWN: 'BRIDGE_SHUTTING_DOWN',
  NOT_FOUND: 'BRIDGE_NOT_FOUND',
  MISSING_AUTH: 'BRIDGE_MISSING_AUTH',
  INVALID_BODY: 'BRIDGE_INVALID_BODY',
  BODY_TOO_LARGE: 'BRIDGE_BODY_TOO_LARGE',
  UPSTREAM_TIMEOUT: 'BRIDGE_UPSTREAM_TIMEOUT',
  UPSTREAM_FAILURE: 'BRIDGE_UPSTREAM_FAILURE',
};

export function createErrorPayload(code, message, extra = undefined) {
  return extra === undefined ? { error: { code, message } } : { error: { code, message, ...extra } };
}
