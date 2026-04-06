<script setup>
defineProps({
  title: {
    type: String,
    default: ''
  },
  description: {
    type: String,
    default: ''
  }
});
</script>

<template>
  <header class="section-heading">
    <div class="window-heading">
      <h1>{{ title }}</h1>
      <p>{{ description }}</p>
    </div>
    <slot name="actions" />
  </header>
</template>
