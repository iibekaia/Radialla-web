import { Component, computed, effect, inject, signal } from '@angular/core';
import { PairingService } from '../../core/pairing/pairing.service';
import { LocalizationService } from '../../core/localization/localization.service';
import { IconComponent } from '../../shared/ui/icon.component';

@Component({
  selector: 'app-pairing-notification',
  standalone: true,
  imports: [IconComponent],
  template: `
    <div class="notification" role="status" aria-live="polite" aria-atomic="true">
      @if (visible()) {
        <div class="message">
          <app-icon name="link" />
          <span>{{ i18n.t('pairCommandReceived') }}</span>
        </div>
      }
    </div>
  `,
  styleUrl: './pairing-notification.component.css',
})
export class PairingNotificationComponent {
  readonly i18n = inject(LocalizationService);
  private readonly pairing = inject(PairingService);
  private readonly revision = computed(() =>
    Math.max(
      this.pairing.remotePlayback()?.revision ?? -1,
      this.pairing.remoteViewport()?.revision ?? -1,
    ),
  );
  readonly visible = signal(false);

  constructor() {
    let previous: number | undefined;
    effect((onCleanup) => {
      const revision = this.revision();
      // Establish a baseline on startup; restored state is not a new command.
      const received = previous !== undefined && revision > previous;
      previous = revision;
      this.visible.set(received);
      if (!received) return;
      const timer = setTimeout(() => this.visible.set(false), 3000);
      onCleanup(() => clearTimeout(timer));
    });
  }
}
