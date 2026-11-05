import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  input,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { LocalizationService } from './localization.service';
import * as L from 'leaflet';
import { LocationPoint } from './autoplay-station.mjs';
import { Station } from './station';
import { IconComponent } from './icon.component';
import { hasCoordinates, MapArea } from './station-geometry';
import { COUNTRIES } from './countries';

const FOCUS_ZOOM = 11;

@Component({
  selector: 'app-station-map',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './station-map.component.html',
  styleUrl: './station-map.component.css',
})
export class StationMapComponent implements AfterViewInit, OnDestroy {
  readonly i18n = inject(LocalizationService);
  readonly stations = input<Station[]>([]);
  readonly activeId = input<string>();
  readonly focusedStation = input<Station | null>(null);
  readonly autoFocus = input(true);
  readonly countryCode = input<string | null>(null);
  readonly browseArea = output<void>();
  readonly locationSelected = output<void>();
  private automaticMove = false;
  private browsing = false;
  private explored = false;
  private focusedStationId?: string;
  readonly favoritesOnly = input(false);
  readonly selectStation = output<Station>();
  readonly toggleFavorites = output<void>();
  readonly autoplayReady = output<LocationPoint | null>();
  private permission?: PermissionStatus;
  private locating = false;
  readonly areaChange = output<MapArea>();
  readonly canvas = viewChild.required<ElementRef<HTMLDivElement>>('canvas');
  readonly layersOpen = signal(false);
  readonly layerId = signal('standard');
  readonly notice = signal('');
  readonly layers = [
    { id: 'standard', label: 'მარტივი' },
    { id: 'satellite', label: 'სატელიტური' },
    { id: 'terrain', label: 'terrain' },
  ];
  private map?: L.Map;
  private tiles?: L.TileLayer;
  private markers?: L.LayerGroup;
  private observer?: ResizeObserver;
  private locationMarker?: L.CircleMarker;
  private destroyed = false;
  constructor() {
    effect(() => {
      const stations = this.stations(),
        active = this.activeId();
      this.i18n.language();
      this.renderMarkers(stations, active);
    });
    effect(() => {
      const station = this.focusedStation();
      if (station && this.autoFocus()) this.focus(station);
    });
    effect(() => {
      const code = this.countryCode();
      if (code !== null) this.focusCountry(code);
    });
  }
  ngAfterViewInit() {
    this.map = L.map(this.canvas().nativeElement, {
      zoomControl: false,
      worldCopyJump: true,
      minZoom: 2,
      maxZoom: 18,
    }).setView([30, 35], 2);
    this.markers = L.layerGroup().addTo(this.map);
    this.setLayer('standard');
    this.map.on('movestart', () => {
      if (!this.automaticMove) {
        this.browsing = true;
        this.explored = true;
      }
    });
    this.map.on('moveend', () => {
      this.renderMarkers(this.stations(), this.activeId());
      this.emitArea();
      if (this.browsing) {
        this.browsing = false;
        this.browseArea.emit();
      }
    });
    this.observer = new ResizeObserver(() => this.map?.invalidateSize());
    this.observer.observe(this.canvas().nativeElement);
    this.renderMarkers(this.stations(), this.activeId());
    this.emitArea();
    const station = this.focusedStation();
    if (station) this.focus(station);
    void this.restoreLocation();
  }
  private emitArea() {
    if (!this.map) return;
    const b = this.map.getBounds();
    this.areaChange.emit({
      south: b.getSouth(),
      north: b.getNorth(),
      west: b.getWest(),
      east: b.getEast(),
    });
  }
  private renderMarkers(stations: Station[], active?: string) {
    if (!this.markers || !this.map) return;
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
          } else this.selectStation.emit(s);
        })
        .addTo(this.markers);
    }
  }

  focus(s: Station) {
    if (this.map && hasCoordinates(s) && this.focusedStationId !== s.id) {
      this.focusedStationId = s.id;
      this.setAutomaticView([s.latitude, s.longitude]);
    }
  }
  private focusCountry(code: string) {
    if (!this.map) return;
    const country = COUNTRIES.find((c) => c.code === code);
    const [west, south, east, north] = country?.bounds || [-180, -70, 180, 80];
    this.automaticMove = true;
    this.explored = true;
    try {
      this.map.fitBounds(
        [
          [Math.max(-85, south), west],
          [Math.min(85, north), east],
        ],
        {
          animate: false,
          paddingTopLeft: [this.canvas().nativeElement.clientWidth > 700 ? 400 : 60, 100],
          paddingBottomRight: [50, 120],
          maxZoom: FOCUS_ZOOM,
        },
      );
    } finally {
      this.automaticMove = false;
    }
  }
  private setAutomaticView(point: L.LatLngExpression) {
    this.automaticMove = true;
    try {
      this.map?.setView(point, FOCUS_ZOOM, { animate: false });
    } finally {
      this.automaticMove = false;
    }
  }
  zoom(delta: number) {
    this.map?.setZoom(this.map.getZoom() + delta);
  }
  setLayer(id: string) {
    this.layerId.set(id);
    this.layersOpen.set(false);
    if (!this.map) return;
    this.tiles?.remove();
    const urls: Record<string, string> = {
      standard: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      satellite:
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      terrain:
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    };
    this.notice.set('');
    this.tiles = L.tileLayer(urls[id], {
      maxZoom: 18,
      attribution:
        id === 'standard'
          ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          : 'Tiles &copy; Esri',
      crossOrigin: true,
    })
      .on('tileerror', () => this.notice.set('mapError'))
      .addTo(this.map);
  }
  private hasStationFocus() {
    const station = this.focusedStation();
    return !!station && hasCoordinates(station);
  }
  private async restoreLocation() {
    if (this.hasStationFocus()) {
      this.autoplayReady.emit(null);
      return;
    }
    try {
      if (!navigator.permissions || !navigator.geolocation) {
        this.autoplayReady.emit(null);
        return;
      }
      const permission = await navigator.permissions.query({ name: 'geolocation' });
      if (this.destroyed) return;
      this.permission = permission;
      permission.onchange = () => {
        if (permission.state === 'granted' && !this.hasStationFocus()) this.locate(true);
      };
      if (permission.state === 'granted' && !this.hasStationFocus()) this.locate(true);
      else this.autoplayReady.emit(null);
    } catch {
      if (!this.destroyed) this.autoplayReady.emit(null);
    }
  }
  locate(automatic = false) {
    if (this.locating || this.destroyed) return;
    if (!navigator.geolocation) {
      this.notice.set('locationUnavailable');
      this.autoplayReady.emit(null);
      return;
    }
    this.locating = true;
    this.notice.set('locating');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        this.locating = false;
        if (this.destroyed || !this.map) return;
        this.notice.set('');
        const point: L.LatLngExpression = [p.coords.latitude, p.coords.longitude];
        // A late location response must not override a restored or newly chosen station.
        if (!automatic || (!this.hasStationFocus() && !this.explored)) this.setAutomaticView(point);
        this.locationMarker?.remove();
        this.locationMarker = L.circleMarker(point, {
          radius: 7,
          color: '#fff',
          weight: 3,
          fillColor: '#2584ff',
          fillOpacity: 1,
        }).addTo(this.map);
        this.emitArea();
        if (!automatic) this.locationSelected.emit();
        else
          this.autoplayReady.emit({ latitude: p.coords.latitude, longitude: p.coords.longitude });
      },
      () => {
        this.locating = false;
        if (!this.destroyed) {
          this.notice.set('locationError');
          this.autoplayReady.emit(null);
        }
      },
      { timeout: 10000, maximumAge: 60000 },
    );
  }
  ngOnDestroy() {
    this.destroyed = true;
    if (this.permission) this.permission.onchange = null;
    this.observer?.disconnect();
    this.map?.remove();
  }
}
