import { Station } from '../models/station';
import { MapArea } from './station-geometry';
export function stationInArea(
  station: Pick<Station, 'latitude' | 'longitude'>,
  area: MapArea | null,
): boolean;
