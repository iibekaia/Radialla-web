import { Station } from '../../shared/models/station';
export interface LocationPoint {
  latitude: number;
  longitude: number;
}
export function autoplayStation(
  stations: Station[],
  location: LocationPoint | null,
): Station | undefined;
