import * as L from 'leaflet';
import { Station } from '../../shared/models/station';
import { hasCoordinates } from '../../shared/stations/station-geometry';
import { LocalizationService } from '../../core/localization/localization.service';

/** Owns marker grouping, labels and selection; the map component owns navigation. */
export class StationMarkers {
  private readonly markers: L.LayerGroup;
  constructor(
    private readonly map: L.Map,
    private readonly i18n: LocalizationService,
    private readonly onSelect: (station: Station) => void,
  ) {
    this.markers = L.layerGroup().addTo(map);
  }
  render(stations: Station[], active?: string) {
    this.markers.clearLayers();
    const map = this.map,
      bounds = map.getBounds().pad(0.1),
      groups = new Map<string, Station[]>();
    for (const s of stations.filter(hasCoordinates)) {
      const longitude = s.longitude + 360 * Math.round((map.getCenter().lng - s.longitude) / 360);
      if (!bounds.contains([s.latitude, longitude])) continue;
      const p = map.latLngToContainerPoint([s.latitude, longitude]);
      const key = s.id === active ? 'active' : `${Math.floor(p.x / 44)}:${Math.floor(p.y / 44)}`;
      const group = groups.get(key) || [];
      group.push(s);
      groups.set(key, group);
    }
    for (const group of groups.values()) {
      const s = group[0];
      if (!hasCoordinates(s)) continue;
      const cluster = group.length > 1;
      const lat = group.reduce((n, s) => n + s.latitude!, 0) / group.length,
        lon = group.reduce((n, s) => n + s.longitude!, 0) / group.length;
      const marker = L.marker([lat, lon + 360 * Math.round((map.getCenter().lng - lon) / 360)], {
        title: cluster ? this.i18n.t('%@ რადიოსადგური — მიახლოება', group.length) : s.name,
        alt: s.name,
        icon: L.divIcon({
          className:
            'station-pin' + (cluster ? ' cluster' : '') + (s.id === active ? ' active' : ''),
          html: cluster ? `<span>${this.i18n.number(group.length)}</span>` : '<span></span>',
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        }),
      });
      const label = document.createElement('span');
      label.textContent = cluster ? this.i18n.t('%@ რადიოსადგური', group.length) : s.name;
      marker
        .bindTooltip(label, { direction: 'top' })
        .on('click', () => {
          if (cluster) {
            map.fitBounds(
              L.latLngBounds(
                group.filter(hasCoordinates).map((s) => [s.latitude, s.longitude] as L.LatLngTuple),
              ),
              { maxZoom: Math.min(18, map.getZoom() + 3), padding: [30, 30] },
            );
          } else this.onSelect(s);
        })
        .addTo(this.markers);
    }
  }

  destroy() {
    this.markers.remove();
  }
}
