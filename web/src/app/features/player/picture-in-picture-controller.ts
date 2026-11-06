interface PictureInPictureBrowser {
  document: Document;
  navigator: Pick<Navigator, 'mediaSession'>;
  focus(): void;
  documentPictureInPicture?: {
    requestWindow(options: {
      width: number;
      height: number;
      disallowReturnToOpener: boolean;
    }): Promise<Window>;
  };
}

interface PictureInPictureCallbacks {
  playing(): boolean;
  changed(open: boolean): void;
}

/** Moves the existing Angular player; audio stays in its original session. */
export class PictureInPictureController {
  readonly supported: boolean;
  private popup?: Window;
  private placeholder?: Comment;
  private pending = false;
  private destroyed = false;
  private registered = false;
  private language = '';
  private title = '';
  private readonly visibilityChanged = () => {
    if (this.popup && this.browser.document.visibilityState === 'visible') this.close();
  };

  constructor(
    private readonly player: HTMLElement,
    private readonly callbacks: PictureInPictureCallbacks,
    private readonly browser: PictureInPictureBrowser = window,
  ) {
    this.supported = !!browser.documentPictureInPicture;
    if (!this.supported) return;
    browser.document.addEventListener('visibilitychange', this.visibilityChanged);
    try {
      browser.navigator.mediaSession?.setActionHandler(
        'enterpictureinpicture' as MediaSessionAction,
        () => {
          void this.open();
        },
      );
      this.registered = !!browser.navigator.mediaSession;
    } catch {
      // Unsupported browsers keep the regular in-tab player.
    }
  }

  update(language: string, title: string) {
    this.language = language;
    this.title = title;
    if (this.popup) {
      this.popup.document.documentElement.lang = language;
      this.popup.document.title = title;
    }
  }

  private canOpen() {
    return (
      !this.destroyed &&
      this.callbacks.playing() &&
      this.browser.document.visibilityState === 'hidden'
    );
  }

  async open() {
    const api = this.browser.documentPictureInPicture;
    if (!api || !this.canOpen() || this.pending || this.popup) return;
    this.pending = true;
    let popup: Window | undefined;
    try {
      popup = await api.requestWindow({
        width: 440,
        height: 240,
        disallowReturnToOpener: false,
      });
      if (!this.canOpen()) {
        popup.close();
        return;
      }
      this.popup = popup;
      const doc = popup.document;
      const base = doc.createElement('base');
      base.href = this.browser.document.baseURI;
      doc.head.append(base);
      // Angular embeds component CSS in style elements; preserve its scoped selectors.
      for (const style of Array.from(
        this.browser.document.querySelectorAll('style, link[rel="stylesheet"]'),
      ))
        doc.head.append(style.cloneNode(true));
      doc.body.classList.add('floating-player-document');
      this.update(this.language, this.title);
      this.placeholder = this.browser.document.createComment('Radialla player');
      this.player.before(this.placeholder);
      popup.addEventListener(
        'pagehide',
        () => {
          if (this.popup === popup) this.restore();
        },
        { once: true },
      );
      doc.body.append(this.player);
      this.callbacks.changed(true);
    } catch {
      popup?.close();
      this.restore();
    } finally {
      this.pending = false;
    }
  }

  private restore() {
    if (!this.popup && !this.placeholder) return;
    this.placeholder?.replaceWith(this.player);
    this.placeholder = undefined;
    this.popup = undefined;
    this.callbacks.changed(false);
  }

  close() {
    const popup = this.popup;
    this.restore();
    popup?.close();
  }

  returnToTab() {
    try {
      this.browser.focus();
    } finally {
      this.close();
    }
  }

  destroy() {
    this.destroyed = true;
    this.close();
    this.browser.document.removeEventListener('visibilitychange', this.visibilityChanged);
    if (this.registered) {
      try {
        this.browser.navigator.mediaSession.setActionHandler(
          'enterpictureinpicture' as MediaSessionAction,
          null,
        );
      } catch {}
    }
  }
}
