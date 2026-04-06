<script setup>
import UiSurface from '../ui/Surface.vue';

defineProps({
  label: {
    type: String,
    default: ''
  },
  value: {
    type: [String, Number],
    default: ''
  }
});
</script>

<template>
  <UiSurface tone="strong" class="metric-card">
    <strong class="summary-value">{{ value }}</strong>
    <span class="metric-card__label">{{ label }}</span>
  </UiSurface>
</template>
