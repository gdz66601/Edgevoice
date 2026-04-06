<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import api from '../api.js';
import UiButton from '../components/ui/Button.vue';
import UiSurface from '../components/ui/Surface.vue';

const router = useRouter();
const loading = ref(false);
const error = ref('');
const users = ref([]);
const channels = ref([]);
const dms = ref([]);

const createChannelForm = reactive({
  name: '',
  description: '',
  kind: 'public'
});

const publicGroupCount = computed(
  () => channels.value.filter((channel) => channel.kind === 'public').length
);
const privateGroupCount = computed(
  () => channels.value.filter((channel) => channel.kind === 'private').length
);

async function loadOverview() {
  loading.value = true;
  error.value = '';
  try {
    const payload = await api.adminOverview();
    users.value = payload.users;
    channels.value = payload.channels;
    dms.value = payload.dms;
  } catch (currentError) {
    error.value = currentError.message;
  } finally {
    loading.value = false;
  }
}

async function submitChannel() {
  await api.createChannel(createChannelForm);
  createChannelForm.name = '';
  createChannelForm.description = '';
  createChannelForm.kind = 'public';
  await loadOverview();
}

onMounted(loadOverview);
</script>

<template>
  <div class="admin-section">
    <header class="admin-section__header">
      <div>
        <h1>网站设置</h1>
        <p>查看站点概况，并处理后台级的群组创建与管理入口。</p>
      </div>
      <UiButton variant="secondary" @click="loadOverview">刷新概况</UiButton>
    </header>

    <div class="stack">
      <p v-if="error" class="error-text">{{ error }}</p>
      <p v-if="loading" class="muted">站点概况加载中...</p>

      <section class="admin-metric-grid admin-metric-grid--wide">
        <UiSurface class="admin-metric-card">
          <strong>{{ users.length }}</strong>
          <span>站内用户</span>
        </UiSurface>
        <UiSurface class="admin-metric-card">
          <strong>{{ publicGroupCount }}</strong>
          <span>公开群组</span>
        </UiSurface>
        <UiSurface class="admin-metric-card">
          <strong>{{ privateGroupCount }}</strong>
          <span>私有群组</span>
        </UiSurface>
        <UiSurface class="admin-metric-card">
          <strong>{{ dms.length }}</strong>
          <span>私信会话</span>
        </UiSurface>
      </section>

      <section class="grid-two">
        <UiSurface class="panel">
          <h3 class="panel-title">创建官方群组</h3>
          <label class="field">
            <span>群组名称</span>
            <input v-model.trim="createChannelForm.name" />
          </label>
          <label class="field">
            <span>描述</span>
            <textarea v-model.trim="createChannelForm.description" />
          </label>
          <label class="field">
            <span>可见性</span>
            <select v-model="createChannelForm.kind">
              <option value="public">公开群组</option>
              <option value="private">私有群组</option>
            </select>
          </label>
          <UiButton block @click="submitChannel">创建群组</UiButton>
        </UiSurface>

        <UiSurface class="panel">
          <h3 class="panel-title">后台入口说明</h3>
          <div class="stack">
            <div class="admin-note">
              <strong>用户管理</strong>
              <span>负责账号生命周期，包括创建、禁用、删号和密码重置。</span>
            </div>
            <div class="admin-note">
              <strong>消息查看</strong>
              <span>负责全站消息检索，以及打开任意群组和私信的完整对话。</span>
            </div>
            <div class="admin-note">
              <strong>网站设置</strong>
              <span>负责后台级配置入口和平台运行概况，不再混入消息巡检操作。</span>
            </div>
          </div>
          <div class="inline-actions">
            <UiButton variant="secondary" size="sm" @click="router.push('/admin/users')">
              去用户管理
            </UiButton>
            <UiButton variant="secondary" size="sm" @click="router.push('/admin/messages')">
              去消息查看
            </UiButton>
          </div>
        </UiSurface>
      </section>
    </div>
  </div>
</template>
