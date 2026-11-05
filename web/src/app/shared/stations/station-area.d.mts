import { Station } from '../models/station';
import { MapArea } from './station-geometry';
export function stationInArea(station: Station, area: MapArea | null): boolean;
