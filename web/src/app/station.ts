export interface Station {
  id: string;
  name: string;
  country: string;
  countryCode?: string;
  genre: string;
  frequency: string;
  imageUrl?: string | null;
  streamUrl: string | null;
  latitude?: number;
  longitude?: number;
}
