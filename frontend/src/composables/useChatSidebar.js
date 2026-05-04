import { computed, reactive, ref } from 'vue';
import api from '../api.js';
import { connectInboxSocket } from '../ws.js';

const INBOX_RECONNECT_DELAY = 1500;

function sortConversationItems(items) {
  return [...items].sort((left, right) => {
    const leftTime = left.lastMessageAt ? new Date(left.lastMessageAt).getTime() : 0;
    const rightTime = right.lastMessageAt ? new Date(right.lastMessageAt).getTime() : 0;
    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    return left.title.localeCompare(right.title, 'zh-CN');
  });
}

export function useChatSidebar({ error, applyActiveChannel, selectDm }) {
  const channels = ref([]);
  const dms = ref([]);
  const users = ref([]);
  const sidebarLoading = ref(false);
  const showQuickActions = ref(false);
  const quickActionMode = ref('');
  const groupSubmitting = ref(false);
  const createGroupForm = reactive({
    name: '',
    description: '',
    kind: 'public',
    memberUserIds: []
  });
  let inboxSocket = null;
  let expectInboxClose = false;
  let inboxReconnectTimer = null;

  const groupVisibilityOptions = [
    { label: '公开群组', value: 'public', description: '所有成员可见' },
    { label: '私有群组', value: 'private', description: '仅受邀成员可见' }
  ];

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
      unreadCount: Number(dm.unreadCount || 0),
      source: dm
    }));

    const channelItems = channels.value.map((channel) => ({
      key: `${channel.kind}:${channel.id}`,
      id: channel.id,
      kind: channel.kind,
      title: channel.name,
      subtitle:
        channel.kind === 'public' && !channel.isMember
          ? '公开群组 · 点击加入'
          : `群主 ${channel.ownerDisplayName || '未知'}`,
      avatarUrl: channel.avatarUrl || '',
      fallback: channel.name ? channel.name.slice(0, 1) : '群',
      lastMessageAt: channel.lastMessageAt || '',
      unreadCount: Number(channel.unreadCount || 0),
      source: channel
    }));

    return sortConversationItems([...dmItems, ...channelItems]);
  });

  function clearInboxReconnectTimer() {
    if (inboxReconnectTimer) {
      clearTimeout(inboxReconnectTimer);
      inboxReconnectTimer = null;
    }
  }

  function scheduleInboxReconnect() {
    if (expectInboxClose || inboxReconnectTimer) {
      return;
    }

    inboxReconnectTimer = setTimeout(() => {
      inboxReconnectTimer = null;
      connectInbox();
    }, INBOX_RECONNECT_DELAY);
  }

  function findDm(dmId) {
    return dms.value.find((item) => Number(item.id) === Number(dmId));
  }

  function findChannel(kind, channelId) {
    return channels.value.find(
      (item) => item.kind === kind && Number(item.id) === Number(channelId)
    );
  }

  function refreshSidebarState(payload) {
    channels.value = payload.channels || [];
    dms.value = payload.dms || [];
    users.value = payload.users || [];
  }

  function applyConversationRead({ key, kind, roomId, unreadCount = 0 }) {
    const conversationKey = key || `${kind}:${roomId}`;
    if (conversationKey.startsWith('dm:')) {
      const dm = findDm(roomId ?? conversationKey.slice(3));
      if (dm) {
        dm.unreadCount = Number(unreadCount || 0);
      }
      return;
    }

    const channelKind = kind || conversationKey.split(':')[0];
    const channelId = roomId ?? conversationKey.split(':')[1];
    const channel = findChannel(channelKind, channelId);
    if (channel) {
      channel.unreadCount = Number(unreadCount || 0);
    }
  }

  function applyConversationUpdate(summary) {
    if (!summary?.key || !summary?.kind) {
      return;
    }

    const unreadCount = Number(summary.unreadCount || 0);

    if (summary.kind === 'dm') {
      const existing = findDm(summary.id);
      if (existing) {
        existing.name = summary.name || existing.name;
        existing.lastMessageAt = summary.lastMessageAt || existing.lastMessageAt || '';
        existing.unreadCount = unreadCount;
        existing.otherUser = {
          ...(existing.otherUser || {}),
          ...(summary.otherUser || {}),
          displayName: summary.title || summary.otherUser?.displayName || existing.otherUser?.displayName,
          avatarUrl: summary.avatarUrl || summary.otherUser?.avatarUrl || existing.otherUser?.avatarUrl || ''
        };
        return;
      }

      dms.value = [
        ...dms.value,
        {
          id: Number(summary.id),
          kind: 'dm',
          name: summary.name || summary.key,
          lastMessageAt: summary.lastMessageAt || '',
          unreadCount,
          otherUser: summary.otherUser || {
            id: 0,
            username: '',
            displayName: summary.title || summary.fallback || '?',
            avatarUrl: summary.avatarUrl || ''
          }
        }
      ];
      return;
    }

    const channel = findChannel(summary.kind, summary.id);
    if (!channel) {
      return;
    }

    channel.name = summary.name || summary.title || channel.name;
    channel.description = summary.description ?? channel.description;
    channel.avatarKey = summary.avatarKey ?? channel.avatarKey;
    channel.avatarUrl = summary.avatarUrl ?? channel.avatarUrl;
    channel.ownerDisplayName = summary.ownerDisplayName ?? channel.ownerDisplayName;
    channel.isMember = summary.isMember ?? channel.isMember;
    channel.myRole = summary.myRole ?? channel.myRole;
    channel.canManage = summary.canManage ?? channel.canManage;
    channel.memberCount = summary.memberCount ?? channel.memberCount;
    channel.lastMessageAt = summary.lastMessageAt || channel.lastMessageAt || '';
    channel.unreadCount = unreadCount;
  }

  function handleInboxMessage(payload) {
    if (payload?.type === 'conversation_update') {
      applyConversationUpdate(payload.conversation);
      return;
    }

    if (payload?.type === 'conversation_read') {
      applyConversationRead(payload);
    }
  }

  function connectInbox() {
    if (inboxSocket) {
      return inboxSocket;
    }

    clearInboxReconnectTimer();
    expectInboxClose = false;
    const socket = connectInboxSocket({
      onStatus(event) {
        if (event?.status === 'open') {
          clearInboxReconnectTimer();
          return;
        }

        if (event?.status === 'closed' && event.socket === inboxSocket) {
          inboxSocket = null;
          if (expectInboxClose) {
            expectInboxClose = false;
            return;
          }
          scheduleInboxReconnect();
        }
      },
      onMessage(payload) {
        handleInboxMessage(payload);
      }
    });

    inboxSocket = socket;
    return socket;
  }

  function disconnectInbox() {
    clearInboxReconnectTimer();
    if (inboxSocket) {
      expectInboxClose = true;
      inboxSocket.close();
      inboxSocket = null;
    } else {
      expectInboxClose = false;
    }
  }

  function formatListTime(value) {
    if (!value) {
      return '';
    }
    return new Date(value).toLocaleDateString();
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

  async function refreshSidebar() {
    sidebarLoading.value = true;
    try {
      const payload = await api.bootstrap();
      refreshSidebarState(payload);
    } finally {
      sidebarLoading.value = false;
    }
  }

  async function selectChannel(channel) {
    if (channel.kind === 'public' && !channel.isMember) {
      await api.joinChannel(channel.id);
      channel.isMember = true;
      channel.memberCount = Number(channel.memberCount || 0) + 1;
    }

    applyActiveChannel(channel);
  }

  async function openConversation(item) {
    if (item?.source) {
      item.source.unreadCount = 0;
    }

    if (item.kind === 'dm') {
      selectDm(item.source);
      return;
    }

    await selectChannel(item.source);
  }

  async function openDmWithUser(user) {
    const payload = await api.openDm(user.id);
    await refreshSidebar();
    selectDm(payload.dm);
    resetQuickActions();
  }

  async function createGroup() {
    if (!createGroupForm.name.trim()) {
      error.value = '请填写群组名称。';
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

  return {
    channels,
    dms,
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
    applyConversationUpdate,
    openConversation,
    openDmWithUser,
    createGroup
  };
}
