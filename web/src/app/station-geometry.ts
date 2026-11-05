import { Station } from './station';

export interface MapArea {
  south: number;
  north: number;
  west: number;
  east: number;
}
export function hasCoordinates(s: Station): s is Station & { latitude: number; longitude: number } {
  return (
    Number.isFinite(s.latitude) &&
    Number.isFinite(s.longitude) &&
    Math.abs(s.latitude!) <= 85 &&
    Math.abs(s.longitude!) <= 180
  );
}
