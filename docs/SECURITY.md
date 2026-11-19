# Security

## Threat model

Paneo is for **trusted local networks and USB links**. It protects who may connect and who may control; it does not (yet) protect the confidentiality of an established session against someone who can see or alter your network traffic.

## What is protected

- **Pairing:** PIN-based SPEKE key exchange. The PIN is never transmitted, and passive recording gives no material for offline guessing. PINs are 6 digits, single-use, expire after 5 minutes, and rotate after pairing, expiry or 5 failed attempts. Per-IP throttling after 10 failures.
- **Reconnect:** mutual HMAC challenge–response using a random 256-bit per-device secret. The secret is never sent after pairing.
- **Authorisation:** per-device `view` / `control` permissions; global switch to disable control; optional approval prompt on the host; removing a device deletes its secret.
- **Input hardening:** messages are allow-listed and clamped; held keys/buttons are released on disconnect.
- **At rest:** `trust.json` is mode 0600 and encrypted with the OS keychain (Electron `safeStorage`) when available.
- **Capture source:** the `/source` endpoint accepts loopback connections with a random token only.
- **Privacy:** no telemetry, accounts, or outbound connections.

## Known limitations

1. **No transport encryption (v1).** Frames and input travel in plaintext over WebSocket. An on-path attacker could view the screen, read typed text, or inject messages into an existing session (the session is authenticated at the start but messages are not individually authenticated). *Mitigation:* use USB or a trusted network; never expose the port to the internet. *Planned:* encrypt/authenticate the stream with a key derived during pairing/reconnect.
2. **Plain HTTP viewer.** The web app is served over HTTP, so browsers treat it as an insecure origin and some features (e.g. camera) are unavailable outside the native app.
3. **PIN is a short secret.** SPEKE limits an attacker to one guess per attempt and the PIN is replaced after 5 failures, but a person with physical sight of the host screen can read it — by design.
4. **Elevated input.** If the host runs as administrator, paired controllers can drive elevated windows. Only pair devices you trust.
5. **Pen pressure** is transmitted but not injected as pressure.

## Reporting

Please use the repository's private vulnerability-reporting form rather than a public issue.
