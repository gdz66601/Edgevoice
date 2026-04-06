<script setup>
import UiButton from '../ui/Button.vue';
import UiInput from '../ui/Input.vue';
import UiSurface from '../ui/Surface.vue';
import UiTextarea from '../ui/Textarea.vue';

defineProps({
  show: {
    type: Boolean,
    default: false
  },
  mode: {
    type: String,
    default: ''
  },
  users: {
    type: Array,
    default: () => []
  },
  usersWithoutDm: {
    type: Array,
    default: () => []
  },
  form: {
    type: Object,
    required: true
  },
  submitting: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['toggle-mode', 'create-group', 'open-dm']);
</script>

<template>
  <UiSurface v-if="show" tone="soft" class="quick-panel">
    <div class="quick-panel__switch">
      <UiButton :variant="mode === 'group' ? 'default' : 'secondary'" size="sm" @click="emit('toggle-mode', 'group')">
        创建群组
      </UiButton>
      <UiButton :variant="mode === 'dm' ? 'default' : 'secondary'" size="sm" @click="emit('toggle-mode', 'dm')">
        发起私信
      </UiButton>
    </div>

    <div v-if="mode === 'group'" class="quick-panel__body">
      <label class="field">
        <span class="field-label">群组名称</span>
        <UiInput v-model="form.name" placeholder="例如：设计评审室" />
      </label>

      <label class="field">
        <span class="field-label">描述</span>
        <UiTextarea v-model="form.description" :rows="3" placeholder="选填，说明讨论主题" />
      </label>

      <label class="field">
        <span class="field-label">可见性</span>
        <select v-model="form.kind" class="ui-input">
          <option value="public">公开群组</option>
          <option value="private">私有群组</option>
        </select>
      </label>

      <div class="member-picker-list">
        <label v-for="user in users" :key="`create-${user.id}`" class="member-picker-item">
          <input v-model="form.memberUserIds" type="checkbox" :value="user.id" />
          <span>{{ user.displayName }}</span>
          <small>@{{ user.username }}</small>
        </label>
      </div>

      <UiButton :disabled="submitting" block @click="emit('create-group')">
        {{ submitting ? '创建中...' : '确认创建' }}
      </UiButton>
    </div>

    <div v-else-if="mode === 'dm'" class="quick-panel__body">
      <UiSurface v-if="!usersWithoutDm.length" tone="soft" class="empty-state">
        所有站内用户都已经有私信会话了。
      </UiSurface>

      <div v-else class="compact-list">
        <button
          v-for="user in usersWithoutDm"
          :key="`quick-dm-${user.id}`"
          class="compact-list__item"
          @click="emit('open-dm', user)"
        >
          <strong>{{ user.displayName }}</strong>
          <span>@{{ user.username }}</span>
        </button>
      </div>
    </div>
  </UiSurface>
</template>
