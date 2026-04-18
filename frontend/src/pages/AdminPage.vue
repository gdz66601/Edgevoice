<script setup>
import { computed } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import UiButton from '../components/ui/Button.vue';
import UiSurface from '../components/ui/Surface.vue';

const route = useRoute();
const router = useRouter();

const navItems = [
  {
    label: '用户管理',
    description: '创建、禁用、删除和重置用户',
    to: '/admin/users'
  },
  {
    label: '消息查看',
    description: '搜索消息并查看群组、私信会话',
    to: '/admin/messages'
  },
  {
    label: '网站设置',
    description: '查看站点概况并管理后台级配置',
    to: '/admin/site'
  }
];

const currentTitle = computed(
  () => navItems.find((item) => route.path.startsWith(item.to))?.label || '管理后台'
);
</script>

<template>
  <div class="page-shell admin-page">
    <div class="page-card admin-shell">
      <aside class="admin-shell__sidebar">
        <div class="admin-shell__brand">
          <p class="admin-shell__kicker">System Console</p>
          <h1 class="admin-shell__title">管理后台</h1>
          <p class="admin-shell__subtitle">统一处理用户、消息与站点配置，保持操作路径清晰可追踪。</p>
        </div>

        <nav class="admin-shell__nav">
          <button
            v-for="item in navItems"
            :key="item.to"
            class="admin-shell__nav-item"
            :class="{ 'admin-shell__nav-item--active': route.path.startsWith(item.to) }"
            @click="router.push(item.to)"
          >
            <strong class="admin-shell__nav-label">{{ item.label }}</strong>
            <span class="admin-shell__nav-desc">{{ item.description }}</span>
          </button>
        </nav>

        <UiSurface tone="soft" class="admin-shell__sidebar-card">
          <strong>当前模块：{{ currentTitle }}</strong>
          <p>后台仅负责治理与审计，实时沟通入口保持在聊天主界面。</p>
          <div class="inline-actions">
            <UiButton variant="secondary" size="sm" @click="router.push('/')">返回聊天</UiButton>
            <UiButton variant="ghost" size="sm" @click="router.push('/settings')">个人设置</UiButton>
          </div>
        </UiSurface>
      </aside>

      <main class="admin-shell__content">
        <RouterView />
      </main>
    </div>
  </div>
</template>
