import api from './api.js';

function attachSocketListeners(socket, { onMessage, onStatus }) {
  socket.addEventListener('open', () => {
    onStatus?.({ status: 'open', socket });
  });

  socket.addEventListener('close', (event) => {
    onStatus?.({
      status: 'closed',
      socket,
      code: event.code,
      reason: event.reason,
      wasClean: event.wasClean
    });
  });

  socket.addEventListener('error', () => {
    onStatus?.({ status: 'error', socket });
  });

  socket.addEventListener('message', (event) => {
    try {
      const payload = JSON.parse(event.data);
      onMessage?.(payload);
    } catch {
      onMessage?.({ type: 'system', message: event.data });
    }
  });

  return socket;
}

export function connectRoomSocket({ kind, roomId, onMessage, onStatus }) {
  const socket = new WebSocket(api.getRoomWebSocketUrl(kind, roomId));
  return attachSocketListeners(socket, { onMessage, onStatus });
}

export function connectInboxSocket({ onMessage, onStatus }) {
  const socket = new WebSocket(api.getInboxWebSocketUrl());
  return attachSocketListeners(socket, { onMessage, onStatus });
}
