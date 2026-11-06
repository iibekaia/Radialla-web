import { Injectable, DestroyRef, effect, inject, signal, computed, untracked } from '@angular/core';
import { CatalogService } from '../catalog/catalog.service';
import { PairingState, PairingClient } from './pairing-client.mjs';
import { readPairing, writePairing } from '../storage/pairing.mjs';
import { pairingPayload } from './pairing-qr.mjs';

@Injectable({ providedIn: 'root' })
export class PairingService {
  private readonly catalog = inject(CatalogService);
  private client?: PairingClient;
  private readonly generation = signal(0);
  readonly remotePlayback = signal<PairingState['playback']>(null);
  readonly remoteViewport = signal<PairingState['viewport']>(null);
  readonly available = signal(false);
  readonly paired = signal(false);
  readonly connected = signal(false);
  readonly members = signal(0);
  readonly code = signal('');
  readonly expiresAt = signal(0);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly qrPayload = computed(() => {
    if (!this.code()) return '';
    try {
      return pairingPayload(
        this.catalog.config().apiBaseUrl,
        window.location.origin,
        this.code(),
        this.expiresAt(),
      );
    } catch {
      return '';
    }
  });

  constructor() {
    effect(() => {
      this.generation();
      const base = this.catalog.config().apiBaseUrl;
      untracked(() => this.configureClient(base));
    });
    effect((onCleanup) => {
      if (!this.code()) return;
      const timer = setTimeout(
        () => {
          this.code.set('');
          this.error.set('pairCodeExpired');
        },
        Math.max(0, this.expiresAt() - Date.now()),
      );
      onCleanup(() => clearTimeout(timer));
    });
    inject(DestroyRef).onDestroy(() => this.client?.destroy());
  }
  private configureClient(base: string) {
    this.client?.destroy();
    this.client = undefined;
    this.available.set(!!base);
    this.paired.set(false);
    this.connected.set(false);
    this.members.set(0);
    this.code.set('');
    this.remotePlayback.set(null);
    this.remoteViewport.set(null);
    if (!base) return;
    const client = new PairingClient({
      base,
      token: readPairing(base),
      changed: () => this.syncClient(client),
      save: (token) => writePairing(base, token),
    });
    this.client = client;
    this.paired.set(!!client.token);
    void client.connect();
  }

  private syncClient(client: PairingClient) {
    if (this.client !== client) return;
    if (client.state.members > this.members() && this.members() > 0) this.code.set('');
    this.paired.set(!!client.token);
    this.connected.set(client.connected);
    this.members.set(client.state.members);
    this.remotePlayback.set(client.state.playback);
    this.remoteViewport.set(client.state.viewport);
    if (!client.token) this.code.set('');
  }

  async act(action: 'create' | 'join' | 'code' | 'leave', code = '') {
    const client = this.client;
    if (!client || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      if (action === 'leave') {
        await client.leave();
        // Fresh client without a revoked token, ready for a future pairing.
        this.generation.update((value) => value + 1);
      } else {
        const result =
          action === 'code'
            ? await client.newCode()
            : await client.pair(action === 'join' ? code.replace(/\s/g, '') : undefined);
        this.code.set(result.code || '');
        this.expiresAt.set(result.expiresAt || 0);
      }
    } catch (error) {
      const status = (error as { status?: number }).status;
      this.error.set(
        status === 405
          ? 'pairServerOutdated'
          : status === 404
            ? 'pairInvalidCode'
            : status === 429
              ? 'pairRateLimit'
              : 'pairError',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
