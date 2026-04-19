<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import api from '../api.js';
import store from '../store.js';
import UiButton from '../components/ui/Button.vue';
import UiSurface from '../components/ui/Surface.vue';

const router = useRouter();
const loading = ref(false);
const error = ref('');
const savingSite = ref(false);
const iconUploading = ref(false);
const inviteSubmitting = ref(false);
const users = ref([]);
const channels = ref([]);
const dms = ref([]);
const invites = ref([]);
const iconFileInputEl = ref(null);
const copiedInviteId = ref(0);

const siteForm = reactive({
  siteName: 'Edgechat',
  siteIconUrl: ''
});
const inviteForm = reactive({
  note: ''
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
    siteForm.siteName = payload.site?.siteName || 'Edgechat';
    siteForm.siteIconUrl = payload.site?.siteIconUrl || '';
    const invitePayload = await api.listAdminRegisterLinks();
    invites.value = invitePayload.invites || [];
  } catch (currentError) {
    error.value = currentError.message;
  } finally {
    loading.value = false;
  }
}

function openIconPicker() {
  iconFileInputEl.value?.click();
}

async function uploadSiteIcon(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  iconUploading.value = true;
  error.value = '';
  try {
    const payload = await api.uploadFile(file);
    siteForm.siteIconUrl = payload.file.url;
  } catch (currentError) {
    error.value = currentError.message;
  } finally {
    iconUploading.value = false;
    event.target.value = '';
  }
}

async function saveSiteSettings() {
  savingSite.value = true;
  error.value = '';
  try {
    const payload = await api.updateAdminSiteSettings(siteForm);
    siteForm.siteName = payload.site.siteName;
    siteForm.siteIconUrl = payload.site.siteIconUrl;
    store.setSite(payload.site);
  } catch (currentError) {
    error.value = currentError.message;
  } finally {
    savingSite.value = false;
  }
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

onMounted(loadOverview);
</script>

<template>
  <div class="admin-section">
    <header class="admin-section__header">
      <div class="admin-section__heading">
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

      <section class="admin-grid admin-grid--two">
        <UiSurface class="panel">
          <h3 class="panel-title">站点外观</h3>
          <label class="field">
            <span>站点名称</span>
            <input v-model.trim="siteForm.siteName" placeholder="例如：Edgechat" />
          </label>
          <label class="field">
            <span>站点图标 URL</span>
            <input v-model.trim="siteForm.siteIconUrl" placeholder="/files/... 或 https://..." />
          </label>
          <div class="inline-actions">
            <input
              ref="iconFileInputEl"
              type="file"
              accept="image/*"
              style="display: none"
              @change="uploadSiteIcon"
            />
            <UiButton variant="secondary" size="sm" :disabled="iconUploading" @click="openIconPicker">
              {{ iconUploading ? '上传中...' : '上传图标' }}
            </UiButton>
            <UiButton :disabled="savingSite" @click="saveSiteSettings">
              {{ savingSite ? '保存中...' : '保存设置' }}
            </UiButton>
          </div>
          <div class="admin-site-preview">
            <div
              class="admin-site-preview__icon"
              :class="{ 'admin-site-preview__icon--empty': !siteForm.siteIconUrl }"
            >
              <img v-if="siteForm.siteIconUrl" :src="siteForm.siteIconUrl" alt="site icon" />
              <span v-else>{{ siteForm.siteName.slice(0, 1) || 'C' }}</span>
            </div>
            <div class="admin-site-preview__meta">
              <strong>{{ siteForm.siteName || 'Edgechat' }}</strong>
              <span>{{ siteForm.siteIconUrl || '未设置图标 URL' }}</span>
            </div>
          </div>
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
                    {{ invite.isAvailable ? '可用，限 1 人注册' : invite.deletedAt ? '已停用' : '已使用' }}
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
