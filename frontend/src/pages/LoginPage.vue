<script setup>
import { computed, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import store from '../store.js';

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const error = ref('');
const form = reactive({
  username: '',
  password: ''
});
const registered = computed(() => route.query.registered === '1');

async function submit() {
  loading.value = true;
  error.value = '';
  try {
    await store.login(form);
    router.push('/');
  } catch (currentError) {
    error.value = currentError.message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="page-shell login-shell">
    <div class="page-card login-card">
      <p class="tag">欢迎回来</p>
      <h1 class="title">{{ store.site.siteName }}</h1>
      <p class="subtitle">登录后即可继续与团队协作，消息与进展一目了然。</p>
      <p v-if="registered" class="muted">注册成功，现在可以使用新账号登录。</p>

      <form @submit.prevent="submit">
        <label class="field">
          <span>用户名</span>
          <input v-model.trim="form.username" autocomplete="username" />
        </label>
        <label class="field">
          <span>密码</span>
          <input
            v-model="form.password"
            type="password"
            autocomplete="current-password"
          />
        </label>

        <div class="login-actions">
          <button class="button" :disabled="loading" type="submit">
            {{ loading ? '登录中...' : '登录' }}
          </button>
          <button
            v-if="store.site.allowPublicRegister"
            class="button secondary"
            type="button"
            @click="router.push('/register/public')"
          >
            注册账号
          </button>
        </div>
        <p v-if="error" class="error-text">{{ error }}</p>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

@media (min-width: 480px) {
  .login-actions {
    flex-direction: row;
  }

  .login-actions .button {
    flex: 1;
  }
}
</style>
