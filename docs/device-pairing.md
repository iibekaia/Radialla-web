# Radialla device pairing API v1

This contract belongs to the independent web/API project. It does not modify
the iOS app. A compatible iOS release must add an in-app QR scanner, token
storage in Keychain, long-poll handling and playback integration before users
can pair that app with the web.

## Intended experience

1. On the web, open **Devices**. The QR appears automatically.
2. In the iOS app, open **Devices → Scan QR** and request camera access there.
3. Decode the invite, validate the server, and call `join`. Show connection
   success only after the API accepts it. The web updates its device count and
   removes the consumed QR automatically.
4. Keep a `wait` request open. Only after the local audio engine confirms actual
   playback, call `claim`. When another playback instance owns the group, pause
   local audio. Do not automatically start playback on the other device.

The QR is a JSON payload for the in-app scanner, not a Universal Link and not
an iOS URL scheme. Scanning it in the system Camera does not launch the app.
No Associated Domains or iOS configuration is assumed by this web project.

```json
{
  "type": "radialla-pairing",
  "version": 1,
  "apiBaseUrl": "https://radialla-web-production.up.railway.app",
  "code": "12345678",
  "expiresAt": 1793964600000
}
```

`expiresAt` is Unix time in milliseconds; the example timestamp is illustrative.
Validate the version, type, eight ASCII digits, expiry and an HTTPS API base
without credentials, query or fragment. Production iOS should allow only the
configured Radialla server origin, not arbitrary QR-selected destinations.
An invite contains no durable device credential. Treat it as a secret until
used or expired. Do not include it or the returned token in analytics/logs.

## HTTP requests

All endpoints use `POST`, `Content-Type: application/json`, and JSON bodies
(including `{}` for empty bodies). Responses have `Cache-Control: no-store`.
Only `create` and `join` are unauthenticated. All other requests require
`Authorization: Bearer <token>`. Never put this token in a URL or QR.

| Path | Body | Success response |
| --- | --- | --- |
| `/api/pairing/create` | `{}` | `{token, code, expiresAt, state}` |
| `/api/pairing/join` | `{code}` | `{token, state}` |
| `/api/pairing/code` | `{}` | `{code, expiresAt}` |
| `/api/pairing/claim` | `{clientId}` | `state` |
| `/api/pairing/wait` | `{afterRevision}` | `state` |
| `/api/pairing/leave` | `{}` | `{ok: true}` |

Each joining device gets its own random 256-bit token. A code can be redeemed
once and expires in five minutes. Generating a new code invalidates the old
invite. Up to four device credentials can join a group.

```json
{"revision": 3, "owner": "11111111-2222-4333-8444-555555555555", "members": 2}
```

`owner` is a random playback instance ID, or `null`; it contains no station or
user data. Generate a new UUID per running playback instance (per tab on web).
Use a fresh `clientId` after an app restart, while retaining a valid stored
device token. `members` counts credentials, not currently online devices.

Start `wait` with `afterRevision: -1`, then use the latest received revision.
If the state changes, the server responds immediately; otherwise it returns
the current state after 25 seconds. Set the client timeout above 25 seconds
(web uses 35). Keep at most one wait request per client and immediately issue
the next after success. Abort on teardown; retry network errors with backoff.
The web retries after two seconds. HTTP 401 means the pairing is no longer
valid: remove the credential and invite the user to pair again. HTTP 404 on
join means invalid/expired invite, 409 is the four-device limit, 429 asks the
client to wait, and 503 means server capacity is exhausted.

## Playback ordering

Only `claim` changes the playback owner. It must follow an actual successful
local playback event, not a button tap or stream-loading event. Autoplay denial
and failed streams must leave the other player running. Pause is local; it
does not claim ownership or instruct another device to start.

While awaiting a local claim response, queue ownership updates rather than
pausing on an old owner. Apply only nondecreasing revisions. After the claim
response, evaluate the newest state received: a concurrent, newer remote claim
wins and must pause local audio. Do not echo a received pause as another claim.
Brief overlap during handover and delayed delivery during disconnection are
possible. On reconnection, a newer remote owner pauses local playback. If the
OS suspends the app's networking, the handover cannot be guaranteed until that
networking resumes; verify iOS background audio behavior in the native project.

## Deployment and persistence

Use HTTPS and one Railway instance. Groups are ephemeral, bounded in memory,
and expire after 24 hours without authenticated API activity. Server restarts
and redeploys revoke pairing. Browser credentials live under
`radialla.pairing`, separate from local favorites. Database-backed sessions are
a later extension; no database, paid plan or iOS source dependency is required
for this implementation. A separately hosted web client must match the exact
`WEB_ORIGIN` configured on the API for CORS preflight and POST requests.
