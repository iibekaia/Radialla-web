import data from './countries.json';

export interface Country {
  code: string;
  name: string;
  latitude: number;
  longitude: number;
  capital?: { name: string; latitude: number; longitude: number };
  bounds: number[]; // west, south, east, north
}
export const COUNTRIES: Country[] = data;
