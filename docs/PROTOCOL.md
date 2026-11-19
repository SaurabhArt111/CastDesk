# Protocol (version 1)

One TCP port (default **7420**) carries both HTTP and WebSocket.

| Endpoint | Purpose |
| --- | --- |
| `GET /` | The client web app (PWA) |
| `GET /api/info` | Public host info: name, id, protocol version, whether pairing is open |
| `GET /api/ping` | Liveness |
| `WS /ws` | Viewer connections |
| `WS /source?token=…` | Capture source (loopback only) |

Text WebSocket messages are JSON objects with a `t` field (message type, see `MSG` in `packages/shared/src/protocol.js`). Binary messages are video frames (see ARCHITECTURE.md).

## Connection flow

```
viewer → host   hello { deviceId, name, platform }
host   → viewer welcome { v, hostId, hostName, platform, nonce, trusted }

── first time (pairing) ─────────────────────────────────────────────
viewer → host   pair-start { gx }        # SPEKE public value, generator derived from the PIN
host   → viewer pair-y { gy }
viewer → host   pair-confirm { mac }     # HMAC over both public values with the session key
host   → viewer pair-ok { mac, sealed }  # host proof + 256-bit device secret sealed with the session key
                (or pair-fail { reason })
host may send   pair-pending             # waiting for the user to approve control on the host

── every later time (trusted) ───────────────────────────────────────
viewer → host   auth { nonce, proof }     # HMAC(secret, 'client' ‖ hostNonce ‖ viewerNonce ‖ deviceId)
host   → viewer auth-ok { proof }        # mutual proof
                (or auth-fail)

── session ─────────────────────────────────────────────────────────
host   → viewer displays [ { id, x, y, w, h, primary, virtual, owner, name } ]
host   → viewer perm [ 'view', 'control' ]
viewer → host   subscribe { displays:[…], fps, maxWidth, quality }
host   → viewer <binary JPEG frames>
viewer → host   input { k: 'move'|'button'|'wheel'|'key'|'text'|'gesture'|'pen'|…, … }
either          ping / pong
either          bye
```

## PIN pairing (SPEKE)

- Group: RFC 3526 2048-bit MODP (group 14), computed with `BigInt`.
- The generator is derived from the PIN (and both ids): `g = (SHA-256-expand(PIN, context) mod p)² mod p`; each side picks a random exponent and sends `g^x`. Both derive `K = g^(xy)`.
- The generator is derived from the PIN with SHA-256 expansion and squared into the prime-order subgroup. Key confirmation uses HMAC-SHA-256 and proves both sides know the PIN.
- The host seals a freshly generated 256-bit device secret under the session key and stores it, with the device id, permissions and arrangement, in the trust store.
- A wrong guess gives an attacker only one online guess against one PIN; PINs are 6 digits, single-use, expire after 5 minutes, and are replaced after 5 failures. IPs with 10 failures are throttled.

## Trusted reconnect

Each side contributes a random nonce. The viewer proves knowledge of the device secret with `HMAC(secret, …)` and the host answers with its own proof, so neither side learns anything usable from a recording.

## Input messages

All fields are validated and clamped (`sanitizeInput`): unknown kinds are dropped, coordinates are normalised to 0–1 per display or bounded deltas, keys must be known DOM `code` values, `text` is length-limited. Input is ignored unless the session has the `control` permission.

## Versioning

`welcome.v` carries `PROTOCOL_VERSION` (currently 1). Version negotiation is not enforced yet; a future incompatible change will bump it and viewers should check it.
