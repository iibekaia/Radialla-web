export type RemotePlayback =
  | { type: 'play' | 'select'; stationId: string; revision: number }
  | { type: 'pause'; revision: number };
export interface RemoteViewport {
  latitude: number;
  longitude: number;
  zoom: number;
  revision: number;
}
export interface PairingState {
  revision: number;
  owner: null;
  members: number;
  playback?: RemotePlayback | null;
  viewport?: RemoteViewport | null;
}
export interface PairingCode {
  code: string;
  expiresAt: number;
}
export class PairingClient {
  constructor(options: {
    base: string;
    token?: string | null;
    changed?: () => void;
    fetcher?: typeof fetch;
    socketFactory?: (url: string) => WebSocket;
    save?: (token: string | null) => void;
  });
  token: string | null;
  connected: boolean;
  state: PairingState;
  connect(): Promise<void>;
  pair(code?: string): Promise<PairingCode>;
  newCode(): Promise<PairingCode>;
  leave(): Promise<void>;
  destroy(): void;
}
