<script setup>
import UiBadge from '../ui/Badge.vue';
import UiDot from '../ui/Dot.vue';

defineProps({
  title: {
    type: String,
    default: '未选择会话'
  },
  subtitle: {
    type: String,
    default: ''
  },
  wsStatus: {
    type: String,
    default: 'closed'
  }
});
</script>

<template>
  <header class="window-topbar window-topbar--sticky">
    <div class="chat-main__meta">
      <div class="window-heading">
        <h1>{{ title }}</h1>
        <p>{{ subtitle }}</p>
      </div>
    </div>

    <UiBadge :variant="wsStatus === 'open' ? 'success' : 'secondary'">
      <UiDot :tone="wsStatus === 'open' ? 'cool' : 'neutral'" size="sm" />
      {{ wsStatus === 'open' ? '实时已连接' : '连接中' }}
    </UiBadge>
  </header>
</template>
