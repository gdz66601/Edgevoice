<script setup>
import { nextTick, onMounted, ref, useAttrs, watch } from 'vue';

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  autoGrow: {
    type: Boolean,
    default: false
  },
  maxHeight: {
    type: Number,
    default: 0
  }
});

const emit = defineEmits(['update:modelValue']);
const attrs = useAttrs();
const textareaEl = ref(null);

function syncHeight() {
  if (!props.autoGrow || !textareaEl.value) return;
  textareaEl.value.style.height = 'auto';
  const nextHeight = props.maxHeight > 0 ? Math.min(textareaEl.value.scrollHeight, props.maxHeight) : textareaEl.value.scrollHeight;
  textareaEl.value.style.height = `${nextHeight}px`;
  textareaEl.value.style.overflowY = props.maxHeight > 0 && textareaEl.value.scrollHeight > props.maxHeight ? 'auto' : 'hidden';
}

function handleInput(event) {
  emit('update:modelValue', event.target.value);
  syncHeight();
}

watch(() => props.modelValue, () => nextTick(syncHeight));
onMounted(syncHeight);
</script>

<template>
  <textarea
    ref="textareaEl"
    class="ui-textarea"
    v-bind="attrs"
    :value="modelValue"
    @input="handleInput"
  ></textarea>
</template>
