<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '../api.js';
import store from '../store.js';
import { connectRoomSocket } from '../ws.js';
import UiAvatar from '../components/ui/Avatar.vue';
import UiBadge from '../components/ui/Badge.vue';
import UiButton from '../components/ui/Button.vue';
import UiSelect from '../components/ui/Select.vue';
import UiSurface from '../components/ui/Surface.vue';
import UiTextarea from '../components/ui/Textarea.vue';

const router = useRouter();
const channels = ref([]);
const dms = ref([]);
const users = ref([]);
const groupMembers = ref([]);
const messages = ref([]);
const activeRoom = ref(null);
const loading = ref(false);
const sidebarLoading = ref(false);
const memberLoading = ref(false);
const error = ref('');
const wsStatus = ref('closed');
const composerText = ref('');
const pendingAttachment = ref(null);
const sending = ref(false);
const groupSubmitting = ref(false);
const inviteSubmitting = ref(false);
const messagesEl = ref(null);
const fileInputEl = ref(null);
const inviteUserId = ref('');
const showQuickActions = ref(false);
const quickActionMode = ref('');
const showMemberPanel = ref(true);
let roomSocket = null;

const createGroupForm = reactive({
  name: '',
  description: '',
  kind: 'public',
  memberUserIds: []
});

const session = computed(() => store.session);
const groupVisibilityOptions = [
  { label: '公开群组', value: 'public', description: '所有成员可见' },
  { label: '私有群组', value: 'private', description: '仅受邀成员可见' }
];
const activeRoomKey = computed(() =>
  activeRoom.value?.kind && activeRoom.value?.id
    ? `${activeRoom.value.kind}:${activeRoom.value.id}`
    : ''
);
const canManageActiveRoom = computed(
  () => activeRoom.value && activeRoom.value.kind !== 'dm' && activeRoom.value.canManage
);
const hasManageLayer = computed(() => Boolean(activeRoom.value && activeRoom.value.kind !== 'dm'));
const availableInviteUsers = computed(() => {
  const memberIds = new Set(groupMembers.value.map((member) => Number(member.id)));
  return users.value.filter((user) => !memberIds.has(Number(user.id)));
});
const inviteUserOptions = computed(() =>
  availableInviteUsers.value.map((user) => ({
    value: String(user.id),
    label: user.displayName,
    description: `@${user.username}`
  }))
);
const usersWithoutDm = computed(() => {
  const dmUserIds = new Set(dms.value.map((item) => Number(item.otherUser.id)));
  return users.value.filter((user) => !dmUserIds.has(Number(user.id)));
});
const conversationItems = computed(() => {
  const dmItems = dms.value.map((dm) => ({
    key: `dm:${dm.id}`,
    id: dm.id,
    kind: 'dm',
    title: dm.otherUser.displayName,
    subtitle: `联系人 @${dm.otherUser.username}`,
    avatarUrl: dm.otherUser.avatarUrl,
    fallback: dm.otherUser.displayName,
    lastMessageAt: dm.lastMessageAt || '',
    source: dm
  }));

  const channelItems = channels.value.map((channel) => ({
    key: `${channel.kind}:${channel.id}`,
    id: channel.id,
    kind: channel.kind,
    title: channel.name,
    subtitle:
      channel.kind === 'public' && !channel.isMember
        ? `公开群组 · 点击加入`
        : `群主 ${channel.ownerDisplayName || '未知'}`,
    avatarUrl: '',
    fallback: channel.kind === 'private' ? '群' : '聊',
    lastMessageAt: channel.lastMessageAt || '',
    source: channel
  }));

  return [...dmItems, ...channelItems].sort((left, right) => {
    const leftTime = left.lastMessageAt ? new Date(left.lastMessageAt).getTime() : 0;
    const rightTime = right.lastMessageAt ? new Date(right.lastMessageAt).getTime() : 0;
    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    return left.title.localeCompare(right.title, 'zh-CN');
  });
});

const activeRoomSubtitle = computed(() => {
  if (!activeRoom.value) {
    return '从左侧会话列表中选择联系人或群组开始聊天。';
  }

  if (activeRoom.value.kind === 'dm') {
    return `与 @${activeRoom.value.otherUser?.username || activeRoom.value.name} 的私信`;
  }

  const visibility = activeRoom.value.kind === 'private' ? '私有群组' : '公开群组';
  const owner = activeRoom.value.ownerDisplayName ? ` · 群主 ${activeRoom.value.ownerDisplayName}` : '';
  const memberCount = activeRoom.value.memberCount ? ` · ${activeRoom.value.memberCount} 位成员` : '';
  return `${visibility}${owner}${memberCount}`;
});

function formatTime(value) {
  return new Date(value).toLocaleString();
}

function formatListTime(value) {
  if (!value) {
    return '';
  }
  return new Date(value).toLocaleDateString();
}

function roomLabel(room) {
  if (!room) {
    return '未选择会话';
  }

  if (room.kind === 'dm') {
    return room.otherUser?.displayName || room.name;
  }

  return room.name;
}

function isOwnMessage(message) {
  return Number(message.sender.id) === Number(session.value?.userId);
}

function previousMessage(index) {
  return index > 0 ? messages.value[index - 1] : null;
}

function nextMessage(index) {
  return index < messages.value.length - 1 ? messages.value[index + 1] : null;
}

function isSameSender(a, b) {
  return a && b && Number(a.sender.id) === Number(b.sender.id);
}

function bubbleRowClass(message, index) {
  return {
    'chat-bubble-row--own': isOwnMessage(message),
    'chat-bubble-row--stacked': isSameSender(previousMessage(index), message)
  };
}

function bubbleClass(message, index) {
  return {
    'chat-bubble--own': isOwnMessage(message),
    'chat-bubble--continued': isSameSender(previousMessage(index), message),
    'chat-bubble--tail-hidden': isSameSender(nextMessage(index), message)
  };
}

function resetQuickActions() {
  showQuickActions.value = false;
  quickActionMode.value = '';
  createGroupForm.name = '';
  createGroupForm.description = '';
  createGroupForm.kind = 'public';
  createGroupForm.memberUserIds = [];
}

function toggleQuickActions() {
  showQuickActions.value = !showQuickActions.value;
  if (!showQuickActions.value) {
    quickActionMode.value = '';
  }
}

function setQuickActionMode(mode) {
  quickActionMode.value = quickActionMode.value === mode ? '' : mode;
}

function toggleMemberPanel() {
  showMemberPanel.value = !showMemberPanel.value;
}

async function refreshSidebar() {
  sidebarLoading.value = true;
  try {
    const payload = await api.bootstrap();
    channels.value = payload.channels || [];
    dms.value = payload.dms || [];
    users.value = payload.users || [];
  } finally {
    sidebarLoading.value = false;
  }
}

function applyActiveChannel(channel) {
  activeRoom.value = {
    id: channel.id,
    kind: channel.kind,
    name: channel.name,
    description: channel.description,
    ownerDisplayName: channel.ownerDisplayName || '',
    canManage: Boolean(channel.canManage),
    myRole: channel.myRole || '',
    memberCount: Number(channel.memberCount || 0)
  };
}

async function selectChannel(channel) {
  if (channel.kind === 'public' && !channel.isMember) {
    await api.joinChannel(channel.id);
    channel.isMember = true;
    channel.memberCount = Number(channel.memberCount || 0) + 1;
  }

  applyActiveChannel(channel);
}

async function selectDm(dm) {
  activeRoom.value = {
    id: dm.id,
    kind: 'dm',
    name: dm.name,
    otherUser: dm.otherUser
  };
}

async function openConversation(item) {
  if (item.kind === 'dm') {
    await selectDm(item.source);
    return;
  }

  await selectChannel(item.source);
}

async function openDmWithUser(user) {
  const payload = await api.openDm(user.id);
  await refreshSidebar();
  await selectDm(payload.dm);
  resetQuickActions();
}

async function loadMessages(before = null, append = false) {
  if (!activeRoom.value) {
    return;
  }

  loading.value = true;
  error.value = '';
  try {
    const payload = await api.getMessages(activeRoom.value.kind, activeRoom.value.id, before);
    messages.value = append ? [...payload.messages, ...messages.value] : payload.messages;
    await nextTick();
    if (!append) {
      scrollToBottom();
    }
  } catch (currentError) {
    error.value = currentError.message;
  } finally {
    loading.value = false;
  }
}

async function loadMembers() {
  if (!activeRoom.value || activeRoom.value.kind === 'dm') {
    groupMembers.value = [];
    return;
  }

  memberLoading.value = true;
  try {
    const payload = await api.getChannelMembers(activeRoom.value.id);
    groupMembers.value = payload.members;
    activeRoom.value.canManage = payload.room.canManage;
    activeRoom.value.myRole = payload.room.myRole;
    activeRoom.value.memberCount = payload.members.length;
  } catch (currentError) {
    error.value = currentError.message;
  } finally {
    memberLoading.value = false;
  }
}

function disconnectSocket() {
  if (roomSocket) {
    roomSocket.close();
    roomSocket = null;
  }
  wsStatus.value = 'closed';
}

function connectSocket() {
  if (!activeRoom.value) {
    return;
  }

  disconnectSocket();
  wsStatus.value = 'connecting';
  roomSocket = connectRoomSocket({
    kind: activeRoom.value.kind,
    roomId: activeRoom.value.id,
    onStatus(status) {
      wsStatus.value = status;
    },
    onMessage(payload) {
      if (payload.type === 'message' && payload.message) {
        if (messages.value.some((item) => item.id === payload.message.id)) {
          return;
        }
        messages.value = [...messages.value, payload.message];
        nextTick().then(scrollToBottom);
      }
      if (payload.type === 'error') {
        error.value = payload.error;
      }
    }
  });
}

function scrollToBottom() {
  const element = messagesEl.value;
  if (element) {
    element.scrollTop = element.scrollHeight;
  }
}

async function sendMessage() {
  if (!roomSocket || roomSocket.readyState !== WebSocket.OPEN) {
    error.value = '实时连接尚未建立，请稍后重试';
    return;
  }

  if (!composerText.value.trim() && !pendingAttachment.value) {
    return;
  }

  sending.value = true;
  error.value = '';
  try {
    roomSocket.send(
      JSON.stringify({
        type: 'send',
        content: composerText.value,
        attachment: pendingAttachment.value
      })
    );
    composerText.value = '';
    pendingAttachment.value = null;
  } catch (currentError) {
    error.value = currentError.message;
  } finally {
    sending.value = false;
  }
}

function handleComposerKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}

function openFilePicker() {
  fileInputEl.value?.click();
}

async function uploadAttachment(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  try {
    const payload = await api.uploadFile(file);
    pendingAttachment.value = payload.file;
  } catch (currentError) {
    error.value = currentError.message;
  } finally {
    event.target.value = '';
  }
}

function clearAttachment() {
  pendingAttachment.value = null;
}

async function loadOlder() {
  const firstMessage = messages.value[0];
  if (!firstMessage) {
    return;
  }
  await loadMessages(firstMessage.id, true);
}

async function createGroup() {
  if (!createGroupForm.name.trim()) {
    error.value = '请填写群组名称';
    return;
  }

  groupSubmitting.value = true;
  error.value = '';
  try {
    const payload = await api.createGroup(createGroupForm);
    await refreshSidebar();
    await selectChannel(payload.channel);
    resetQuickActions();
  } catch (currentError) {
    error.value = currentError.message;
  } finally {
    groupSubmitting.value = false;
  }
}

async function inviteMember() {
  if (!activeRoom.value || activeRoom.value.kind === 'dm' || !inviteUserId.value) {
    return;
  }

  inviteSubmitting.value = true;
  error.value = '';
  try {
    const payload = await api.inviteChannelMembers(activeRoom.value.id, [Number(inviteUserId.value)]);
    groupMembers.value = payload.members;
    activeRoom.value.memberCount = payload.members.length;
    inviteUserId.value = '';
    await refreshSidebar();
  } catch (currentError) {
    error.value = currentError.message;
  } finally {
    inviteSubmitting.value = false;
  }
}

async function removeMember(member) {
  if (!activeRoom.value || activeRoom.value.kind === 'dm') {
    return;
  }

  if (!window.confirm(`确认将 ${member.displayName} 移出群组吗？`)) {
    return;
  }

  try {
    const payload = await api.removeChannelMember(activeRoom.value.id, member.id);
    groupMembers.value = payload.members;
    activeRoom.value.memberCount = payload.members.length;
    await refreshSidebar();
  } catch (currentError) {
    error.value = currentError.message;
  }
}

async function deleteGroup() {
  if (!activeRoom.value || activeRoom.value.kind === 'dm') {
    return;
  }

  if (!window.confirm(`确认删除群组 ${activeRoom.value.name} 吗？`)) {
    return;
  }

  try {
    await api.deleteOwnedChannel(activeRoom.value.id);
    activeRoom.value = null;
    messages.value = [];
    groupMembers.value = [];
    await refreshSidebar();
  } catch (currentError) {
    error.value = currentError.message;
  }
}

async function bootstrap() {
  sidebarLoading.value = true;
  error.value = '';
  try {
    await refreshSidebar();
    const preferredRoom = conversationItems.value[0] || null;

    if (preferredRoom) {
      await openConversation(preferredRoom);
    }
  } catch (currentError) {
    error.value = currentError.message;
  } finally {
    sidebarLoading.value = false;
  }
}

async function logout() {
  await store.logout();
  router.push('/login');
}

watch(activeRoomKey, async (roomKey) => {
  if (!roomKey) {
    return;
  }

  showMemberPanel.value = activeRoom.value?.kind !== 'dm';
  await loadMessages();
  await loadMembers();
  connectSocket();
});

onMounted(bootstrap);
onBeforeUnmount(disconnectSocket);
</script>

<template>
  <div class="page-shell chat-shell">
    <div class="chat-app">
      <aside class="chat-sidebar chat-sidebar--wechat">
        <div class="chat-sidebar__topbar">
          <div class="chat-sidebar__identity">
            <UiAvatar
              :src="session?.avatarUrl"
              :fallback="session?.displayName || session?.username || 'U'"
            />
            <div class="chat-sidebar__identity-text">
              <strong>{{ session?.displayName || session?.username }}</strong>
              <span>{{ session?.isAdmin ? '管理员账号' : '团队成员' }}</span>
            </div>
          </div>

          <div class="chat-sidebar__toolbar">
            <UiButton
              variant="ghost"
              size="icon"
              :aria-expanded="showQuickActions ? 'true' : 'false'"
              @click="toggleQuickActions"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 5v14M5 12h14"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.8"
                />
              </svg>
            </UiButton>
          </div>
        </div>

        <div class="chat-sidebar__body">
          <div class="chat-sidebar__stack">
            <Transition name="panel-float">
              <div v-if="showQuickActions" class="chat-sidebar__quick-layer">
                <UiSurface tone="soft" class="chat-quick-actions">
                  <div class="chat-quick-actions__switch">
                    <UiButton
                      :variant="quickActionMode === 'group' ? 'default' : 'secondary'"
                      size="sm"
                      @click="setQuickActionMode('group')"
                    >
                      创建群组
                    </UiButton>
                    <UiButton
                      :variant="quickActionMode === 'dm' ? 'default' : 'secondary'"
                      size="sm"
                      @click="setQuickActionMode('dm')"
                    >
                      发起私信
                    </UiButton>
                  </div>

                  <div v-if="quickActionMode === 'group'" class="chat-quick-actions__panel">
                    <label class="field">
                      <span>群组名称</span>
                      <input v-model.trim="createGroupForm.name" placeholder="例如：设计讨论组" />
                    </label>
                    <label class="field">
                      <span>描述</span>
                      <textarea v-model.trim="createGroupForm.description" placeholder="选填" />
                    </label>
                    <label class="field">
                      <span>可见性</span>
                      <UiSelect
                        v-model="createGroupForm.kind"
                        :options="groupVisibilityOptions"
                        placeholder="选择群组可见性"
                      />
                    </label>
                    <div class="member-picker-list">
                      <label v-for="user in users" :key="`create-${user.id}`" class="member-picker-item">
                        <input v-model="createGroupForm.memberUserIds" type="checkbox" :value="user.id" />
                        <span>{{ user.displayName }}</span>
                        <small>@{{ user.username }}</small>
                      </label>
                    </div>
                    <UiButton :disabled="groupSubmitting" block @click="createGroup">
                      {{ groupSubmitting ? '创建中...' : '确认创建' }}
                    </UiButton>
                  </div>

                  <div v-if="quickActionMode === 'dm'" class="chat-quick-actions__panel">
                    <div v-if="!usersWithoutDm.length" class="chat-sidebar__hint">所有站内用户都已经有私信会话了。</div>
                    <div v-else class="chat-sidebar__list chat-sidebar__list--compact">
                      <button
                        v-for="user in usersWithoutDm"
                        :key="`quick-dm-${user.id}`"
                        class="chat-room-item chat-room-item--wechat"
                        @click="openDmWithUser(user)"
                      >
                        <strong>{{ user.displayName }}</strong>
                        <span>@{{ user.username }}</span>
                      </button>
                    </div>
                  </div>
                </UiSurface>
              </div>
            </Transition>

            <div class="chat-sidebar__conversation-list">
              <div v-if="sidebarLoading" class="chat-sidebar__hint">正在同步会话列表...</div>
              <button
                v-for="item in conversationItems"
                :key="item.key"
                class="chat-list-item"
                :class="{ 'chat-list-item--active': activeRoomKey === item.key }"
                @click="openConversation(item)"
              >
                <UiAvatar :src="item.avatarUrl" :fallback="item.fallback" />
                <div class="chat-list-item__body">
                  <div class="chat-list-item__head">
                    <strong>{{ item.title }}</strong>
                    <span>{{ formatListTime(item.lastMessageAt) }}</span>
                  </div>
                  <div class="chat-list-item__desc">{{ item.subtitle }}</div>
                </div>
              </button>
            </div>
          </div>
        </div>

        <div class="chat-sidebar__footer chat-sidebar__footer--simple">
          <UiButton variant="ghost" size="sm" @click="router.push('/settings')">设置</UiButton>
          <UiButton v-if="session?.isAdmin" variant="ghost" size="sm" @click="router.push('/admin')">
            后台
          </UiButton>
          <UiButton variant="ghost" size="sm" @click="logout">退出</UiButton>
        </div>
      </aside>

      <main class="chat-stage">
        <header class="chat-stage__header">
          <div>
            <h1>{{ roomLabel(activeRoom) }}</h1>
            <p>{{ activeRoomSubtitle }}</p>
          </div>
          <div class="chat-stage__status">
            <UiBadge :variant="wsStatus === 'open' ? 'success' : 'secondary'">
              {{ wsStatus === 'open' ? '实时已连接' : '连接中' }}
            </UiBadge>
            <button
              v-if="hasManageLayer"
              class="expand-member-btn expand-member-btn--header"
              :class="{ 'expand-member-btn--hidden': showMemberPanel }"
              :aria-expanded="showMemberPanel ? 'true' : 'false'"
              :aria-hidden="showMemberPanel ? 'true' : 'false'"
              :tabindex="showMemberPanel ? -1 : 0"
              @click="toggleMemberPanel"
            >
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 9l6 6 6-6"/>
              </svg>
              展开成员面板
            </button>
          </div>
        </header>

        <div
          class="chat-stage__workspace"
          :class="{
            'chat-stage__workspace--with-member': hasManageLayer,
            'chat-stage__workspace--collapsed': hasManageLayer && !showMemberPanel
          }"
        >
          <div class="chat-stage__chat-pane">
            <section ref="messagesEl" class="chat-stream">
              <div class="chat-stream__inner">
                <UiButton
                  v-if="messages.length"
                  variant="secondary"
                  size="sm"
                  class="chat-stream__older"
                  @click="loadOlder"
                >
                  加载更早消息
                </UiButton>

                <UiSurface v-if="!activeRoom" tone="muted" class="chat-empty">
                  从左侧会话列表中选择一个联系人或群组。
                </UiSurface>
                <UiSurface v-else-if="loading" tone="muted" class="chat-empty">
                  正在加载消息...
                </UiSurface>
                <UiSurface v-else-if="!messages.length" tone="muted" class="chat-empty">
                  这里还没有消息，发送第一条开始吧。
                </UiSurface>

                <article
                  v-for="(message, index) in messages"
                  :key="message.id"
                  class="chat-bubble-row"
                  :class="bubbleRowClass(message, index)"
                >
                  <UiAvatar
                    v-if="!isOwnMessage(message)"
                    :src="message.sender.avatarUrl"
                    :fallback="message.sender.displayName"
                    size="sm"
                    class="chat-bubble-row__avatar"
                  />
                  <div class="chat-bubble" :class="bubbleClass(message, index)">
                    <div class="chat-bubble__meta">
                      <strong>{{ isOwnMessage(message) ? '我' : message.sender.displayName }}</strong>
                      <span>{{ formatTime(message.createdAt) }}</span>
                    </div>
                    <p v-if="message.content">{{ message.content }}</p>
                    <a
                      v-if="message.attachment"
                      :href="message.attachment.url"
                      target="_blank"
                      rel="noreferrer"
                      class="chat-bubble__attachment"
                    >
                      {{ message.attachment.name }}
                    </a>
                  </div>
                </article>
              </div>
            </section>

            <footer class="chat-composer-shell">
              <div v-if="pendingAttachment" class="chat-composer__attachment">
                <UiBadge variant="secondary">{{ pendingAttachment.name }}</UiBadge>
                <UiButton variant="ghost" size="sm" @click="clearAttachment">移除</UiButton>
              </div>

              <label v-if="error" class="error-text chat-composer__error">{{ error }}</label>

              <div class="chat-composer">
                <div class="chat-composer__field">
                  <input ref="fileInputEl" type="file" class="chat-composer__file" @change="uploadAttachment" />

                  <UiButton variant="ghost" size="icon" :disabled="!activeRoom" @click="openFilePicker">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M12 5v14M5 12h14"
                        fill="none"
                        stroke="currentColor"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="1.8"
                      />
                    </svg>
                  </UiButton>

                  <UiTextarea
                    v-model="composerText"
                    class="chat-composer__input"
                    auto-grow
                    :max-height="220"
                    rows="1"
                    :disabled="!activeRoom"
                    placeholder="输入消息，Enter 发送，Shift+Enter 换行"
                    @keydown="handleComposerKeydown"
                  />

                  <UiButton
                    variant="default"
                    size="icon"
                    :disabled="sending || !activeRoom"
                    @click="sendMessage"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M4 12 20 4l-4 16-4.5-6L4 12Z"
                        fill="none"
                        stroke="currentColor"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="1.8"
                      />
                    </svg>
                  </UiButton>
                </div>
              </div>
            </footer>
          </div>

          <aside v-if="hasManageLayer" class="chat-stage__member-pane">
            <div class="chat-stage__member-pane-inner">
              <UiSurface tone="soft" class="chat-room-manage">
                <div class="chat-room-manage__header">
                  <div>
                    <div class="chat-room-manage__header-row">
                      <strong>群组成员</strong>
                      <button
                        class="collapse-btn"
                        :aria-expanded="showMemberPanel ? 'true' : 'false'"
                        @click="toggleMemberPanel"
                        title="收起成员面板"
                      >
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2">
                          <path d="M9 6l6 6-6 6"/>
                        </svg>
                      </button>
                    </div>
                    <p>{{ memberLoading ? '同步中...' : `${groupMembers.length} 位成员` }}</p>
                  </div>
                  <div class="chat-room-manage__actions">
                    <UiBadge variant="success">{{ activeRoom.myRole || 'member' }}</UiBadge>
                    <UiButton v-if="canManageActiveRoom" variant="ghost" size="sm" @click="deleteGroup">
                      删除群组
                    </UiButton>
                  </div>
                </div>

                <div class="chat-room-manage__body">
                  <div class="member-chip-list">
                    <div v-for="member in groupMembers" :key="member.id" class="member-chip">
                      <UiAvatar :src="member.avatarUrl" :fallback="member.displayName" size="sm" />
                      <div class="member-chip__text">
                        <strong>{{ member.displayName }}</strong>
                        <span>@{{ member.username }}</span>
                      </div>
                      <UiBadge :variant="member.role === 'owner' ? 'default' : 'secondary'">
                        {{ member.role === 'owner' ? '群主' : '成员' }}
                      </UiBadge>
                      <UiButton
                        v-if="canManageActiveRoom && member.role !== 'owner'"
                        variant="ghost"
                        size="sm"
                        @click="removeMember(member)"
                      >
                        移除
                      </UiButton>
                    </div>
                  </div>
                </div>

                <div v-if="canManageActiveRoom" class="chat-room-manage__invite">
                  <UiSelect
                    v-model="inviteUserId"
                    :options="inviteUserOptions"
                    placeholder="选择要邀请的用户"
                  />
                  <UiButton :disabled="inviteSubmitting || !inviteUserId" @click="inviteMember">
                    {{ inviteSubmitting ? '邀请中...' : '邀请加入' }}
                  </UiButton>
                </div>
              </UiSurface>
            </div>
          </aside>
        </div>
      </main>
    </div>
  </div>
</template>
