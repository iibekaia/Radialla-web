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
import { LocalizationService } from '../../core/localization/localization.service';
import * as L from 'leaflet';
import { LocationPoint } from '../../core/playback/autoplay-station.mjs';
import { Station } from '../../shared/models/station';
import { IconComponent } from '../../shared/ui/icon.component';
import { MapArea } from '../../shared/stations/station-geometry';
import { COUNTRIES } from '../../shared/data/countries';
import { StationMarkers } from './station-markers';
import { mapLocation } from '../../shared/stations/map-location.mjs';
import { MapLocationController } from './map-location-controller';
import { CatalogEntry } from '../../core/catalog/viewport-catalog.mjs';

import { FOCUS_ZOOM, LOCATION_ZOOM, MAP_LAYERS } from './map-layers';

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
  readonly overviewCountries = input<CatalogEntry[]>([]);
  readonly selectCountry = output<string>();
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
  readonly areaChange = output<MapArea>();
  readonly canvas = viewChild.required<ElementRef<HTMLDivElement>>('canvas');
  readonly layersOpen = signal(false);
  readonly layerId = signal('standard');
  readonly notice = signal('');
  readonly layers = MAP_LAYERS;
  private map?: L.Map;
  private tiles?: L.TileLayer;
  private markerRenderer?: StationMarkers;
  private observer?: ResizeObserver;
  private locationMarker?: L.CircleMarker;
  private readonly location = new MapLocationController({
    hasStationFocus: () => this.hasStationFocus(),
    notice: (key) => this.notice.set(key),
    ready: (point) => this.autoplayReady.emit(point),
    located: (point, automatic) => this.showLocation(point, automatic),
  });
  constructor() {
    effect(() => {
      const stations = this.stations(),
        active = this.activeId();
      this.overviewCountries();
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
    this.markerRenderer = new StationMarkers(
      this.map,
      this.i18n,
      (s) => this.selectStation.emit(s),
      (code) => this.selectCountry.emit(code),
    );
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
    void this.location.restore();
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
    this.markerRenderer?.render(stations, active, this.overviewCountries());
  }

  focus(s: Station) {
    if (!this.map || this.focusedStationId === s.id) return;
    const location = mapLocation(s, COUNTRIES);
    if (!location) return;
    this.focusedStationId = s.id;
    // Once the user has navigated, station selection must keep their zoom level.
    if (this.explored) {
      this.setAutomaticView([location.latitude, location.longitude], this.map.getZoom());
    } else if (location.approximate) {
      const country = COUNTRIES.find((c) =>
        s.countryCode ? c.code === s.countryCode.toUpperCase() : c.name === s.country,
      );
      if (country) this.focusCountry(country.code);
    } else this.setAutomaticView([location.latitude, location.longitude]);
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
  private setAutomaticView(point: L.LatLngExpression, zoom = FOCUS_ZOOM) {
    this.automaticMove = true;
    try {
      this.map?.setView(point, zoom, { animate: false });
    } finally {
      this.automaticMove = false;
    }
  }
  zoom(delta: number) {
    this.map?.setZoom(this.map.getZoom() + delta);
  }
  setLayer(id: string) {
    const layer = MAP_LAYERS.find((layer) => layer.id === id);
    if (!layer) return;
    this.layerId.set(id);
    this.layersOpen.set(false);
    if (!this.map) return;
    this.tiles?.remove();
    this.notice.set('');
    this.tiles = L.tileLayer(layer.url, {
      maxZoom: 18,
      attribution: layer.attribution,
      crossOrigin: true,
    })
      .on('tileerror', () => this.notice.set('mapError'))
      .addTo(this.map);
  }
  private hasStationFocus() {
    const station = this.focusedStation();
    return !!station && !!mapLocation(station, COUNTRIES);
  }
  locate() {
    this.location.locate();
  }
  private showLocation(point: LocationPoint, automatic: boolean) {
    if (!this.map) return;
    const coordinates: L.LatLngExpression = [point.latitude, point.longitude];
    // A late location response must not override a station or a user-selected area.
    if (!automatic || (!this.hasStationFocus() && !this.explored)) {
      this.setAutomaticView(coordinates, LOCATION_ZOOM);
      // Keep this closer zoom when location-based autoplay selects a station.
      this.explored = true;
    }
    this.locationMarker?.remove();
    this.locationMarker = L.circleMarker(coordinates, {
      radius: 7,
      color: '#fff',
      weight: 3,
      fillColor: '#2584ff',
      fillOpacity: 1,
    }).addTo(this.map);
    this.emitArea();
    if (!automatic) this.locationSelected.emit();
    else this.autoplayReady.emit(point);
  }
  ngOnDestroy() {
    this.location.destroy();
    this.markerRenderer?.destroy();
    this.observer?.disconnect();
    this.map?.remove();
  }
}
