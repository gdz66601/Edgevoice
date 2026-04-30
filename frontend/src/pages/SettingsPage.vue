<script setup>
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import api from '../api.js';
import store from '../store.js';
import UiButton from '../components/ui/Button.vue';

const router = useRouter();
const session = computed(() => store.session);
const showAdminEntry = computed(() => Boolean(session.value?.isAdmin));
const profileForm = reactive({
  displayName: session.value?.displayName || '',
  customBackground: localStorage.getItem('customBackground') || ''
});
const passwordForm = reactive({
  currentPassword: '',
  newPassword: ''
});
const info = ref('');
const error = ref('');

async function saveProfile() {
  error.value = '';
  info.value = '';
  try {
    const payload = await api.updateProfile(profileForm);
    store.setSession(payload.session);
    if (profileForm.customBackground) {
      localStorage.setItem('customBackground', profileForm.customBackground);
      document.body.style.background = profileForm.customBackground;
    } else {
      localStorage.removeItem('customBackground');
      document.body.style.background = '';
    }
    info.value = '资料已更新';
  } catch (currentError) {
    error.value = currentError.message;
  }
}

async function uploadAvatar(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  error.value = '';
  info.value = '';
  try {
    const upload = await api.uploadFile(file);
    const payload = await api.updateProfile({
      displayName: profileForm.displayName,
      avatarKey: upload.file.key
    });
    store.setSession(payload.session);
    info.value = '头像已更新';
  } catch (currentError) {
    error.value = currentError.message;
  } finally {
    event.target.value = '';
  }
}

async function changePassword() {
  error.value = '';
  info.value = '';
  try {
    await api.changePassword(passwordForm);
    passwordForm.currentPassword = '';
    passwordForm.newPassword = '';
    info.value = '密码修改成功';
  } catch (currentError) {
    error.value = currentError.message;
  }
}
</script>

<template>
  <div class="page-shell settings-page">
    <div class="page-card settings-shell">
      <header class="settings-shell__header">
        <div class="settings-shell__heading">
          <p class="settings-shell__kicker">Account</p>
          <h1>个人设置</h1>
          <p>集中管理头像、显示名称与登录密码。</p>
        </div>
        <div class="settings-shell__actions">
          <UiButton variant="secondary" @click="router.push('/')">返回聊天</UiButton>
          <UiButton v-if="showAdminEntry" variant="ghost" @click="router.push('/admin')">管理后台</UiButton>
        </div>
      </header>

      <div class="settings-shell__body">
        <div class="settings-layout">
          <section class="panel settings-card">
            <h2 class="panel-title">个人资料</h2>
            <div class="avatar-row">
              <img v-if="session?.avatarUrl" :src="session.avatarUrl" class="avatar avatar--profile" alt="avatar" />
              <div v-else class="avatar avatar--profile"></div>
              <div class="avatar-upload">
                <input id="settings-avatar-upload" type="file" class="avatar-upload__input" @change="uploadAvatar" />
                <label class="avatar-upload__button ui-button ui-button--secondary ui-button--sm" for="settings-avatar-upload">
                  更换头像
                </label>
                <span class="avatar-upload__note">支持图片文件，上传后会立即更新资料</span>
              </div>
            </div>

            <label class="field">
              <span>显示名称</span>
              <input v-model.trim="profileForm.displayName" />
            </label>
            <label class="field">
              <span>自定义背景</span>
              <input v-model.trim="profileForm.customBackground" placeholder="例如：linear-gradient(135deg, #667eea 0%, #764ba2 100%)" />
              <small style="color: var(--text-soft); font-size: 0.85rem; margin-top: 4px;">
                支持 CSS 渐变、纯色或图片 URL。留空使用默认背景。
              </small>
            </label>
            <UiButton @click="saveProfile">保存资料</UiButton>
          </section>

          <section class="panel settings-card">
            <h2 class="panel-title">安全设置</h2>
            <label class="field">
              <span>当前密码</span>
              <input v-model="passwordForm.currentPassword" type="password" />
            </label>
            <label class="field">
              <span>新密码</span>
              <input v-model="passwordForm.newPassword" type="password" />
            </label>
            <UiButton @click="changePassword">更新密码</UiButton>
          </section>
        </div>
      </div>

      <div class="settings-shell__foot">
        <p v-if="info" class="tag">{{ info }}</p>
        <p v-if="error" class="error-text">{{ error }}</p>
      </div>
    </div>
  </div>
</template>
