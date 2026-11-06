# Radialla remote control pairing

The web is the audio receiver. A paired mobile app is a controller: station
selection, play/pause and map navigation act on the web. Mobile must stop its
local audio when entering controller mode and must never start local audio
in response to controller taps. Outside a live pairing it works normally.

This independent web/API project does not contain or modify the iOS app.
The native app must implement this contract before the complete mobile
experience is available. Existing clients using playback claims must upgrade.
Claims are now harmless no-ops and never pause the web.

## Pairing and transport

The web creates an invite with `POST /api/pairing/create`, body `{}`.
Scan its QR in the native app and redeem with `POST /api/pairing/join`,
body `{code}`. Both return `{token, state}`; create also returns
`{code, expiresAt}`. Each device keeps its own token securely (Keychain on iOS).
The QR contains `{type:"radialla-pairing", version:1, apiBaseUrl, code, expiresAt}`,
never a token. Validate the configured HTTPS server origin and expiry before joining.
Codes expire after five minutes and can be used once. Groups allow four credentials.

All requests use JSON POST bodies. Authenticated requests require
`Authorization: Bearer <token>`; never place tokens in URLs or logs.
Use `/api/pairing/code` with `{}` to replace an invite, `/api/pairing/leave`
with `{}` to revoke that credential.

Keep one `/api/pairing/wait` request open with `{afterRevision:-1}`, then
use each received revision. Timeout is 25 seconds; clients need a longer
request timeout and should retry connection failures with backoff. A 401
invalidates the saved pairing. Groups expire after 24 hours of inactivity;
server restarts revoke them. Deploy one server instance with HTTPS.

## Mobile commands

Send authenticated `POST /api/pairing/command`:

- `{type:"play", stationId:"catalog-station-id"}` selects and plays on web.
- `{type:"select", stationId:"catalog-station-id"}` selects without playing.
- `{type:"pause"}` pauses web audio.
- `{type:"viewport", latitude:41.7, longitude:44.8, zoom:12}` mirrors the map.

Send map center and zoom after navigation ends (debounce gestures). Latitude
must be within ±85, longitude within ±180 and zoom from 2 to 18. Resolve
stations by catalog ID; stream URLs are not accepted in remote commands.

State contains `{revision, owner:null, members, playback, viewport}`.
`playback` and `viewport` are independently retained latest values, each with
its own `revision`, so a map update cannot overwrite a pending station choice.
Apply each value only once per revision and ignore older responses. Do not
send commands back when applying received state. `members` counts stored
credentials, not live devices. A live successful wait transport indicates
connectivity; on transport failure the mobile should exit controller mode
and restore normal local controls, without replaying offline commands later.

Browser autoplay rules still apply: a user gesture on the web may be required
before a remote play can produce sound. The web exposes the existing blocked
playback message. Local favorites and backend-independent catalog fallback
remain independent of pairing.
