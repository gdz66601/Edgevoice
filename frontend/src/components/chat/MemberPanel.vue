<script setup>
import UiAvatar from '../ui/Avatar.vue';
import UiBadge from '../ui/Badge.vue';
import UiButton from '../ui/Button.vue';
import UiSurface from '../ui/Surface.vue';

defineProps({
  room: {
    type: Object,
    default: null
  },
  members: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  },
  canManage: {
    type: Boolean,
    default: false
  },
  inviteUserId: {
    type: String,
    default: ''
  },
  availableInviteUsers: {
    type: Array,
    default: () => []
  },
  inviteSubmitting: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['update:inviteUserId', 'invite', 'remove-member', 'delete-group']);
</script>

<template>
  <UiSurface v-if="room && room.kind !== 'dm'" tone="soft" class="chat-member-panel">
    <div class="chat-member-panel__header">
      <div class="window-heading">
        <h1 style="font-size: 1.12rem">群组成员</h1>
        <p>{{ loading ? '同步中...' : `${members.length} 位成员` }}</p>
      </div>

      <div class="chat-member-panel__actions">
        <UiBadge variant="secondary">{{ room.myRole || 'member' }}</UiBadge>
        <UiButton v-if="canManage" variant="destructive" size="sm" @click="emit('delete-group')">
          删除群组
        </UiButton>
      </div>
    </div>

    <div class="member-chip-list">
      <div v-for="member in members" :key="member.id" class="member-chip">
        <UiAvatar :src="member.avatarUrl" :fallback="member.displayName" size="sm" />
        <div class="member-chip__text">
          <strong>{{ member.displayName }}</strong>
          <span>@{{ member.username }}</span>
        </div>
        <div class="member-chip__actions">
          <UiBadge :variant="member.role === 'owner' ? 'warm' : 'secondary'">
            {{ member.role === 'owner' ? '群主' : '成员' }}
          </UiBadge>
          <UiButton
            v-if="canManage && member.role !== 'owner'"
            variant="secondary"
            size="sm"
            @click="emit('remove-member', member)"
          >
            移除
          </UiButton>
        </div>
      </div>
    </div>

    <div v-if="canManage" class="chat-member-panel__actions">
      <select
        class="ui-input"
        :value="inviteUserId"
        @change="emit('update:inviteUserId', $event.target.value)"
      >
        <option value="">选择要邀请的用户</option>
        <option v-for="user in availableInviteUsers" :key="`invite-${user.id}`" :value="user.id">
          {{ user.displayName }} @{{ user.username }}
        </option>
      </select>
      <UiButton :disabled="inviteSubmitting || !inviteUserId" @click="emit('invite')">
        {{ inviteSubmitting ? '邀请中...' : '邀请加入' }}
      </UiButton>
    </div>
  </UiSurface>
</template>
