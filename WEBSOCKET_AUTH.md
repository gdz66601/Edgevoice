# WebSocket auth handoff

This project validates WebSocket sessions in the Worker before forwarding the
upgrade request to the `ChannelRoom` Durable Object.

## Normal request flow

1. The client opens `/api/ws/:kind/:id`.
2. `authMiddleware` runs the full session validation in the Worker.
3. The Worker forwards the upgrade request to `ChannelRoom` and overwrites these
   internal headers:
   - `x-cfchat-internal-auth`
   - `x-cfchat-verified-user-id`
   - `x-cfchat-verified-is-admin`
   - `x-cfchat-verified-at`
4. `ChannelRoom` trusts those headers on the Worker-to-DO path and only checks
   room accessibility during the handshake.

## Fallback path

If the internal headers are missing or malformed, `ChannelRoom` falls back to
the legacy token-based `validateSession()` check. This is only a safety net and
debugging fallback. The normal production path should use the Worker-injected
headers.

## Connection lifetime semantics

After the socket is established, the Durable Object does not revalidate session
state or room membership on every message or broadcast.

That means these changes now take effect when the client reconnects:

- password reset
- session invalidation
- account disable or delete
- removal from a private room

Open sockets are no longer kicked immediately when those changes happen.
