export const PRIMARY_AUTH_KEY = 'edgechat.token';
export const LEGACY_AUTH_KEY = 'cfchat.token';
export const AUTH_INVALID_EVENT = 'edgechat:auth-invalid';
export const LEGACY_AUTH_INVALID_EVENT = 'cfchat:auth-invalid';

const AUTH_INVALID_EVENTS = [AUTH_INVALID_EVENT, LEGACY_AUTH_INVALID_EVENT];

function canUseLocalStorage() {
  return typeof localStorage !== 'undefined';
}

export function getStoredToken() {
  if (!canUseLocalStorage()) {
    return '';
  }

  const primaryToken = localStorage.getItem(PRIMARY_AUTH_KEY) || '';
  if (primaryToken) {
    return primaryToken;
  }

  const legacyToken = localStorage.getItem(LEGACY_AUTH_KEY) || '';
  if (!legacyToken) {
    return '';
  }

  localStorage.setItem(PRIMARY_AUTH_KEY, legacyToken);
  localStorage.removeItem(LEGACY_AUTH_KEY);
  return legacyToken;
}

export function setStoredToken(token) {
  if (!canUseLocalStorage()) {
    return;
  }

  const cleanToken = String(token || '').trim();
  if (!cleanToken) {
    clearStoredToken();
    return;
  }

  localStorage.setItem(PRIMARY_AUTH_KEY, cleanToken);
  localStorage.removeItem(LEGACY_AUTH_KEY);
}

export function clearStoredToken() {
  if (!canUseLocalStorage()) {
    return;
  }

  localStorage.removeItem(PRIMARY_AUTH_KEY);
  localStorage.removeItem(LEGACY_AUTH_KEY);
}

export function dispatchAuthInvalid(message) {
  if (typeof window === 'undefined') {
    return;
  }

  for (const eventName of AUTH_INVALID_EVENTS) {
    window.dispatchEvent(
      new CustomEvent(eventName, {
        detail: { message }
      })
    );
  }
}

export function addAuthInvalidListener(handler) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  let pending = false;
  const listener = (event) => {
    if (pending) {
      return;
    }

    pending = true;
    queueMicrotask(() => {
      pending = false;
    });
    handler(event);
  };

  for (const eventName of AUTH_INVALID_EVENTS) {
    window.addEventListener(eventName, listener);
  }

  return () => {
    for (const eventName of AUTH_INVALID_EVENTS) {
      window.removeEventListener(eventName, listener);
    }
  };
}
