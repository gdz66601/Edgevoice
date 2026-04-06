<script setup>
import { ref } from 'vue';
import UiAvatar from '../ui/Avatar.vue';
import UiButton from '../ui/Button.vue';
import UiSurface from '../ui/Surface.vue';

const props = defineProps({
  messages: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  },
  error: {
    type: String,
    default: ''
  },
  emptyText: {
    type: String,
    default: '这里还没有消息。'
  },
  sessionUserId: {
    type: Number,
    default: 0
  },
  showOlder: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['load-older']);
const scrollContainer = ref(null);

function isOwnMessage(message) {
  return Number(message.sender.id) === Number(props.sessionUserId);
}

function isSameSender(left, right) {
  return left && right && Number(left.sender.id) === Number(right.sender.id);
}

function bubbleRowClass(message, index) {
  return {
    'chat-bubble-row--own': isOwnMessage(message),
    'chat-bubble-row--stacked': isSameSender(props.messages[index - 1], message)
  };
}

function bubbleClass(message, index) {
  return {
    'chat-bubble--own': isOwnMessage(message),
    'chat-bubble--continued': isSameSender(props.messages[index - 1], message),
    'chat-bubble--tail-hidden': isSameSender(message, props.messages[index + 1])
  };
}

function formatTime(value) {
  return new Date(value).toLocaleString();
}

function scrollToBottom() {
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight;
  }
}

defineExpose({
  scrollToBottom
});
</script>

<template>
  <section ref="scrollContainer" class="chat-message-scroll">
    <div class="chat-message-inner">
      <UiButton v-if="showOlder && messages.length" variant="secondary" size="sm" @click="emit('load-older')">
        加载更早消息
      </UiButton>

      <UiSurface v-if="loading" tone="soft" class="empty-state">
        正在加载消息...
      </UiSurface>

      <UiSurface v-else-if="error" tone="soft" class="empty-state">
        {{ error }}
      </UiSurface>

      <UiSurface v-else-if="!messages.length" tone="soft" class="empty-state">
        {{ emptyText }}
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
</template>
