<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import api from '../api.js';
import UiButton from '../components/ui/Button.vue';
import UiSurface from '../components/ui/Surface.vue';

const loading = ref(false);
const error = ref('');
const users = ref([]);
const inviteSubmitting = ref(false);
const invites = ref([]);
const copiedInviteId = ref(0);

const createUserForm = reactive({
  username: '',
  displayName: '',
  password: ''
});
const inviteForm = reactive({
  note: ''
});

const activeUserCount = computed(() => users.value.filter((user) => !user.isDisabled).length);

async function loadUsers() {
  loading.value = true;
  error.value = '';
  try {
    const [usersPayload, invitePayload] = await Promise.all([
      api.adminUsers(),
      api.listAdminRegisterLinks()
    ]);
    users.value = usersPayload.users;
    invites.value = invitePayload.invites || [];
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

function inviteLinkUrl(token) {
  return new URL(`/register/${token}`, window.location.origin).toString();
}

async function createInvite() {
  inviteSubmitting.value = true;
  error.value = '';
  try {
    const payload = await api.createAdminRegisterLink(inviteForm);
    invites.value = [payload.invite, ...invites.value];
    inviteForm.note = '';
  } catch (currentError) {
    error.value = currentError.message;
  } finally {
    inviteSubmitting.value = false;
  }
}

async function copyInvite(invite) {
  try {
    await navigator.clipboard.writeText(inviteLinkUrl(invite.token));
    copiedInviteId.value = invite.id;
    window.setTimeout(() => {
      if (copiedInviteId.value === invite.id) {
        copiedInviteId.value = 0;
      }
    }, 1600);
  } catch {
    error.value = '复制失败，请手动复制链接';
  }
}

async function revokeInvite(invite) {
  if (!window.confirm('确认停用这个注册链接吗？')) {
    return;
  }

  try {
    await api.revokeAdminRegisterLink(invite.id);
    invites.value = invites.value.map((item) =>
      item.id === invite.id
        ? { ...item, deletedAt: new Date().toISOString(), isAvailable: false }
        : item
    );
  } catch (currentError) {
    error.value = currentError.message;
  }
}

onMounted(loadUsers);
</script>

<template>
  <div class="admin-section">
    <header class="admin-section__header">
      <div class="admin-section__heading">
        <h1>用户管理</h1>
        <p>统一处理站内账号的创建、状态控制和密码维护。</p>
      </div>
      <div class="admin-metric-grid admin-metric-grid--compact">
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

      <section class="admin-grid admin-grid--two">
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
          <h3 class="panel-title">注册链接</h3>
          <label class="field">
            <span>链接备注</span>
            <input v-model.trim="inviteForm.note" placeholder="例如：四月新成员入口" />
          </label>
          <UiButton block :disabled="inviteSubmitting" @click="createInvite">
            {{ inviteSubmitting ? '创建中...' : '创建一次性注册链接' }}
          </UiButton>

          <div class="stack">
            <div v-if="!invites.length" class="muted">还没有注册链接。</div>
            <UiSurface
              v-for="invite in invites"
              :key="invite.id"
              tone="soft"
              class="admin-invite-card"
            >
              <div class="admin-invite-card__head">
                <div>
                  <strong>{{ invite.note || '未命名注册链接' }}</strong>
                  <p>
                    {{
                      invite.isAvailable
                        ? '可用，限 1 人注册'
                        : invite.deletedAt
                          ? '已停用'
                          : '已使用'
                    }}
                  </p>
                </div>
                <div class="inline-actions">
                  <UiButton variant="secondary" size="sm" @click="copyInvite(invite)">
                    {{ copiedInviteId === invite.id ? '已复制' : '复制链接' }}
                  </UiButton>
                  <UiButton
                    v-if="invite.isAvailable"
                    variant="destructive"
                    size="sm"
                    @click="revokeInvite(invite)"
                  >
                    停用
                  </UiButton>
                </div>
              </div>
              <div class="admin-invite-card__url">{{ inviteLinkUrl(invite.token) }}</div>
              <div class="admin-invite-card__meta">
                <span>创建者：{{ invite.creatorDisplayName }}</span>
                <span>创建时间：{{ new Date(invite.createdAt).toLocaleString() }}</span>
                <span v-if="invite.consumerDisplayName">使用者：{{ invite.consumerDisplayName }}</span>
              </div>
            </UiSurface>
          </div>
        </UiSurface>
      </section>

      <UiSurface class="panel">
        <h3 class="panel-title">用户列表</h3>
        <div class="admin-table-wrap">
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
        </div>
      </UiSurface>
    </div>
  </div>
</template>
