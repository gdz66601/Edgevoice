import { computed, nextTick, ref } from 'vue';
import api from '../api.js';
import { connectRoomSocket } from '../ws.js';

export function useChatRoom({ activeRoom, users, error, refreshSidebar, scrollToBottom }) {
  const groupMembers = ref([]);
  const messages = ref([]);
  const loading = ref(false);
  const memberLoading = ref(false);
  const wsStatus = ref('closed');
  const composerText = ref('');
  const pendingAttachment = ref(null);
  const sending = ref(false);
  const inviteSubmitting = ref(false);
  const inviteUserId = ref('');
  let roomSocket = null;

  const activeRoomKey = computed(() => (activeRoom.value ? `${activeRoom.value.kind}:${activeRoom.value.id}` : ''));
  const canManageActiveRoom = computed(
    () => activeRoom.value && activeRoom.value.kind !== 'dm' && activeRoom.value.canManage
  );
  const availableInviteUsers = computed(() => {
    const memberIds = new Set(groupMembers.value.map((member) => Number(member.id)));
    return users.value.filter((user) => !memberIds.has(Number(user.id)));
  });

  async function loadMessages(before = null, append = false) {
    if (!activeRoom.value) {
      return;
    }
    loading.value = true;
    error.value = '';
    try {
      const payload = await api.getMessages(activeRoom.value.kind, activeRoom.value.id, before);
      messages.value = append ? [...payload.messages, ...messages.value] : payload.messages;
      if (!append) {
        await nextTick();
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
        if (payload.type === 'message' && payload.message && !messages.value.some((item) => item.id === payload.message.id)) {
          messages.value = [...messages.value, payload.message];
          nextTick().then(scrollToBottom);
        }
        if (payload.type === 'error') {
          error.value = payload.error;
        }
      }
    });
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
      roomSocket.send(JSON.stringify({
        type: 'send',
        content: composerText.value,
        attachment: pendingAttachment.value
      }));
      composerText.value = '';
      pendingAttachment.value = null;
    } catch (currentError) {
      error.value = currentError.message;
    } finally {
      sending.value = false;
    }
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

  async function loadOlder() {
    const firstMessage = messages.value[0];
    if (firstMessage) {
      await loadMessages(firstMessage.id, true);
    }
  }

  return {
    groupMembers,
    messages,
    loading,
    memberLoading,
    wsStatus,
    composerText,
    pendingAttachment,
    sending,
    inviteSubmitting,
    inviteUserId,
    activeRoomKey,
    canManageActiveRoom,
    availableInviteUsers,
    loadMessages,
    loadMembers,
    connectSocket,
    disconnectSocket,
    sendMessage,
    uploadAttachment,
    inviteMember,
    removeMember,
    deleteGroup,
    loadOlder
  };
}
