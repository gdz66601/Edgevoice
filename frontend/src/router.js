import { createRouter, createWebHistory } from 'vue-router';
import store from './store.js';
import LoginPage from './pages/LoginPage.vue';
import RegisterPage from './pages/RegisterPage.vue';
import ChatPage from './pages/ChatPage.vue';
import AdminPage from './pages/AdminPage.vue';
import AdminUsersPage from './pages/AdminUsersPage.vue';
import AdminMessagesPage from './pages/AdminMessagesPage.vue';
import AdminSitePage from './pages/AdminSitePage.vue';
import AdminRoomPage from './pages/AdminRoomPage.vue';
import SettingsPage from './pages/SettingsPage.vue';
import { addAuthInvalidListener } from './auth-storage.js';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginPage,
      meta: { public: true, transition: 'page' }
    },
    {
      path: '/register/:token',
      name: 'register',
      component: RegisterPage,
      meta: { public: true, transition: 'page' }
    },
    {
      path: '/',
      name: 'chat',
      component: ChatPage,
      meta: { transition: 'page' }
    },
    {
      path: '/admin',
      component: AdminPage,
      meta: { admin: true, transition: 'page' },
      children: [
        {
          path: '',
          redirect: { name: 'admin-users' }
        },
        {
          path: 'users',
          name: 'admin-users',
          component: AdminUsersPage,
          meta: { admin: true, transition: 'page' }
        },
        {
          path: 'messages',
          name: 'admin-messages',
          component: AdminMessagesPage,
          meta: { admin: true, transition: 'page' }
        },
        {
          path: 'site',
          name: 'admin-site',
          component: AdminSitePage,
          meta: { admin: true, transition: 'page' }
        }
      ]
    },
    {
      path: '/admin/rooms/:kind/:roomId',
      name: 'admin-room',
      component: AdminRoomPage,
      meta: { admin: true, transition: 'page' }
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsPage,
      meta: { transition: 'page' }
    }
  ]
});

if (typeof window !== 'undefined') {
  addAuthInvalidListener(() => {
    if (router.currentRoute.value.path !== '/login') {
      void router.push('/login');
    }
  });
}

router.beforeEach(async (to) => {
  if (!store.ready) {
    await store.initialize();
  }

  if (to.meta.public) {
    if (store.session && to.path === '/login') {
      return '/';
    }
    return true;
  }

  if (!store.session) {
    return '/login';
  }

  if (to.meta.admin && !store.session.isAdmin) {
    return '/';
  }

  return true;
});

export default router;
