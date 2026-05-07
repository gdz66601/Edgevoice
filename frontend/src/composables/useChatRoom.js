import { computed, nextTick, ref } from "vue";
import api from "../api.js";
import {
	decryptMessageContent,
	encryptMessageContent,
	isEncryptedMessageContent,
} from "../e2ee.js";
import { connectRoomSocket } from "../ws.js";

const AUTH_INVALID_EVENT = "cfchat:auth-invalid";
const WS_CLOSE_UNAUTHORIZED = 4401;
const WS_CLOSE_FORBIDDEN = 4403;
const WS_REASON_UNAUTHORIZED = "session_invalid";
const WS_REASON_FORBIDDEN = "room_forbidden";

export function useChatRoom({
	activeRoom,
	channels,
	users,
	session,
	error,
	refreshSidebar,
	canManageActiveRoom,
	syncGroupSettingsForm,
	groupSettingsForm,
	returnToConversationList,
}) {
	const groupMembers = ref([]);
	const messages = ref([]);
	const loading = ref(false);
	const memberLoading = ref(false);
	const wsStatus = ref("closed");
	const composerText = ref("");
	const pendingAttachment = ref(null);
	const roomPassphrase = ref("");
	const blockedWords = ref([]);
	const sending = ref(false);
	const inviteSubmitting = ref(false);
	const groupSettingsSaving = ref(false);
	const groupAvatarUploading = ref(false);
	const showGroupEditor = ref(false);
	const messagesEl = ref(null);
	const fileInputEl = ref(null);
	const groupAvatarInputEl = ref(null);
	const inviteUserId = ref("");
	let roomSocket = null;
	let expectSocketClose = false;

	const activeRoomStorageKey = computed(() => {
		const room = activeRoom.value;
		return room ? `edgechat:e2ee:${room.kind}:${room.id}` : "";
	});

	const e2eeEnabled = computed(() => Boolean(roomPassphrase.value));
	const e2eeStatusText = computed(() =>
		e2eeEnabled.value ? "端对端加密已启用" : "未启用端对端加密",
	);

	function currentRoomKey() {
		const room = activeRoom.value;
		return room ? `${room.kind}:${room.id}` : "";
	}

	function loadRoomPassphrase() {
		const key = activeRoomStorageKey.value;
		if (!key || typeof localStorage === "undefined") {
			roomPassphrase.value = "";
			return;
		}
		roomPassphrase.value = localStorage.getItem(key) || "";
	}

	function saveRoomPassphrase(value) {
		roomPassphrase.value = String(value || "");
		const key = activeRoomStorageKey.value;
		if (!key || typeof localStorage === "undefined") {
			return;
		}
		if (roomPassphrase.value) {
			localStorage.setItem(key, roomPassphrase.value);
		} else {
			localStorage.removeItem(key);
		}
		void refreshCurrentMessages();
	}

	function clearRoomPassphrase() {
		saveRoomPassphrase("");
	}

	function findLocalBlockedWord(content) {
		const normalized = String(content || "").toLowerCase();
		return blockedWords.value.find((word) => normalized.includes(word)) || "";
	}

	async function loadBlockedWords() {
		try {
			const payload = await api.getBlockedWords();
			blockedWords.value = Array.isArray(payload.words) ? payload.words : [];
		} catch {
			blockedWords.value = [];
		}
	}

	async function decorateMessage(message) {
		const content = String(message?.content || "");
		if (!isEncryptedMessageContent(content)) {
			return {
				...message,
				displayContent: content,
				isEncrypted: false,
				decryptionFailed: false,
			};
		}

		const decrypted = await decryptMessageContent(
			content,
			roomPassphrase.value,
			currentRoomKey(),
		);
		return {
			...message,
			displayContent: decrypted.content,
			isEncrypted: true,
			decryptionFailed: Boolean(decrypted.failed),
		};
	}

	async function decorateMessages(nextMessages) {
		return Promise.all(nextMessages.map((message) => decorateMessage(message)));
	}

	async function refreshCurrentMessages() {
		messages.value = await decorateMessages(messages.value);
	}

	const availableInviteUsers = computed(() => {
		const memberIds = new Set(
			groupMembers.value.map((member) => Number(member.id)),
		);
		return users.value.filter((user) => !memberIds.has(Number(user.id)));
	});

	const inviteUserOptions = computed(() =>
		availableInviteUsers.value.map((user) => ({
			value: String(user.id),
			label: user.displayName,
			description: `@${user.username}`,
		})),
	);

	function formatTime(value) {
		return new Date(value).toLocaleString();
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
			"chat-bubble-row--own": isOwnMessage(message),
			"chat-bubble-row--stacked": isSameSender(previousMessage(index), message),
		};
	}

	function bubbleClass(message, index) {
		return {
			"chat-bubble--own": isOwnMessage(message),
			"chat-bubble--continued": isSameSender(previousMessage(index), message),
			"chat-bubble--tail-hidden": isSameSender(nextMessage(index), message),
		};
	}

	function scrollToBottom() {
		const element = messagesEl.value;
		if (element) {
			element.scrollTop = element.scrollHeight;
		}
	}

	async function loadMessages(before = null, append = false) {
		if (!activeRoom.value) {
			return;
		}

		loading.value = true;
		error.value = "";
		try {
			const payload = await api.getMessages(
				activeRoom.value.kind,
				activeRoom.value.id,
				before,
			);
			const decoratedMessages = await decorateMessages(payload.messages);
			messages.value = append
				? [...decoratedMessages, ...messages.value]
				: decoratedMessages;
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
		if (!activeRoom.value || activeRoom.value.kind === "dm") {
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
			if (payload.room.name) {
				activeRoom.value.name = payload.room.name;
			}
			activeRoom.value.avatarUrl = payload.room.avatarUrl || "";
			activeRoom.value.avatarKey = payload.room.avatarKey || "";
			syncGroupSettingsForm();
		} catch (currentError) {
			error.value = currentError.message;
		} finally {
			memberLoading.value = false;
		}
	}

	function emitAuthInvalid(message) {
		if (typeof window !== "undefined") {
			window.dispatchEvent(
				new CustomEvent(AUTH_INVALID_EVENT, {
					detail: { message },
				}),
			);
		}
	}

	function handleRoomAccessRevoked() {
		const room = activeRoom.value;
		if (!room) {
			return;
		}

		const roomName = room.name || "this private room";
		error.value =
			room.kind === "private"
				? `You no longer have access to "${roomName}".`
				: "You no longer have access to this room.";

		disconnectSocket();
		activeRoom.value = null;
		messages.value = [];
		groupMembers.value = [];
		showGroupEditor.value = false;
		returnToConversationList();
		void refreshSidebar();
	}

	function handleSocketClose(event) {
		const code = Number(event?.code || 0);
		const reason = String(event?.reason || "");
		if (code === WS_CLOSE_UNAUTHORIZED || reason === WS_REASON_UNAUTHORIZED) {
			emitAuthInvalid("Your session is no longer valid. Please sign in again.");
			return;
		}

		if (code === WS_CLOSE_FORBIDDEN || reason === WS_REASON_FORBIDDEN) {
			handleRoomAccessRevoked();
		}
	}

	function disconnectSocket() {
		if (roomSocket) {
			expectSocketClose = true;
			roomSocket.close();
			roomSocket = null;
		} else {
			expectSocketClose = false;
		}
		wsStatus.value = "closed";
	}

	function connectSocket() {
		if (!activeRoom.value) {
			return;
		}

		disconnectSocket();
		wsStatus.value = "connecting";
		const socket = connectRoomSocket({
			kind: activeRoom.value.kind,
			roomId: activeRoom.value.id,
			onStatus(event) {
				if (event?.socket && roomSocket && event.socket !== roomSocket) {
					return;
				}

				const status = event?.status || "closed";
				if (status === "open") {
					expectSocketClose = false;
					wsStatus.value = "open";
					return;
				}

				if (status === "closed") {
					if (event?.socket && event.socket === roomSocket) {
						roomSocket = null;
					}
					wsStatus.value = "closed";
					if (expectSocketClose) {
						expectSocketClose = false;
						return;
					}
					handleSocketClose(event);
					return;
				}

				wsStatus.value = status;
			},
			onMessage(payload) {
				if (payload.type === "message" && payload.message) {
					if (messages.value.some((item) => item.id === payload.message.id)) {
						return;
					}
					decorateMessage(payload.message).then((message) => {
						messages.value = [...messages.value, message];
						nextTick().then(scrollToBottom);
					});
				}
				if (payload.type === "error") {
					error.value = payload.error;
				}
			},
		});
		roomSocket = socket;
	}

	async function sendMessage() {
		if (!roomSocket || roomSocket.readyState !== WebSocket.OPEN) {
			error.value = "Real-time connection is not ready. Please try again in a moment.";
			return;
		}

		if (!composerText.value.trim() && !pendingAttachment.value) {
			return;
		}

		const blockedWord = findLocalBlockedWord(composerText.value);
		if (blockedWord) {
			error.value = "消息包含违禁词，已被拦截";
			return;
		}

		sending.value = true;
		error.value = "";
		try {
			const content = e2eeEnabled.value
				? await encryptMessageContent(
						composerText.value,
						roomPassphrase.value,
						currentRoomKey(),
					)
				: composerText.value;
			roomSocket.send(
				JSON.stringify({
					type: "send",
					content,
					attachment: pendingAttachment.value,
				}),
			);
			composerText.value = "";
			pendingAttachment.value = null;
		} catch (currentError) {
			error.value = currentError.message;
		} finally {
			sending.value = false;
		}
	}

	function handleComposerKeydown(event) {
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			sendMessage();
		}
	}

	function openFilePicker() {
		fileInputEl.value?.click();
	}

	function openGroupAvatarPicker() {
		groupAvatarInputEl.value?.click();
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
			event.target.value = "";
		}
	}

	function clearAttachment() {
		pendingAttachment.value = null;
	}

	async function loadOlder() {
		if (loading.value) {
			return;
		}

		const firstMessage = messages.value[0];
		if (!firstMessage) {
			return;
		}
		await loadMessages(firstMessage.id, true);
	}

	function openGroupEditor() {
		if (!canManageActiveRoom.value) {
			return;
		}
		syncGroupSettingsForm();
		showGroupEditor.value = true;
	}

	function closeGroupEditor() {
		showGroupEditor.value = false;
	}

	async function inviteMember() {
		if (
			!activeRoom.value ||
			activeRoom.value.kind === "dm" ||
			!inviteUserId.value
		) {
			return;
		}

		inviteSubmitting.value = true;
		error.value = "";
		try {
			const payload = await api.inviteChannelMembers(activeRoom.value.id, [
				Number(inviteUserId.value),
			]);
			groupMembers.value = payload.members;
			activeRoom.value.memberCount = payload.members.length;
			inviteUserId.value = "";
			await refreshSidebar();
		} catch (currentError) {
			error.value = currentError.message;
		} finally {
			inviteSubmitting.value = false;
		}
	}

	async function removeMember(member) {
		if (!activeRoom.value || activeRoom.value.kind === "dm") {
			return;
		}

		if (!window.confirm(`Remove ${member.displayName} from this group?`)) {
			return;
		}

		try {
			const payload = await api.removeChannelMember(
				activeRoom.value.id,
				member.id,
			);
			groupMembers.value = payload.members;
			activeRoom.value.memberCount = payload.members.length;
			await refreshSidebar();
		} catch (currentError) {
			error.value = currentError.message;
		}
	}

	async function muteMember(member) {
		if (!activeRoom.value || activeRoom.value.kind === "dm") {
			return;
		}

		const input = window.prompt(`禁言 ${member.displayName} 多少分钟？`, "30");
		if (!input) {
			return;
		}

		try {
			const payload = await api.muteChannelMember(
				activeRoom.value.id,
				member.id,
				Number(input),
			);
			groupMembers.value = payload.members;
		} catch (currentError) {
			error.value = currentError.message;
		}
	}

	async function unmuteMember(member) {
		if (!activeRoom.value || activeRoom.value.kind === "dm") {
			return;
		}

		try {
			const payload = await api.unmuteChannelMember(activeRoom.value.id, member.id);
			groupMembers.value = payload.members;
		} catch (currentError) {
			error.value = currentError.message;
		}
	}

	async function deleteGroup() {
		if (!activeRoom.value || activeRoom.value.kind === "dm") {
			return;
		}

		if (!window.confirm(`Delete group ${activeRoom.value.name}?`)) {
			return;
		}

		try {
			await api.deleteOwnedChannel(activeRoom.value.id);
			activeRoom.value = null;
			messages.value = [];
			groupMembers.value = [];
			returnToConversationList();
			await refreshSidebar();
		} catch (currentError) {
			error.value = currentError.message;
		}
	}

	async function uploadGroupAvatar(event) {
		const file = event.target.files?.[0];
		if (!file || !activeRoom.value) {
			return;
		}

		groupAvatarUploading.value = true;
		error.value = "";
		try {
			const payload = await api.uploadFile(file);
			groupSettingsForm.avatarUrl = payload.file.url;
			groupSettingsForm.avatarKey = payload.file.key;
		} catch (currentError) {
			error.value = currentError.message;
		} finally {
			groupAvatarUploading.value = false;
			event.target.value = "";
		}
	}

	async function saveGroupSettings() {
		if (!activeRoom.value || activeRoom.value.kind === "dm") {
			return;
		}

		const name = groupSettingsForm.name.trim();
		if (!name) {
			error.value = "Please enter a group name.";
			return;
		}

		groupSettingsSaving.value = true;
		error.value = "";
		try {
			const payload = await api.updateChannel(activeRoom.value.id, {
				name,
				avatarKey: groupSettingsForm.avatarKey || null,
			});
			activeRoom.value.name = payload.channel.name;
			activeRoom.value.avatarKey = payload.channel.avatarKey || "";
			activeRoom.value.avatarUrl = payload.channel.avatarUrl || "";
			groupSettingsForm.name = activeRoom.value.name;
			groupSettingsForm.avatarKey = activeRoom.value.avatarKey || "";
			groupSettingsForm.avatarUrl = activeRoom.value.avatarUrl || "";

			const channel = channels.value.find(
				(item) => item.id === activeRoom.value.id,
			);
			if (channel) {
				channel.name = activeRoom.value.name;
				channel.avatarKey = activeRoom.value.avatarKey || "";
				channel.avatarUrl = activeRoom.value.avatarUrl || "";
			}
			closeGroupEditor();
			await refreshSidebar();
		} catch (currentError) {
			error.value = currentError.message;
		} finally {
			groupSettingsSaving.value = false;
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
		roomPassphrase,
		blockedWords,
		e2eeEnabled,
		e2eeStatusText,
		sending,
		inviteSubmitting,
		groupSettingsSaving,
		groupAvatarUploading,
		showGroupEditor,
		messagesEl,
		fileInputEl,
		groupAvatarInputEl,
		inviteUserId,
		availableInviteUsers,
		inviteUserOptions,
		formatTime,
		isOwnMessage,
		bubbleRowClass,
		bubbleClass,
		loadMessages,
		loadMembers,
		connectSocket,
		disconnectSocket,
		loadRoomPassphrase,
		loadBlockedWords,
		saveRoomPassphrase,
		clearRoomPassphrase,
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
		muteMember,
		unmuteMember,
		deleteGroup,
		uploadGroupAvatar,
		saveGroupSettings,
	};
}

