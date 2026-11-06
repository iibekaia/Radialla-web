export type PlaybackStatus = 'loading' | 'playing' | 'paused' | 'error' | 'blocked';
export class AudioSession {
  constructor(
    onStatus: (status: PlaybackStatus) => void,
    createAudio?: () => HTMLAudioElement,
    timers?: Pick<typeof globalThis, 'setTimeout' | 'clearTimeout'>,
  );
  play(url: string): Promise<void>;
  setVolume(volume: number, muted?: boolean): void;
  stop(): void;
}
