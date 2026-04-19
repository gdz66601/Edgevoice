import { reactive } from 'vue';
import api from './api.js';

const state = reactive({
  ready: false,
  token: localStorage.getItem('cfchat.token') || '',
  session: null,
  site: {
    siteName: 'Edgechat',
    siteIconUrl: ''
  }
});

function applySiteMetadata(site) {
  const siteName = String(site?.siteName || 'Edgechat').trim() || 'Edgechat';
  const siteIconUrl = String(site?.siteIconUrl || '').trim();
  document.title = siteName;

  let favicon = document.querySelector('link[rel="icon"]');
  if (!favicon) {
    favicon = document.createElement('link');
    favicon.setAttribute('rel', 'icon');
    document.head.appendChild(favicon);
  }

  if (siteIconUrl) {
    favicon.setAttribute('href', siteIconUrl);
  } else {
    favicon.removeAttribute('href');
  }
}

async function loadSite() {
  try {
    const payload = await api.getSite();
    setSite(payload.site);
  } catch {
    applySiteMetadata(state.site);
  }
}

async function initialize() {
  if (state.ready) {
    return;
  }

  await loadSite();

  if (!state.token) {
    state.ready = true;
    return;
  }

  try {
    const payload = await api.session();
    state.session = payload.session;
  } catch {
    localStorage.removeItem('cfchat.token');
    state.token = '';
    state.session = null;
  } finally {
    state.ready = true;
  }
}

async function login(credentials) {
  const payload = await api.login(credentials);
  state.token = payload.token;
  state.session = payload.session;
  state.ready = true;
  localStorage.setItem('cfchat.token', payload.token);
}

async function logout() {
  try {
    if (state.token) {
      await api.logout();
    }
  } finally {
    localStorage.removeItem('cfchat.token');
    state.token = '';
    state.session = null;
  }
}

function setSession(session) {
  state.session = session;
}

function setSite(site) {
  state.site = {
    siteName: String(site?.siteName || 'Edgechat').trim() || 'Edgechat',
    siteIconUrl: String(site?.siteIconUrl || '').trim()
  };
  applySiteMetadata(state.site);
}

export default {
  get ready() {
    return state.ready;
  },
  get token() {
    return state.token;
  },
  get session() {
    return state.session;
  },
  get site() {
    return state.site;
  },
  initialize,
  login,
  logout,
  setSession,
  setSite,
  loadSite
};
