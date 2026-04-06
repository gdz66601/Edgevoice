<script setup>
import UiAvatar from '../ui/Avatar.vue';
import UiSurface from '../ui/Surface.vue';

defineProps({
  items: {
    type: Array,
    default: () => []
  },
  activeKey: {
    type: String,
    default: ''
  },
  loading: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['select']);
</script>

<template>
  <div class="conversation-list">
    <UiSurface v-if="loading" tone="soft" class="empty-state">
      会话列表同步中...
    </UiSurface>

    <UiSurface v-else-if="!items.length" tone="soft" class="empty-state">
      还没有可进入的会话。
    </UiSurface>

    <button
      v-for="item in items"
      :key="item.key"
      class="conversation-item"
      :class="{ 'conversation-item--active': activeKey === item.key }"
      @click="emit('select', item)"
    >
      <UiAvatar :src="item.avatarUrl" :fallback="item.fallback" />
      <div class="conversation-item__body">
        <div class="conversation-item__head">
          <strong>{{ item.title }}</strong>
          <span class="conversation-item__date">{{ item.dateLabel }}</span>
        </div>
        <div class="conversation-item__desc">{{ item.subtitle }}</div>
      </div>
    </button>
  </div>
</template>
