# Radialla web + API

Angular 21 standalone UI and a Node.js 22 HTTP API. Existing iOS source is unchanged.

## Local development

From the `radialla-web/` project root, using Node 22.12 or newer in the 22.x series:

```sh
npm ci
npm run dev
```

Open http://localhost:4200. Run `npm start` in a second terminal for automatic song metadata and HTTP station playback; the dev server proxies `/api` to port 3000 (restart the dev server after changing its proxy configuration). This works with the bundled demo catalog even without the API. Favorites and the most recent API catalog use browser localStorage, with an in-memory fallback if storage is blocked. Map viewport and favorite filters run locally. The web explorer uses a full-viewport map with a collapsible station panel at the upper left and a floating bottom player with inline playback controls. The panel includes a country selector and a local favorites filter. On smaller screens it narrows to preserve access to map controls. The orange accent and logo match the app. Leaflet uses OpenStreetMap for standard maps and Esri imagery/topography for other layers; these differ from native Apple Maps and do not provide 3D terrain. External map tiles require internet, while the station list and favorites continue working if tiles fail. Optional `latitude` and `longitude` fields place catalog stations on the map; entries without coordinates remain in the list. Demo coordinates are illustrative city locations. This is backend-independent behavior, not a fully offline PWA: a first page load still requires hosting and live audio requires internet. The demo fallback has fictional names/frequencies and no playable streams. The web client now loads the same Radio Browser catalog as iOS, prioritizing Georgia and then paging through worldwide geolocated stations in batches of 500, with mirror failover. Real station UUIDs, coordinates and resolved stream URLs are retained; favorites stay local. Cached real stations remain available during refresh or network failure. The map groups nearby markers, and the list offers further rows in batches of 100. HTTPS streams play directly. HTTP-only stations play through the Node API at `/api/stream?station=<Radio Browser UUID>`, so the browser receives audio over the site’s HTTPS connection. This requires the API to be running; static-only hosting still supports direct HTTPS playback. Browser codec support and upstream availability still apply. The relay supports continuous audio (for example MP3/AAC/Ogg), not HLS or playlist rewriting. It resolves station UUIDs through Radio Browser and validates public destinations on every redirect, without accepting client stream URLs. Listener disconnects cancel the upstream stream; connection timeouts and a 64-listener limit bound resources. Relayed audio uses server bandwidth.

For the complete production-style app:

```sh
npm run build
npm start
```

Open http://localhost:3000. The Node server serves Angular assets plus `/api/health` and `/api/stations`. `npm test` checks the API, CORS, route/method boundaries, catalog normalization/mirror failover, retired audio-session events, ICY block parsing and metadata request safety. `npm run format:check` verifies source formatting; `npm run format` applies it. Unused TypeScript locals and parameters fail the build.

Configuration lives in `web/public/config.json`. `/` uses the same-origin API. Empty `apiBaseUrl` disables API access; an absolute HTTPS API URL allows separate hosting (set server `WEB_ORIGIN` to the exact frontend origin). Store URLs remain reserved configuration fields; no download buttons are currently shown. No Android application is implemented here.

`web/public/stations.json` remains a backend-independent demo fallback. Real catalog requests go directly to Radio Browser over HTTPS. See https://docs.radio-browser.info/ for the upstream API contract. Browser codec support and stream availability vary. The backend currently serves a bundled catalog; there is no database, authentication or user synchronization. The browser loads the upstream catalog independently of this server.

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

Manual language selection is saved under `radialla.language` and takes priority over automatic detection. Automatic mode uses the browser’s preferred languages and supported region mapping (GE, RU, UA, CN, KR, AM, TR), with English fallback. This differs from iOS location-based reverse geocoding: the web does not send coordinates to determine language. Changes update visible status/error messages, map labels, document language/title, counts and country names without restarting playback. Country translations use catalog country codes; station/song names and broadcaster text remain original. If storage is unavailable, the choice works for the current session. Other tabs and browser language changes are observed.

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
