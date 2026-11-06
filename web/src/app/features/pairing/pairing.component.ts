import { Component, ElementRef, inject, signal, viewChild, effect } from '@angular/core';
import { toDataURL } from 'qrcode';
import { PairingService } from '../../core/pairing/pairing.service';
import { LocalizationService } from '../../core/localization/localization.service';
import { IconComponent } from '../../shared/ui/icon.component';

@Component({
  selector: 'app-pairing',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './pairing.component.html',
  styleUrl: './pairing.component.css',
})
export class PairingComponent {
  readonly pairing = inject(PairingService);
  readonly i18n = inject(LocalizationService);
  readonly opened = signal(false);
  readonly qrImage = signal('');
  readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  constructor() {
    effect(() => {
      if (!this.opened() || !this.pairing.available() || this.pairing.busy()) return;
      if (this.pairing.members() > 1 || this.pairing.code()) return;
      if (this.pairing.error() && this.pairing.error() !== 'pairCodeExpired') return;
      void this.pairing.act(this.pairing.paired() ? 'code' : 'create');
    });
    effect((onCleanup) => {
      const payload = this.pairing.qrPayload();
      this.qrImage.set('');
      if (!payload) return;
      let current = true;
      onCleanup(() => {
        current = false;
      });
      void toDataURL(payload, { width: 280, margin: 4, errorCorrectionLevel: 'M' })
        .then((image) => {
          if (current) this.qrImage.set(image);
        })
        .catch(() => {
          if (current) this.pairing.error.set('pairError');
        });
    });
  }
  open() {
    this.pairing.error.set('');
    this.dialog().nativeElement.showModal();
    this.opened.set(true);
  }
  close() {
    this.opened.set(false);
    this.dialog().nativeElement.close();
  }
  async disconnect() {
    this.close();
    await this.pairing.act('leave');
  }
  retry() {
    this.pairing.error.set('');
  }
}
