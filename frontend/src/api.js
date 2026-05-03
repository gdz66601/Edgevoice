import { dispatchAuthInvalid, getStoredToken } from './auth-storage.js';

const API_PREFIX = '/api';

function buildHeaders(extra = {}) {
  const headers = { ...extra };
  const token = getStoredToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function request(path, options = {}) {
  const response = await fetch(`${API_PREFIX}${path}`, {
    ...options,
    headers: buildHeaders(options.headers),
    body:
      options.body instanceof FormData || typeof options.body === 'string'
        ? options.body
        : options.body
          ? JSON.stringify(options.body)
          : undefined
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message = payload?.error || payload || 'Request failed';
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;

    if (response.status === 401 && typeof window !== 'undefined') {
      dispatchAuthInvalid(message);
    }

    throw error;
  }

  return payload;
}

export default {
  login(credentials) {
    return request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: credentials
    });
  },
  logout() {
    return request('/auth/logout', { method: 'POST' });
  },
  session() {
    return request('/auth/session');
  },
  getSite() {
    return request('/site');
  },
  changePassword(payload) {
    return request('/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    });
  },
  updateProfile(payload) {
    return request('/me/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    });
  },
  getUsers() {
    return request('/users');
  },
  bootstrap() {
    return request('/bootstrap');
  },
  getChannels() {
    return request('/channels');
  },
  createGroup(payload) {
    return request('/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    });
  },
  joinChannel(channelId) {
    return request(`/channels/${channelId}/join`, { method: 'POST' });
  },
  getChannelMembers(channelId) {
    return request(`/channels/${channelId}/members`);
  },
  inviteChannelMembers(channelId, userIds) {
    return request(`/channels/${channelId}/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { userIds }
    });
  },
  removeChannelMember(channelId, userId) {
    return request(`/channels/${channelId}/members/${userId}`, {
      method: 'DELETE'
    });
  },
  deleteOwnedChannel(channelId) {
    return request(`/channels/${channelId}`, {
      method: 'DELETE'
    });
  },
  updateChannel(channelId, payload) {
    return request(`/channels/${channelId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    });
  },
  getMessages(kind, roomId, before) {
    const query = new URLSearchParams({ kind, roomId: String(roomId) });
    if (before) {
      query.set('before', String(before));
    }
    return request(`/messages?${query.toString()}`);
  },
  openDm(userId) {
    return request('/dm/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { userId }
    });
  },
  listDms() {
    return request('/dm');
  },
  uploadFile(file) {
    const form = new FormData();
    form.append('file', file);
    return request('/upload', {
      method: 'POST',
      body: form
    });
  },
  getRoomWebSocketUrl(kind, roomId) {
    const token = getStoredToken();
    const url = new URL(`/api/ws/${kind}/${roomId}`, window.location.origin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('token', token || '');
    return url.toString();
  },
  adminUsers() {
    return request('/admin/users');
  },
  adminOverview() {
    return request('/admin/overview');
  },
  adminSiteSettings() {
    return request('/admin/site-settings');
  },
  listAdminRegisterLinks() {
    return request('/admin/register-links');
  },
  createAdminRegisterLink(payload) {
    return request('/admin/register-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    });
  },
  revokeAdminRegisterLink(inviteId) {
    return request(`/admin/register-links/${inviteId}`, {
      method: 'DELETE'
    });
  },
  updateAdminSiteSettings(payload) {
    return request('/admin/site-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    });
  },
  createUser(payload) {
    return request('/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    });
  },
  updateUser(userId, payload) {
    return request(`/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    });
  },
  resetPassword(userId, password) {
    return request(`/admin/users/${userId}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { password }
    });
  },
  deleteUser(userId) {
    return request(`/admin/users/${userId}`, {
      method: 'DELETE'
    });
  },
  adminChannels() {
    return request('/admin/channels');
  },
  deleteChannel(channelId) {
    return request(`/admin/channels/${channelId}`, {
      method: 'DELETE'
    });
  },
  adminDms() {
    return request('/admin/dms');
  },
  adminRoomMessages(kind, roomId, before) {
    const query = before ? `?before=${encodeURIComponent(String(before))}` : '';
    return request(`/admin/rooms/${kind}/${roomId}/messages${query}`);
  },
  searchMessages(params) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query.set(key, String(value));
      }
    });
    return request(`/admin/messages/search?${query.toString()}`);
  },
  getRegisterInvite(token) {
    return request(`/register-links/${encodeURIComponent(token)}`);
  },
  registerWithInvite(token, payload) {
    return request(`/register-links/${encodeURIComponent(token)}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    });
  }
};

