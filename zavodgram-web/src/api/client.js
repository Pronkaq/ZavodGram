const API_BASE = '/api';

let accessToken = localStorage.getItem('zg_token') || null;
let refreshToken = localStorage.getItem('zg_refresh') || null;
let onAuthExpired = null;

export function setAuthCallback(cb) {
  onAuthExpired = cb;
}

export function setTokens(access, refresh) {
  accessToken = access;
  refreshToken = refresh;
  if (access) localStorage.setItem('zg_token', access);
  else localStorage.removeItem('zg_token');
  if (refresh) localStorage.setItem('zg_refresh', refresh);
  else localStorage.removeItem('zg_refresh');
}

export function getAccessToken() {
  return accessToken;
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem('zg_token');
  localStorage.removeItem('zg_refresh');
}

async function refreshAccessToken() {
  if (!refreshToken) throw new Error('No refresh token');
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    clearTokens();
    onAuthExpired?.();
    throw new Error('Refresh failed');
  }
  const { data } = await res.json();
  setTokens(data.accessToken, data.refreshToken);
  return data.accessToken;
}

export async function api(path, options = {}) {
  const { method = 'GET', body, upload } = options;

  const headers = {};
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  if (!upload) headers['Content-Type'] = 'application/json';

  const fetchOpts = {
    method,
    headers,
    ...(body && !upload ? { body: JSON.stringify(body) } : {}),
    ...(upload ? { body } : {}),
  };

  let res = await fetch(`${API_BASE}${path}`, fetchOpts);

  // Auto-refresh on 401
  if (res.status === 401 && refreshToken) {
    try {
      const newToken = await refreshAccessToken();
      headers['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(`${API_BASE}${path}`, { ...fetchOpts, headers });
    } catch {
      throw new Error('AUTH_EXPIRED');
    }
  }

  const data = await res.json();
  if (!data.ok) throw new Error(data.error?.message || 'API error');
  return data.data;
}

// ── Auth API ──
export const authApi = {
  registerStart: (data) => api('/auth/register/start', { method: 'POST', body: data }),
  registerStatus: (registrationId) => api('/auth/register/status', { method: 'POST', body: { registrationId } }),
  registerComplete: (registrationId) => api('/auth/register/complete', { method: 'POST', body: { registrationId } }),
  register: (data) => api('/auth/register', { method: 'POST', body: data }),
  login: (phone, password) => api('/auth/login', { method: 'POST', body: { phone, password } }),
  logout: () => api('/auth/logout', { method: 'POST', body: { refreshToken } }),
};

// ── Users API ──
export const usersApi = {
  me: () => api('/users/me'),
  update: (data) => api('/users/me', { method: 'PATCH', body: data }),
  updateTag: (tag) => api('/users/me/tag', { method: 'PUT', body: { tag } }),
  search: (q) => api(`/users/search?q=${encodeURIComponent(q)}`),
  getById: (id) => api(`/users/${id}`),
  getByTag: (tag) => api(`/users/tag/${tag}`),
};

// ── Chats API ──
export const chatsApi = {
  list: () => api('/chats'),
  get: (id) => api(`/chats/${id}`),
  create: (data) => api('/chats', { method: 'POST', body: data }),
  update: (chatId, data) => api(`/chats/${chatId}`, { method: 'PATCH', body: data }),
  addMember: (chatId, userId) => api(`/chats/${chatId}/members`, { method: 'POST', body: { userId } }),
  removeMember: (chatId, userId) => api(`/chats/${chatId}/members/${userId}`, { method: 'DELETE' }),
  setMemberRole: (chatId, userId, role) => api(`/chats/${chatId}/members/${userId}/role`, { method: 'PATCH', body: { role } }),
  transferOwnership: (chatId, userId) => api(`/chats/${chatId}/transfer-ownership`, { method: 'POST', body: { userId } }),
  mute: (chatId, muted) => api(`/chats/${chatId}/mute`, { method: 'PATCH', body: { muted } }),
};

// ── Messages API ──
export const messagesApi = {
  list: (chatId, cursor) => api(`/chats/${chatId}/messages${cursor ? `?cursor=${cursor}` : ''}`),
  send: (chatId, data) => api(`/chats/${chatId}/messages`, { method: 'POST', body: data }),
  edit: (chatId, msgId, text) => api(`/chats/${chatId}/messages/${msgId}`, { method: 'PATCH', body: { text } }),
  delete: (chatId, msgId) => api(`/chats/${chatId}/messages/${msgId}`, { method: 'DELETE' }),
  search: (chatId, q) => api(`/chats/${chatId}/messages/search?q=${encodeURIComponent(q)}`),
};

// ── Media API ──
export const mediaApi = {
  upload: (file) => {
    const form = new FormData();
    form.append('file', file);
    return api('/media/upload', { method: 'POST', body: form, upload: true });
  },
};

// ── Notifications API ──
export const notificationsApi = {
  list: () => api('/notifications'),
  markRead: (ids) => api('/notifications/read', { method: 'POST', body: { ids } }),
  clearAll: () => api('/notifications', { method: 'DELETE' }),
};
