export interface PairingState {
  revision: number;
  owner: string | null;
  members: number;
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
    pause?: () => void;
    save?: (token: string | null) => void;
  });
  token: string | null;
  clientId: string;
  connected: boolean;
  playing: boolean;
  state: PairingState;
  connect(): Promise<void>;
  pair(code?: string): Promise<PairingCode>;
  newCode(): Promise<PairingCode>;
  leave(): Promise<void>;
  playbackStarted(): void;
  playbackStopped(): void;
  destroy(): void;
}
