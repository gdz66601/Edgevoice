<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps({
  modelValue: {
    type: [String, Number],
    default: ''
  },
  options: {
    type: Array,
    default: () => []
  },
  placeholder: {
    type: String,
    default: '请选择'
  },
  disabled: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['update:modelValue']);
const rootEl = ref(null);
const isOpen = ref(false);

const selectedOption = computed(() =>
  props.options.find((option) => String(option.value) === String(props.modelValue)) || null
);

function close() {
  isOpen.value = false;
}

function toggle() {
  if (!props.disabled) {
    isOpen.value = !isOpen.value;
  }
}

function selectOption(value) {
  emit('update:modelValue', value);
  close();
}

function handleWindowPointerDown(event) {
  if (!rootEl.value?.contains(event.target)) {
    close();
  }
}

onMounted(() => window.addEventListener('pointerdown', handleWindowPointerDown));
onBeforeUnmount(() => window.removeEventListener('pointerdown', handleWindowPointerDown));
</script>

<template>
  <div ref="rootEl" class="ui-select" :class="{ 'ui-select--open': isOpen, 'ui-select--disabled': disabled }">
    <button type="button" class="ui-select__trigger" :disabled="disabled" @click="toggle">
      <span class="ui-select__text">
        <strong>{{ selectedOption?.label || placeholder }}</strong>
        <small v-if="selectedOption?.description">{{ selectedOption.description }}</small>
      </span>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M7 14 12 9l5 5"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.8"
        />
      </svg>
    </button>

    <Transition name="ui-select-panel">
      <div v-if="isOpen" class="ui-select__panel">
        <button
          v-for="option in options"
          :key="String(option.value)"
          type="button"
          class="ui-select__option"
          :class="{ 'ui-select__option--active': String(option.value) === String(modelValue) }"
          @click="selectOption(option.value)"
        >
          <span class="ui-select__text">
            <strong>{{ option.label }}</strong>
            <small v-if="option.description">{{ option.description }}</small>
          </span>
        </button>
      </div>
    </Transition>
  </div>
</template>
