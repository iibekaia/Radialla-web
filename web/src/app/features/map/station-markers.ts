import * as L from 'leaflet';
import { Station } from '../../shared/models/station';
import { mapLocation } from '../../shared/stations/map-location.mjs';
import { COUNTRIES } from '../../shared/data/countries';
import { CatalogEntry } from '../../core/catalog/viewport-catalog.mjs';

import { LocalizationService } from '../../core/localization/localization.service';

type Placement = {
  station: Station;
  latitude: number;
  longitude: number;
  approximate: boolean;
  capital?: string;
};

/** Owns marker grouping, labels and selection; the map component owns navigation. */
export class StationMarkers {
  private readonly markers: L.LayerGroup;
  constructor(
    private readonly map: L.Map,
    private readonly i18n: LocalizationService,
    private readonly onSelect: (station: Station) => void,
    private readonly onSelectCountry: (code: string) => void,
  ) {
    this.markers = L.layerGroup().addTo(map);
  }
  render(stations: Station[], active?: string, overview: CatalogEntry[] = []) {
    this.markers.clearLayers();
    const map = this.map,
      bounds = map.getBounds().pad(0.1),
      groups = new Map<string, Placement[]>();
    for (const country of overview) {
      if (!COUNTRIES.some((c) => c.code === country.code)) continue;
      const longitude =
        country.longitude + 360 * Math.round((map.getCenter().lng - country.longitude) / 360);
      if (!bounds.contains([country.latitude, longitude]) || country.count <= 0) continue;
      const label = `${this.i18n.country(country.name, country.code)} — ${this.i18n.t('countryOverview', country.count)}`;
      const content = document.createElement('span');
      content.textContent = this.i18n.number(country.count);
      const marker = L.marker([country.latitude, longitude], {
        title: label,
        alt: label,
        icon: L.divIcon({
          className: 'station-pin cluster country-overview',
          html: content,
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        }),
      });
      const tooltip = document.createElement('span');
      tooltip.textContent = label;
      marker.bindTooltip(tooltip, { direction: 'top' });
      marker.on('click', () => this.onSelectCountry(country.code));
      marker.addTo(this.markers);
    }
    for (const station of stations) {
      if (overview.length && (station.id !== active || !station.streamUrl)) continue;
      const location = mapLocation(station, COUNTRIES);
      if (!location) continue;
      const s = { station, ...location };
      const longitude = s.longitude + 360 * Math.round((map.getCenter().lng - s.longitude) / 360);
      if (!bounds.contains([s.latitude, longitude])) continue;
      const p = map.latLngToContainerPoint([s.latitude, longitude]);
      // Keep country placements separate from precise station clusters.
      const key = s.approximate
        ? `country:${s.latitude}:${s.longitude}`
        : station.id === active
          ? 'active'
          : `${Math.floor(p.x / 44)}:${Math.floor(p.y / 44)}`;
      const group = groups.get(key) || [];
      group.push(s);
      groups.set(key, group);
    }
    for (const group of groups.values()) {
      const s = group[0];
      const cluster = group.length > 1;
      const lat = group.reduce((n, s) => n + s.latitude, 0) / group.length,
        lon = group.reduce((n, s) => n + s.longitude, 0) / group.length;
      const approximate = s.approximate;
      const labelText =
        (cluster ? this.i18n.t('%@ რადიოსადგური', group.length) : s.station.name) +
        (approximate
          ? ` — ${this.i18n.t('approximateLocation')}${s.capital ? ` (${s.capital})` : ''}`
          : '');
      const marker = L.marker([lat, lon + 360 * Math.round((map.getCenter().lng - lon) / 360)], {
        title: labelText,
        alt: labelText,
        icon: L.divIcon({
          className:
            'station-pin' +
            (cluster ? ' cluster' : '') +
            (approximate ? ' approximate' : '') +
            (group.some((s) => s.station.id === active) ? ' active' : ''),
          html: cluster ? `<span>${this.i18n.number(group.length)}</span>` : '<span></span>',
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        }),
      });
      const label = document.createElement('span');
      label.textContent = labelText;
      marker.bindTooltip(label, { direction: 'top' });
      const colocated = group.every(
        (point) => point.latitude === s.latitude && point.longitude === s.longitude,
      );
      if (approximate || (cluster && colocated)) {
        // Coincident markers cannot be separated by zooming. Offer every station directly.
        const content = document.createElement('div');
        content.className = 'map-station-picker';
        if (approximate) {
          const note = document.createElement('p');
          note.textContent = this.i18n.t(
            s.capital ? 'countryLocationNotice' : 'countryAreaLocationNotice',
          );
          content.append(note);
        }
        for (const { station } of group) {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = station.name;
          button.addEventListener('click', () => {
            this.onSelect(station);
            this.map.closePopup();
          });
          content.append(button);
        }
        // Opening the picker must not pan the map and trigger area autoplay.
        marker.bindPopup(content, { maxHeight: 260, autoPan: false });
      } else {
        marker.on('click', () => {
          if (cluster) {
            map.fitBounds(
              L.latLngBounds(group.map((s) => [s.latitude, s.longitude] as L.LatLngTuple)),
              { maxZoom: Math.min(18, map.getZoom() + 3), padding: [30, 30] },
            );
          } else this.onSelect(s.station);
        });
      }
      marker.addTo(this.markers);
    }
  }

  destroy() {
    this.markers.remove();
  }
}
