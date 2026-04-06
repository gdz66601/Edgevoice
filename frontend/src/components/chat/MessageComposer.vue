<script setup>
import { ref } from 'vue';
import UiBadge from '../ui/Badge.vue';
import UiButton from '../ui/Button.vue';
import UiSurface from '../ui/Surface.vue';
import UiTextarea from '../ui/Textarea.vue';

defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  pendingAttachment: {
    type: Object,
    default: null
  },
  sending: {
    type: Boolean,
    default: false
  },
  disabled: {
    type: Boolean,
    default: false
  },
  error: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['update:modelValue', 'send', 'upload', 'clear-attachment']);
const fileInput = ref(null);

function handleKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    emit('send');
  }
}

function openPicker() {
  fileInput.value?.click();
}
</script>

<template>
  <footer class="chat-composer-shell">
    <div class="chat-composer">
      <div v-if="pendingAttachment" class="chat-composer__attachment">
        <UiBadge variant="secondary">{{ pendingAttachment.name }}</UiBadge>
        <UiButton variant="ghost" size="sm" @click="emit('clear-attachment')">移除</UiButton>
      </div>

      <div v-if="error" class="error-banner">{{ error }}</div>

      <UiSurface tone="strong" class="chat-composer__field">
        <input ref="fileInput" class="chat-composer__file" type="file" @change="emit('upload', $event)" />
        <UiButton variant="secondary" size="icon" :disabled="disabled" @click="openPicker">
          附
        </UiButton>

        <UiTextarea
          :model-value="modelValue"
          class="chat-composer__textarea"
          :disabled="disabled"
          :rows="2"
          placeholder="输入消息，Enter 发送，Shift+Enter 换行"
          @update:model-value="emit('update:modelValue', $event)"
          @keydown="handleKeydown"
        />

        <UiButton variant="default" size="icon" :disabled="sending || disabled" @click="emit('send')">
          发送
        </UiButton>
      </UiSurface>
    </div>
  </footer>
</template>
