# Radialla web + API

Angular 21 standalone UI and a Node.js 22 HTTP API. Existing iOS source is unchanged.

## Local development

From the `radialla-web/` project root, using Node 22.12 or newer in the 22.x series:

```sh
npm ci
npm run dev
```

Open http://localhost:4200. Run `npm start` in a second terminal for automatic song metadata and HTTP station playback; the dev server proxies `/api` to port 3000 (restart the dev server after changing its proxy configuration). This works with the bundled demo catalog even without the API. Favorites and the most recent API catalog use browser localStorage, with an in-memory fallback if storage is blocked. Map viewport and favorite filters run locally. The web explorer uses a full-viewport map with a collapsible station panel at the upper left and a floating bottom player with inline playback controls. The panel includes a country selector and a local favorites filter. On smaller screens it narrows to preserve access to map controls. The orange accent and logo match the app. Leaflet uses OpenStreetMap for standard maps and Esri imagery/topography for other layers; these differ from native Apple Maps and do not provide 3D terrain. External map tiles require internet, while the station list and favorites continue working if tiles fail. Optional `latitude` and `longitude` fields place catalog stations on the map; entries without coordinates remain in the list. Demo coordinates are illustrative city locations. This is backend-independent behavior, not a fully offline PWA: a first page load still requires hosting and live audio requires internet. The demo fallback has fictional names/frequencies and no playable streams. The web client requests live Radio Browser data by country as the map moves; the iOS project is not involved. Real station UUIDs, coordinates and resolved stream URLs are retained; favorites stay local. Cached real stations remain available during refresh or network failure. The map groups nearby markers, and the list offers further rows in batches of 100. HTTPS streams play directly. HTTP-only stations play through the Node API at `/api/stream?station=<Radio Browser UUID>`, so the browser receives audio over the site’s HTTPS connection. This requires the API to be running; static-only hosting still supports direct HTTPS playback. Browser codec support and upstream availability still apply. The relay supports continuous audio (for example MP3/AAC/Ogg), not HLS or playlist rewriting. It resolves station UUIDs through Radio Browser and validates public destinations on every redirect, without accepting client stream URLs. Listener disconnects cancel the upstream stream; connection timeouts and a 64-listener limit bound resources. Relayed audio uses server bandwidth.

For the complete production-style app:

```sh
npm run build
npm start
```

Open http://localhost:3000. The Node server serves Angular assets plus `/api/health` and `/api/stations`. `npm test` checks the API, CORS, route/method boundaries, catalog normalization/mirror failover, retired audio-session events, ICY block parsing and metadata request safety. `npm run format:check` verifies source formatting; `npm run format` applies it. Unused TypeScript locals and parameters fail the build.

Configuration lives in `web/public/config.json`. `/` uses the same-origin API. Empty `apiBaseUrl` disables API access; an absolute HTTPS API URL allows separate hosting (set server `WEB_ORIGIN` to the exact frontend origin). Store URLs remain reserved configuration fields; no download buttons are currently shown. No Android application is implemented here.

`web/public/stations.json` remains a backend-independent demo fallback. Country counts and station details are requested directly from Radio Browser over HTTPS, with mirror failover and a bounded local cache. See https://docs.radio-browser.info/ for the upstream API contract. Browser codec support and stream availability vary. The backend currently serves a bundled catalog; there is no database, authentication or user synchronization. The browser loads the upstream catalog independently of this server.

## Railway deployment

The root `railway.json` uses the existing multi-stage Dockerfile and checks
`/api/health` before routing traffic to a deployment. The server already listens
on `0.0.0.0` and Railway's injected `PORT`. Deploy from the repository root,
not the `server` or `web` workspace directory.

1. In Railway, select **New Project → Deploy from GitHub repo** and choose
   `iibekaia/Radialla-web`, after the deployment configuration is pushed.
2. Keep the Free plan for the trial; do not upgrade to Hobby for this setup.
   Check the plan and remaining credits in the dashboard. Free credits are
   limited and do not guarantee an always-running service for the entire month.
3. Under the service's Networking settings, generate a public domain. Railway
   serves the Angular app and API together over HTTPS, so the bundled
   `apiBaseUrl: "/"` requires no change.
4. If the frontend stays on a separate host, set `WEB_ORIGIN` to its exact
   origin and configure that frontend's `apiBaseUrl` with the Railway HTTPS URL.
5. Verify `https://<generated-domain>/api/health` returns `{"status":"ok"}`,
   then open the root URL and check the catalog and playback.

This deploys the existing web/API only. Device pairing and exclusive playback
between iOS and the web are not implemented yet. They require a separate
coordination API plus integration in each client. The iOS project remains
independent. Audio relayed through `/api/stream` consumes hosting bandwidth;
direct HTTPS station streams do not pass through this server.

Railway configuration reference: https://docs.railway.com/config-as-code/reference

## Unavailable station fallback

When playback reports a terminal `streamError`, the explorer waits three seconds and tries the next playable station in the current filtered/visible list. Existing reconnect attempts run first for an interrupted established stream. A failure chain skips stations already attempted and stops when no alternative remains. Successful playback clears the failure history. Manual play/pause, station selection or map/country browsing cancels the pending switch. Browser autoplay denial, loading and paused states do not trigger fallback. HTTP stations are candidates only when the configured API relay and a valid station UUID are available.

## Station sharing

Use the player's Share station button to choose Facebook, copy the station link, or open more sharing options in the system share sheet. Facebook opens its share composer in a new tab; publishing remains a separate action there. If clipboard access is blocked, a selectable link appears in the player. Links use `?station=<station ID>` and preserve the hosting path, so they also work on static hosting. Opening a link selects that station, ahead of the last-played station and location-based autoplay; press Play to listen. The app checks the local/demo catalog first and resolves uncached Radio Browser UUIDs directly without the Node API. Unavailable links show a message and leave browsing usable. A manual station or map selection takes priority over an unfinished link lookup.

## Floating player

Browsers supporting automatic Document Picture-in-Picture can move the existing player into an always-on-top window when switching tabs during playback. Station selection, metadata, volume and playback stay synchronized. Back to tab focuses the original tab and restores the player; closing the floating window restores the player without stopping audio. Unsupported browsers keep the regular player. There is no manual floating-player launch button.

The player registers the Media Session `enterpictureinpicture` action for automatic opening while playing when switching tabs. The browser controls eligibility and permission; automatic opening cannot be guaranteed on every browser or visit. In desktop Chrome, allow Automatic picture-in-picture in the site's permissions if prompted. Automatic windows close on returning to the tab. HTTPS (or localhost) is required. No camera, microphone or extension is needed.

References: https://developer.chrome.com/blog/automatic-picture-in-picture-media-playback and https://developer.chrome.com/docs/web-platform/document-picture-in-picture.

## Viewport-based live catalog

The browser requests the lightweight Radio Browser `/json/countrycodes` summary instead of paging through the worldwide station catalog. At wide zoom, markers show live country entry counts at capitals; these are country summaries rather than counts at that exact location. Selecting a country or moving into a closer map area loads that country's live station list, retaining original UUIDs, streams and coordinates. New stations do not require a build, deployment or regenerated files. Even countries with no previous stations are represented geographically and become discoverable after their count changes.

Country-count freshness lasts five minutes; country-detail freshness lasts fifteen minutes. A count change invalidates that country's details earlier, even when its old cache is still fresh. While the page is visible, a minute timer checks whether refreshes are due; returning to the tab also checks. Expiry works within the same open page, not just after a reload. Upstream updates and mirror propagation still affect when a newly submitted station becomes available.

Movement waits 350 ms, requests at most two countries concurrently, and aborts countries no longer needed. Cached countries appear immediately. Failed requests retain existing data and stop until a later refresh/navigation retries. Country responses replace their previous rows, so removed entries do not accumulate. Favorite IDs and the separate last-played station preference remain local and unchanged. The localStorage cache targets 3 MB, prioritizes favorite/last-station metadata and recently used countries, and migrates older array/static-snapshot caches as stale data requiring live revalidation.

There are no bundled country station files. The small `country-regions.json` contains geographic bounds only, generated from [Natural Earth admin-0 geometry](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson), including multipart countries such as Alaska/Hawaii. Countries absent from that map use the existing bundled country bounds. This geography selects candidate countries without relying on old station positions. Geographic boxes can overfetch nearby countries, and incorrectly assigned broadcaster coordinates can still be shown once their country is loaded. Country selection always fetches that country's full live catalog, including missing-coordinate stations placed at capitals. Cached data and the bundled demo remain usable when the API is unavailable.

To regenerate geographic bounds (not radio data): `python3 scripts/generate-country-regions.py /path/to/ne_110m_admin_0_countries.geojson`. To try locally: `npm run build`, then `PORT=4301 npm start` and open http://localhost:4301. Local changes do not publish automatically.

## Current song information

While playback is active, the bottom player requests `/api/now-playing?station=<Radio Browser UUID>` immediately, then 20 seconds after each response. The API resolves the UUID through Radio Browser and reads a bounded sample of ICY metadata from the stream. It shares cached lookups for 20 seconds and limits concurrent reads. Stream destinations and redirects must resolve to public IP addresses; client-supplied stream URLs are not accepted. Pausing, playback failure or changing stations clears the displayed track and cancels frontend requests.

The artist/title line appears only when metadata is available. Unsupported streams and failures leave the ordinary playback status. This version reads Icecast/Shoutcast ICY `StreamTitle`, with UTF-8 and Windows-1252 fallback; HLS ID3, Ogg tags, broadcaster-specific APIs and audio recognition are not implemented. Updates may lag the audible song because of station buffering and polling. Standalone frontend hosting still works for catalog/favorites/playback, but requires the Node API for this feature.

## GitHub build → Render hosting

### GitHub Pages frontend

With repository Settings → Pages → Source set to GitHub Actions, successful main-branch builds also publish the Angular frontend to GitHub Pages. The workflow can be started manually from Actions → Radialla platform → Run workflow on `main`. Set the custom domain to `radialla.ge` in Pages settings and enable Enforce HTTPS after DNS validation and certificate issuance.

The Pages artifact uses an empty `apiBaseUrl`, since Pages cannot run the Node API. Direct HTTPS stations, the catalog and local favorites work; HTTP-only station relay and current-song metadata require separately hosted API infrastructure. The normal build artifact and Docker image retain their same-origin API configuration for Render. This Pages build targets the root of the configured custom domain.

### Full application on Render

`.github/workflows/web.yml` verifies PRs; main-branch pushes also build a Linux Docker image and publish it to `ghcr.io/<lowercase-owner>/radialla-platform` with latest and commit SHA tags. GitHub Actions performs the build; Render runs the image.

1. Push this independent project into its own GitHub repository. No GitHub remote has been configured yet.
2. After the first successful workflow, create a Render Web Service using Existing Image and `ghcr.io/<owner>/radialla-platform:latest`. For a private package, configure a Render registry credential with `read:packages` permission. Choose a region close to listeners, for example Frankfurt when offered. Set the health check path to `/api/health`.
3. Save the Render deploy hook as the GitHub Actions secret `RENDER_DEPLOY_HOOK`. Later successful image builds trigger this hook. The hook response starts deployment; it does not certify successful rollout. Check Render deployment status and `/api/health` after rollout.
4. Connect your domain in Render and apply its provided DNS records. HTTPS terminates at Render. `PORT` is supplied by the host. Choose a paid always-on service for a public launch; check current compute/bandwidth pricing before purchase.

For manual Docker checks: `docker build -t radialla-platform .` then `docker run --rm -p 3000:3000 radialla-platform`.

References: https://render.com/docs/deploying-an-image and https://render.com/docs/web-services.

## Verification limits

The production Angular build and API integration tests (including audio relay bytes, upstream failures and disconnect cleanup) are the local checks. Docker image publication, hosted deployment, store destinations, individual stream availability and broad device QA require separate verification. The iOS build requires full Xcode; Command Line Tools alone cannot compile the existing targets.

## Interface languages

The globe icon in the header selects English, Georgian, Russian, Ukrainian, Simplified Chinese, Korean, Armenian or Turkish, matching the iOS language set. Existing app translations were copied into independent web dictionaries, with additional browser-specific strings. No iOS files are required at build time or runtime.

Manual language selection is saved under `radialla.language` and takes priority over automatic detection. Automatic mode looks up the visitor's country through https://api.country.is/ using their network IP, including on static GitHub Pages and in fresh incognito sessions. GE, RU, UA, CN, KR, AM and TR select Georgian, Russian, Ukrainian, Simplified Chinese, Korean, Armenian and Turkish respectively. All other countries, unavailable lookups and the initial pending state use English, regardless of browser language. The lookup runs once per page session when automatic mode is needed, without cookies, a referrer or GPS coordinates, and times out after four seconds. It does not require location permission. VPNs and proxies can change the detected country; this is approximate IP geolocation rather than iOS GPS reverse geocoding. The country lookup is shared with catalog startup; a manually selected language is retained when it completes. Country detection is not saved as a manual preference. Changes update visible status/error messages, map labels, document language/title, counts and country names without restarting playback. Country translations use catalog country codes; station/song names and broadcaster text remain original. If storage is unavailable, the choice works for the current session. Language preference changes from other tabs are observed.

The player remembers the last successfully played station in browser localStorage (`radialla.lastStation`). On the next visit it restores that station immediately and attempts playback after configuration is ready, ahead of location-based station selection. The saved station remains available when catalog refresh fails; refreshed catalog data is preferred when available. Browser autoplay restrictions still apply. Corrupt or blocked storage falls back to the normal station selection.

The station panel includes a localized country selector with 250 countries and territories, bundled for offline availability. Selecting a country filters stations and fits its map bounds; clearing the selection shows all countries in the current map area and resets the map to the world view. Country names and coordinates are derived from [mledoze/countries (ODbL)](https://github.com/mledoze/countries); map bounds are from [sandstrom/country-bounding-boxes (public domain)](https://github.com/sandstrom/country-bounding-boxes), with approximate local bounds for smaller territories absent from that dataset.

## Code structure

- `app.component` composes the header, map, station panel and mini player.
- `station-panel.component` owns the list UI and pagination; `mini-player.component` owns playback presentation, loading and equalizer styles.
- `explorer.service` coordinates catalog filters, selection, map browsing and autoplay. Pure selection/queue rules live in `station-selection.mjs`.
- `station-map.component` owns Leaflet navigation. `station-markers` renders groups and labels, `map-location-controller` manages location permissions and request lifetimes, and `map-layers` holds tile configuration and focus zoom.
- `catalog`, `playback`, `now-playing`, favorites and storage modules retain separate responsibilities and browser-local persistence.
- Server `public-stream.mjs` validates public network destinations, `station-stream.mjs` resolves catalog IDs, `icy-metadata.mjs` parses stream metadata, and `stream-metadata.mjs` coordinates metadata caching/polling. The audio relay remains in `stream-relay.mjs`.

Run `npm run build`, `npm test`, and `npm run format:check` after refactoring.

### Folder layout

```text
web/src/app/
  app.component.*       Application shell
  core/
    catalog/            Catalog loading and Radio Browser access
    favorites/          Favorite station state
    localization/       Translations, locale dictionaries and language picker
    playback/           Audio session, playback and now-playing metadata
    storage/            Browser-local persistence
  features/
    explorer/           Filters, selection and autoplay coordination
    map/                Map component, markers, layers and geolocation
    player/             Mini player template and styles
    stations/           Station list template, pagination and styles
  shared/
    data/               Country list and map bounds
    models/             Station model
    stations/           Coordinate and viewport helpers
    ui/                 Reusable icons and station images
server/
  app.mjs, index.mjs    HTTP routes and server entry point
  streaming/           Public stream access, catalog lookup and audio relay
  metadata/            ICY parsing and metadata provider
  tests/               Unit and integration tests
```

Country names for all 250 country/territory entries are bundled in `web/src/app/core/localization/country-names.json` for all eight supported languages. The dropdown and station country labels use this dictionary instead of relying on browser `Intl.DisplayNames` locale support. Regenerate from Node ICU/CLDR with `node scripts/generate-country-names.mjs`.

Country selection is a temporary map filter: a manual pan or zoom removes the country restriction without resetting the viewport. Countries with no loaded stations show a localized empty state and an All countries action. While the catalog is still loading, the panel indicates that loading is ongoing instead of reporting a country as unavailable.

Stations without usable coordinates are placed approximately at their country's capital (or administrative seat for territories), while their original catalog coordinates remain untouched. Capital names appear in marker tooltips; shared markers open a station picker. The four uninhabited areas without a capital retain an approximate area placement.

Capital/admin-seat coordinates are bundled from [GeoNames cities15000 (CC BY 4.0)](https://download.geonames.org/export/dump/) with [REST Countries](https://github.com/restcountries/restcountries/blob/master/src/main/resources/countriesV3.1.json) coordinates for IO and TK. To refresh, run `python3 scripts/generate-country-capitals.py /path/to/cities15000.zip /path/to/countriesV3.1.json`. Country focus bounds include the capital so approximate markers remain visible. No external geocoding service is needed at runtime.
