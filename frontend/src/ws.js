import api from './api.js';

export function connectRoomSocket({ kind, roomId, onMessage, onStatus }) {
  const socket = new WebSocket(api.getRoomWebSocketUrl(kind, roomId));

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
      onMessage?.(payload, socket);
    } catch {
      onMessage?.({ type: 'system', message: event.data }, socket);
    }
  });

  return socket;
}
