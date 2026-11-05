import { Station } from '../models/station';
import { Country } from '../data/countries';
export function mapLocation(
  station: Station,
  countries: Country[],
): {
  latitude: number;
  longitude: number;
  approximate: boolean;
} | null;
