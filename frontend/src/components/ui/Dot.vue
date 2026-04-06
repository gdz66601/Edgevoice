<script setup>
defineProps({
  tone: {
    type: String,
    default: 'warm'
  },
  size: {
    type: String,
    default: 'default'
  }
});
</script>

<template>
  <span class="ui-dot" :class="[`ui-dot--${tone}`, `ui-dot--${size}`]"></span>
</template>
