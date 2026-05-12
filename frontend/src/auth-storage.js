// 历史 localStorage token 已被 HttpOnly Cookie 取代。该模块只剩下：
// - 清理迁移期遗留的 localStorage token，避免 XSS 读到孤儿数据
// - 跨组件广播认证失效事件（401 响应触发 store/router 退出登录）
//
// 不再维护任何 token 读写函数；从浏览器/扩展程序窃取 cookie 比读
// localStorage 难得多，移除 token 读写显著减少 XSS 暴露面。

const LEGACY_TOKEN_KEYS = ['edgechat.token', 'cfchat.token'];
export const AUTH_INVALID_EVENT = 'edgechat:auth-invalid';
export const LEGACY_AUTH_INVALID_EVENT = 'cfchat:auth-invalid';

const AUTH_INVALID_EVENTS = [AUTH_INVALID_EVENT, LEGACY_AUTH_INVALID_EVENT];

function canUseLocalStorage() {
  return typeof localStorage !== 'undefined';
}

/** 清除遗留的 localStorage token；幂等。 */
export function purgeLegacyAuthStorage() {
  if (!canUseLocalStorage()) {
    return;
  }
  for (const key of LEGACY_TOKEN_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      // localStorage 可能被禁用 / quota 异常，忽略即可
    }
  }
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
