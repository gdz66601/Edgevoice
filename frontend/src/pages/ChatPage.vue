<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import UiAvatar from '../components/ui/Avatar.vue';
import UiBadge from '../components/ui/Badge.vue';
import UiButton from '../components/ui/Button.vue';
import UiSelect from '../components/ui/Select.vue';
import UiSurface from '../components/ui/Surface.vue';
import UiTextarea from '../components/ui/Textarea.vue';
import { useActiveRoom } from '../composables/useActiveRoom.js';
import { useChatRoom } from '../composables/useChatRoom.js';
import { useChatSidebar } from '../composables/useChatSidebar.js';
import { useChatViewport } from '../composables/useChatViewport.js';
import store from '../store.js';

const MEMBER_PANEL_RESTORE_DELAY = 240;

const router = useRouter();
const error = ref('');
const activeRoom = ref(null);
const groupSettingsForm = reactive({
  name: '',
  avatarUrl: '',
  avatarKey: ''
});
const session = computed(() => store.session);
const showAdminEntry = computed(() => Boolean(session.value?.isAdmin));

const {
  isMobileViewport,
  mobileView,
  showMemberPanel,
  syncViewportState,
  openConversationView,
  returnToConversationList,
  toggleMemberPanel
} = useChatViewport({ activeRoom });

const {
  activeRoomKey,
  canManageActiveRoom,
  hasManageLayer,
  activeRoomSubtitle,
  applyActiveChannel,
  selectDm,
  syncGroupSettingsForm,
  roomLabel
} = useActiveRoom({ activeRoom, groupSettingsForm });

const {
  channels,
  users,
  sidebarLoading,
  showQuickActions,
  quickActionMode,
  groupSubmitting,
  createGroupForm,
  groupVisibilityOptions,
  usersWithoutDm,
  conversationItems,
  formatListTime,
  toggleQuickActions,
  setQuickActionMode,
  refreshSidebar,
  connectInbox,
  disconnectInbox,
  applyConversationRead,
  openConversation: openConversationInternal,
  openDmWithUser: openDmWithUserInternal,
  createGroup
} = useChatSidebar({
  error,
  applyActiveChannel,
  selectDm
});

const {
  groupMembers,
  messages,
  loading,
  memberLoading,
  wsStatus,
  composerText,
  pendingAttachment,
  sending,
  inviteSubmitting,
  groupSettingsSaving,
  groupAvatarUploading,
  showGroupEditor,
  messagesEl,
  fileInputEl,
  groupAvatarInputEl,
  inviteUserId,
  inviteUserOptions,
  formatTime,
  isOwnMessage,
  bubbleRowClass,
  bubbleClass,
  loadMessages,
  loadMembers,
  connectSocket,
  disconnectSocket,
  sendMessage,
  handleComposerKeydown,
  openFilePicker,
  openGroupAvatarPicker,
  uploadAttachment,
  clearAttachment,
  loadOlder,
  openGroupEditor,
  closeGroupEditor,
  inviteMember,
  removeMember,
  deleteGroup,
  uploadGroupAvatar,
  saveGroupSettings
} = useChatRoom({
  activeRoom,
  channels,
  users,
  session,
  error,
  refreshSidebar,
  applyConversationRead,
  canManageActiveRoom,
  syncGroupSettingsForm,
  groupSettingsForm,
  returnToConversationList
});

const showSidebarPane = computed(() => !isMobileViewport.value || mobileView.value === 'list');
const showChatPane = computed(() => !isMobileViewport.value || mobileView.value === 'chat');
const chatAppClasses = computed(() => ({
  'chat-app--mobile-list': isMobileViewport.value && mobileView.value === 'list',
  'chat-app--mobile-chat': isMobileViewport.value && mobileView.value === 'chat'
}));
let memberPanelRestoreTimer = null;

function isChannelRoomKey(roomKey) {
  return roomKey.startsWith('public:') || roomKey.startsWith('private:');
}

function clearMemberPanelRestoreTimer() {
  if (memberPanelRestoreTimer) {
    clearTimeout(memberPanelRestoreTimer);
    memberPanelRestoreTimer = null;
  }
}

function formatUnreadCount(value) {
  const count = Number(value || 0);
  if (count <= 0) {
    return '';
  }
  return count > 99 ? '99+' : String(count);
}

function visibleUnreadCount(item) {
  if (!item) {
    return 0;
  }

  return activeRoomKey.value === item.key ? 0 : Number(item.unreadCount || 0);
}

async function refreshSidebarIfVisible() {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    return;
  }

  try {
    await refreshSidebar();
  } catch (currentError) {
    error.value = currentError.message;
  }
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    connectInbox();
    void refreshSidebarIfVisible();
  }
}

async function handleOpenConversation(item) {
  await openConversationInternal(item);
  openConversationView();
}

async function handleOpenDmWithUser(user) {
  await openDmWithUserInternal(user);
  openConversationView();
}

const openConversation = handleOpenConversation;
const openDmWithUser = handleOpenDmWithUser;

async function bootstrap() {
  error.value = '';
  try {
    await refreshSidebar();
    connectInbox();
    syncViewportState();
    const preferredRoom = conversationItems.value[0] || null;
    if (preferredRoom && !isMobileViewport.value) {
      await handleOpenConversation(preferredRoom);
    }
  } catch (currentError) {
    error.value = currentError.message;
  }
}

async function logout() {
  await store.logout();
  router.push('/login');
}

function openAdmin() {
  router.push('/admin');
}

watch(activeRoomKey, async (roomKey, previousRoomKey) => {
  clearMemberPanelRestoreTimer();
  if (!roomKey) {
    return;
  }

  const shouldRestorePanel =
    showMemberPanel.value && isChannelRoomKey(previousRoomKey || '') && isChannelRoomKey(roomKey);

  showGroupEditor.value = false;
  showMemberPanel.value = false;
  await loadMessages();
  await loadMembers();
  connectSocket();

  if (shouldRestorePanel) {
    memberPanelRestoreTimer = setTimeout(() => {
      if (activeRoomKey.value === roomKey && hasManageLayer.value) {
        showMemberPanel.value = true;
      }
      memberPanelRestoreTimer = null;
    }, MEMBER_PANEL_RESTORE_DELAY);
  }
});

onMounted(() => {
  syncViewportState();
  window.addEventListener('resize', syncViewportState);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  void bootstrap();
});

onBeforeUnmount(() => {
  clearMemberPanelRestoreTimer();
  window.removeEventListener('resize', syncViewportState);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  disconnectInbox();
  disconnectSocket();
});
</script>

<template>
  <div class="page-shell chat-shell">
    <div class="chat-app" :class="chatAppClasses">
      <aside v-if="showSidebarPane" class="chat-sidebar chat-sidebar--wechat">
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
                        type="button"
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
                type="button"
                class="chat-list-item"
                :class="{ 'chat-list-item--active': activeRoomKey === item.key }"
                @click="openConversation(item)"
              >
                <div class="chat-list-item__avatar">
                  <UiAvatar :src="item.avatarUrl" :fallback="item.fallback" />
                  <span v-if="visibleUnreadCount(item)" class="chat-list-item__unread">
                    {{ formatUnreadCount(visibleUnreadCount(item)) }}
                  </span>
                </div>
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
          <UiButton v-if="showAdminEntry" variant="ghost" size="sm" @click="openAdmin">
            后台
          </UiButton>
          <UiButton variant="ghost" size="sm" @click="logout">退出</UiButton>
        </div>
      </aside>

      <main v-if="showChatPane" class="chat-stage" :class="{ 'chat-stage--mobile': isMobileViewport }">
        <header class="chat-stage__header">
          <div class="chat-stage__header-main">
            <UiButton
              v-if="isMobileViewport"
              variant="ghost"
              size="sm"
              class="chat-stage__back-btn"
              @click="returnToConversationList"
            >
              返回列表
            </UiButton>
            <h1>{{ roomLabel(activeRoom) }}</h1>
            <p>{{ activeRoomSubtitle }}</p>
          </div>
          <div class="chat-stage__status">
            <UiBadge :variant="wsStatus === 'open' ? 'success' : 'secondary'">
              {{ wsStatus === 'open' ? '实时已连接' : '连接中' }}
            </UiBadge>
            <UiButton v-if="showAdminEntry" variant="secondary" size="sm" @click="openAdmin">
              后台
            </UiButton>
            <button
              v-if="hasManageLayer"
              type="button"
              class="expand-member-btn expand-member-btn--header"
              :class="{ 'expand-member-btn--hidden': showMemberPanel }"
              :aria-expanded="showMemberPanel ? 'true' : 'false'"
              :aria-hidden="showMemberPanel ? 'true' : 'false'"
              :tabindex="showMemberPanel ? -1 : 0"
              @click="toggleMemberPanel"
            >
              <svg
                viewBox="0 0 24 24"
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
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
                        type="button"
                        :aria-expanded="showMemberPanel ? 'true' : 'false'"
                        @click="toggleMemberPanel"
                        title="收起成员面板"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="22"
                          height="22"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2.2"
                          aria-hidden="true"
                        >
                          <path d="M9 6l6 6-6 6"/>
                        </svg>
                      </button>
                    </div>
                    <p>{{ memberLoading ? '同步中...' : `${groupMembers.length} 位成员` }}</p>
                  </div>
                  <div class="chat-room-manage__actions">
                    <UiBadge variant="success">{{ activeRoom.myRole || 'member' }}</UiBadge>
                    <UiButton v-if="canManageActiveRoom" variant="secondary" size="sm" @click="openGroupEditor">
                      更改群组信息
                    </UiButton>
                    <UiButton v-if="canManageActiveRoom" variant="ghost" size="sm" @click="deleteGroup">
                      删除群组
                    </UiButton>
                  </div>
                </div>

                <div v-if="false && canManageActiveRoom" class="chat-room-manage__settings">
                  <div class="chat-room-manage__settings-header">
                    <strong>群组设置</strong>
                    <span>仅群主可修改头像与名称</span>
                  </div>
                  <div class="chat-room-manage__settings-body">
                    <div class="chat-room-manage__avatar">
                      <UiAvatar
                        :src="groupSettingsForm.avatarUrl || activeRoom.avatarUrl"
                        :fallback="groupSettingsForm.name || activeRoom.name"
                        size="lg"
                      />
                      <div class="chat-room-manage__avatar-actions">
                        <input
                          ref="groupAvatarInputEl"
                          type="file"
                          accept="image/*"
                          style="display: none"
                          @change="uploadGroupAvatar"
                        />
                        <UiButton
                          variant="secondary"
                          size="sm"
                          :disabled="groupAvatarUploading"
                          @click="openGroupAvatarPicker"
                        >
                          {{ groupAvatarUploading ? '上传中...' : '上传头像' }}
                        </UiButton>
                      </div>
                    </div>
                    <label class="field">
                      <span>群组名称</span>
                      <input v-model.trim="groupSettingsForm.name" />
                    </label>
                    <UiButton :disabled="groupSettingsSaving" @click="saveGroupSettings">
                      {{ groupSettingsSaving ? '保存中...' : '保存设置' }}
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

    <Transition name="panel-float">
      <div
        v-if="showGroupEditor && canManageActiveRoom"
        class="chat-group-editor"
        @click.self="closeGroupEditor"
      >
        <UiSurface tone="strong" class="chat-group-editor__panel">
          <div class="chat-group-editor__header">
            <strong>编辑群组信息</strong>
            <UiButton variant="ghost" size="sm" @click="closeGroupEditor">关闭</UiButton>
          </div>

          <div class="chat-group-editor__body">
            <input
              ref="groupAvatarInputEl"
              type="file"
              accept="image/*"
              style="display: none"
              @change="uploadGroupAvatar"
            />

            <button
              class="chat-group-editor__avatar-tile"
              type="button"
              :disabled="groupAvatarUploading"
              @click="openGroupAvatarPicker"
            >
              <UiAvatar
                :src="groupSettingsForm.avatarUrl || activeRoom?.avatarUrl"
                :fallback="groupSettingsForm.name || activeRoom?.name"
                size="lg"
              />
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M8 8h2.2l1.2-1.8h4.8L17.4 8H19a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3Z"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.8"
                />
                <circle cx="12" cy="13" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8" />
              </svg>
            </button>

            <label class="chat-group-editor__field">
              <span>群组名称</span>
              <input v-model.trim="groupSettingsForm.name" maxlength="40" />
            </label>
          </div>

          <div class="chat-group-editor__footer">
            <UiButton variant="secondary" @click="closeGroupEditor">取消</UiButton>
            <UiButton :disabled="groupSettingsSaving" @click="saveGroupSettings">
              {{ groupSettingsSaving ? '保存中...' : '保存' }}
            </UiButton>
          </div>
        </UiSurface>
      </div>
    </Transition>
  </div>
</template>
