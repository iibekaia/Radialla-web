import { LocationPoint } from '../../core/playback/autoplay-station.mjs';

interface LocationCallbacks {
  hasStationFocus(): boolean;
  notice(key: string): void;
  ready(point: LocationPoint | null): void;
  located(point: LocationPoint, automatic: boolean): void;
}

/** Permission checks and location requests are independent of Leaflet rendering. */
export class MapLocationController {
  private permission?: PermissionStatus;
  private locating = false;
  private destroyed = false;
  constructor(
    private readonly callbacks: LocationCallbacks,
    private readonly browser: Pick<Navigator, 'permissions' | 'geolocation'> = navigator,
  ) {}

  async restore() {
    if (this.callbacks.hasStationFocus()) {
      this.callbacks.ready(null);
      return;
    }
    try {
      if (!this.browser.permissions || !this.browser.geolocation) {
        this.callbacks.ready(null);
        return;
      }
      const permission = await this.browser.permissions.query({ name: 'geolocation' });
      if (this.destroyed) return;
      this.permission = permission;
      permission.onchange = () => {
        if (permission.state === 'granted' && !this.callbacks.hasStationFocus()) this.locate(true);
      };
      if (permission.state === 'granted' && !this.callbacks.hasStationFocus()) this.locate(true);
      else this.callbacks.ready(null);
    } catch {
      if (!this.destroyed) this.callbacks.ready(null);
    }
  }
  locate(automatic = false) {
    if (this.locating || this.destroyed) return;
    if (!this.browser.geolocation) {
      this.callbacks.notice('locationUnavailable');
      this.callbacks.ready(null);
      return;
    }
    this.locating = true;
    this.callbacks.notice('locating');
    this.browser.geolocation.getCurrentPosition(
      (p) => {
        this.locating = false;
        if (this.destroyed) return;
        this.callbacks.notice('');
        this.callbacks.located(
          { latitude: p.coords.latitude, longitude: p.coords.longitude },
          automatic,
        );
      },
      () => {
        this.locating = false;
        if (this.destroyed) return;
        this.callbacks.notice('locationError');
        this.callbacks.ready(null);
      },
      { timeout: 10000, maximumAge: 60000 },
    );
  }
  destroy() {
    this.destroyed = true;
    if (this.permission) this.permission.onchange = null;
  }
}
