import type { Station } from '../../shared/models/station';
export interface FailoverState {
  id: string | null;
  failed: boolean;
  playing: boolean;
}
export function canPlayStation(station: Station, relayAvailable: boolean): boolean;
export class StationFailoverController {
  constructor(
    callbacks: {
      state(): FailoverState;
      stations(): Station[];
      relayAvailable(): boolean;
      play(station: Station): void;
    },
    timers?: Pick<typeof globalThis, 'setTimeout' | 'clearTimeout'>,
    delay?: number,
  );
  update(state: FailoverState): void;
  reset(): void;
  destroy(): void;
}
