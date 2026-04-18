<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../api.js';
import store from '../store.js';
import UiAvatar from '../components/ui/Avatar.vue';
import UiBadge from '../components/ui/Badge.vue';
import UiButton from '../components/ui/Button.vue';
import UiSurface from '../components/ui/Surface.vue';

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const error = ref('');
const room = ref(null);
const messages = ref([]);

const kind = computed(() => route.params.kind);
const roomId = computed(() => route.params.roomId);
const title = computed(() => route.query.title || room.value?.name || '会话详情');
const session = computed(() => store.session);

function formatTime(value) {
  return new Date(value).toLocaleString();
}

function isOwnMessage(message) {
  return Number(message.sender.id) === Number(session.value?.userId);
}

function previousMessage(index) {
  return index > 0 ? messages.value[index - 1] : null;
}

function nextMessage(index) {
  return index < messages.value.length - 1 ? messages.value[index + 1] : null;
}

function isSameSender(a, b) {
  return a && b && Number(a.sender.id) === Number(b.sender.id);
}

function bubbleRowClass(message, index) {
  return {
    'chat-bubble-row--own': isOwnMessage(message),
    'chat-bubble-row--stacked': isSameSender(previousMessage(index), message)
  };
}

function bubbleClass(message, index) {
  return {
    'chat-bubble--own': isOwnMessage(message),
    'chat-bubble--continued': isSameSender(previousMessage(index), message),
    'chat-bubble--tail-hidden': isSameSender(nextMessage(index), message)
  };
}

async function loadRoom() {
  loading.value = true;
  error.value = '';
  try {
    const payload = await api.adminRoomMessages(kind.value, roomId.value);
    room.value = payload.room;
    messages.value = payload.messages;
  } catch (currentError) {
    error.value = currentError.message;
  } finally {
    loading.value = false;
  }
}

onMounted(loadRoom);
</script>

<template>
  <div class="page-shell admin-page admin-room-page">
    <div class="admin-room-shell">
      <header class="admin-room-shell__header">
        <div class="admin-room-shell__heading">
          <h1>{{ title }}</h1>
          <p>{{ kind === 'dm' ? '管理员私信查看页' : '管理员频道查看页' }}</p>
        </div>
        <div class="inline-actions admin-room-shell__actions">
          <UiBadge variant="secondary">{{ messages.length }} 条消息</UiBadge>
          <UiButton variant="secondary" @click="router.push('/admin')">返回后台</UiButton>
        </div>
      </header>

      <section class="chat-stream admin-room-shell__stream">
        <div class="chat-stream__inner">
          <UiSurface v-if="loading" tone="muted" class="chat-empty">正在加载会话...</UiSurface>
          <UiSurface v-else-if="error" tone="muted" class="chat-empty">{{ error }}</UiSurface>
          <UiSurface v-else-if="!messages.length" tone="muted" class="chat-empty">
            这个会话目前没有消息。
          </UiSurface>

          <article
            v-for="(message, index) in messages"
            :key="message.id"
            class="chat-bubble-row"
            :class="bubbleRowClass(message, index)"
          >
            <UiAvatar
              v-if="!isOwnMessage(message)"
              :src="message.sender.avatarUrl"
              :fallback="message.sender.displayName"
              size="sm"
              class="chat-bubble-row__avatar"
            />
            <div class="chat-bubble" :class="bubbleClass(message, index)">
              <div class="chat-bubble__meta">
                <strong>{{ isOwnMessage(message) ? '我' : message.sender.displayName }}</strong>
                <span>{{ formatTime(message.createdAt) }}</span>
              </div>
              <p v-if="message.content">{{ message.content }}</p>
              <a
                v-if="message.attachment"
                :href="message.attachment.url"
                target="_blank"
                rel="noreferrer"
                class="chat-bubble__attachment"
              >
                {{ message.attachment.name }}
              </a>
            </div>
          </article>
        </div>
      </section>
    </div>
  </div>
</template>
