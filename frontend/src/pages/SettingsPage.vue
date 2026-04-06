<script setup>
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import api from '../api.js';
import store from '../store.js';
import UiButton from '../components/ui/Button.vue';

const router = useRouter();
const session = computed(() => store.session);
const profileForm = reactive({
  displayName: session.value?.displayName || ''
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
  <div class="page-shell">
    <div class="page-card">
      <header class="settings-header">
        <div>
          <div class="title">个人设置</div>
          <div class="muted">修改显示名称、头像和密码。</div>
        </div>
        <UiButton variant="secondary" @click="router.push('/')">返回聊天</UiButton>
      </header>

      <div class="settings-body grid-two">
        <section class="panel">
          <h3 class="panel-title">个人资料</h3>
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
          <UiButton @click="saveProfile">保存资料</UiButton>
        </section>

        <section class="panel">
          <h3 class="panel-title">修改密码</h3>
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

      <div class="settings-foot">
        <p v-if="info" class="tag">{{ info }}</p>
        <p v-if="error" class="error-text">{{ error }}</p>
      </div>
    </div>
  </div>
</template>
