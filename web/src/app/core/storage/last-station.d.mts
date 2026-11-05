import { Station } from '../../shared/models/station';
type StorageProvider = () => Pick<Storage, 'getItem' | 'setItem'>;
export function readLastStation(storage?: StorageProvider): Station | null;
export function writeLastStation(station: Station, storage?: StorageProvider): void;
