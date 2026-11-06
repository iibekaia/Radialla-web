type StorageProvider = () => Pick<Storage, 'getItem' | 'setItem'>;
export function readVolume(storage?: StorageProvider): { volume: number; muted: boolean };
export function writeVolume(volume: number, muted: boolean, storage?: StorageProvider): void;
