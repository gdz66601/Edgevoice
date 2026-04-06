<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import api from '../api.js';
import UiButton from '../components/ui/Button.vue';
import UiSurface from '../components/ui/Surface.vue';

const loading = ref(false);
const error = ref('');
const users = ref([]);

const createUserForm = reactive({
  username: '',
  displayName: '',
  password: ''
});

const activeUserCount = computed(() => users.value.filter((user) => !user.isDisabled).length);

async function loadUsers() {
  loading.value = true;
  error.value = '';
  try {
    const payload = await api.adminUsers();
    users.value = payload.users;
  } catch (currentError) {
    error.value = currentError.message;
  } finally {
    loading.value = false;
  }
}

async function submitUser() {
  await api.createUser(createUserForm);
  createUserForm.username = '';
  createUserForm.displayName = '';
  createUserForm.password = '';
  await loadUsers();
}

async function toggleUser(user) {
  await api.updateUser(user.id, {
    isDisabled: !user.isDisabled,
    displayName: user.displayName
  });
  await loadUsers();
}

async function resetPassword(user) {
  const password = window.prompt(`为 ${user.displayName} 设置新密码`);
  if (!password) {
    return;
  }
  await api.resetPassword(user.id, password);
}

async function removeUser(user) {
  if (!window.confirm(`确认删除用户 ${user.displayName} 吗？`)) {
    return;
  }
  await api.deleteUser(user.id);
  await loadUsers();
}

onMounted(loadUsers);
</script>

<template>
  <div class="admin-section">
    <header class="admin-section__header">
      <div>
        <h1>用户管理</h1>
        <p>统一处理站内账号的创建、状态控制和密码维护。</p>
      </div>
      <div class="admin-metric-grid">
        <UiSurface class="admin-metric-card">
          <strong>{{ users.length }}</strong>
          <span>总用户数</span>
        </UiSurface>
        <UiSurface class="admin-metric-card">
          <strong>{{ activeUserCount }}</strong>
          <span>正常用户</span>
        </UiSurface>
      </div>
    </header>

    <div class="stack">
      <p v-if="error" class="error-text">{{ error }}</p>
      <p v-if="loading" class="muted">用户数据加载中...</p>

      <section class="grid-two">
        <UiSurface class="panel">
          <h3 class="panel-title">创建用户</h3>
          <label class="field">
            <span>用户名</span>
            <input v-model.trim="createUserForm.username" />
          </label>
          <label class="field">
            <span>显示名称</span>
            <input v-model.trim="createUserForm.displayName" />
          </label>
          <label class="field">
            <span>初始密码</span>
            <input v-model="createUserForm.password" type="password" />
          </label>
          <UiButton block @click="submitUser">创建用户</UiButton>
        </UiSurface>

        <UiSurface class="panel">
          <h3 class="panel-title">使用说明</h3>
          <div class="stack">
            <div class="admin-note">
              <strong>禁用账号</strong>
              <span>用户会被阻止继续登录，但历史消息仍会保留。</span>
            </div>
            <div class="admin-note">
              <strong>重置密码</strong>
              <span>适合处理遗忘密码或管理员临时接管场景。</span>
            </div>
            <div class="admin-note">
              <strong>删除账号</strong>
              <span>会执行软删除，建议先确认该用户是否还参与重要群组。</span>
            </div>
          </div>
        </UiSurface>
      </section>

      <UiSurface class="panel">
        <h3 class="panel-title">用户列表</h3>
        <table class="list-table">
          <thead>
            <tr>
              <th>用户</th>
              <th>状态</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id">
              <td>
                <strong>{{ user.displayName }}</strong>
                <div class="muted">@{{ user.username }}</div>
              </td>
              <td>{{ user.isDisabled ? '已禁用' : '正常' }}</td>
              <td>{{ new Date(user.createdAt).toLocaleString() }}</td>
              <td>
                <div class="inline-actions">
                  <UiButton variant="secondary" size="sm" @click="toggleUser(user)">
                    {{ user.isDisabled ? '启用' : '禁用' }}
                  </UiButton>
                  <UiButton variant="secondary" size="sm" @click="resetPassword(user)">重置密码</UiButton>
                  <UiButton variant="destructive" size="sm" @click="removeUser(user)">删除</UiButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </UiSurface>
    </div>
  </div>
</template>
