import { computed, reactive, ref } from 'vue';
import api from '../api.js';

export function useChatSidebar({ activeRoom, error }) {
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

  const usersWithoutDm = computed(() => {
    const dmUserIds = new Set(dms.value.map((item) => Number(item.otherUser.id)));
    return users.value.filter((user) => !dmUserIds.has(Number(user.id)));
  });

  const conversationItems = computed(() => {
    const dmItems = dms.value.map((dm) => ({
      key: `dm:${dm.id}`,
      kind: 'dm',
      title: dm.otherUser.displayName,
      subtitle: `联系人 @${dm.otherUser.username}`,
      avatarUrl: dm.otherUser.avatarUrl,
      fallback: dm.otherUser.displayName,
      dateLabel: formatListTime(dm.lastMessageAt),
      lastMessageAt: dm.lastMessageAt || '',
      source: dm
    }));
    const channelItems = channels.value.map((channel) => ({
      key: `${channel.kind}:${channel.id}`,
      kind: channel.kind,
      title: channel.name,
      subtitle: channel.kind === 'public' && !channel.isMember ? '公开群组 · 点击加入' : `群主 ${channel.ownerDisplayName || '未知'}`,
      avatarUrl: '',
      fallback: channel.kind === 'private' ? '群' : '聊',
      dateLabel: formatListTime(channel.lastMessageAt),
      lastMessageAt: channel.lastMessageAt || '',
      source: channel
    }));

    return [...dmItems, ...channelItems].sort((left, right) => {
      const leftTime = left.lastMessageAt ? new Date(left.lastMessageAt).getTime() : 0;
      const rightTime = right.lastMessageAt ? new Date(right.lastMessageAt).getTime() : 0;
      return rightTime === leftTime ? left.title.localeCompare(right.title, 'zh-CN') : rightTime - leftTime;
    });
  });

  function formatListTime(value) {
    return value ? new Date(value).toLocaleDateString() : '';
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

  function selectDm(dm) {
    activeRoom.value = {
      id: dm.id,
      kind: 'dm',
      name: dm.name,
      otherUser: dm.otherUser
    };
  }

  async function openConversation(item) {
    if (item.kind === 'dm') {
      selectDm(item.source);
      return;
    }
    await selectChannel(item.source);
  }

  async function openDmWithUser(user) {
    try {
      const payload = await api.openDm(user.id);
      await refreshSidebar();
      selectDm(payload.dm);
      resetQuickActions();
    } catch (currentError) {
      error.value = currentError.message;
    }
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

  async function bootstrap() {
    error.value = '';
    try {
      await refreshSidebar();
      const preferredRoom = conversationItems.value[0];
      if (preferredRoom) {
        await openConversation(preferredRoom);
      }
    } catch (currentError) {
      error.value = currentError.message;
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
    usersWithoutDm,
    conversationItems,
    toggleQuickActions,
    setQuickActionMode,
    refreshSidebar,
    openConversation,
    openDmWithUser,
    createGroup,
    bootstrap
  };
}
