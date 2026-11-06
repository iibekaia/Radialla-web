import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(
  new URL('../../web/src/app/features/player/picture-in-picture-controller.ts', import.meta.url),
  'utf8',
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
const { PictureInPictureController } = await import(
  'data:text/javascript;base64,' + Buffer.from(outputText).toString('base64')
);

class Element {
  children = [];
  parent = null;
  classList = { add() {} };
  append(child) {
    child.parent?.children.splice(child.parent.children.indexOf(child), 1);
    this.children.push(child);
    child.parent = this;
  }
  before(node) {
    node.parent = this.parent;
    this.parent.children.splice(this.parent.children.indexOf(this), 0, node);
  }
  replaceWith(node) {
    node.parent?.children.splice(node.parent.children.indexOf(node), 1);
    const parent = this.parent;
    parent.children.splice(parent.children.indexOf(this), 1, node);
    node.parent = parent;
    this.parent = null;
  }
  cloneNode() {
    return new Element();
  }
}

class FakeDocument extends EventTarget {
  visibilityState = 'visible';
  baseURI = 'https://radialla.ge/';
  head = new Element();
  body = new Element();
  documentElement = {};
  createElement() {
    return new Element();
  }
  createComment() {
    return new Element();
  }
  querySelectorAll() {
    return this.head.children;
  }
}

function fixture() {
  const doc = new FakeDocument();
  doc.head.append(new Element());
  const popup = new EventTarget();
  popup.document = new FakeDocument();
  popup.close = () => {
    popup.closed = true;
    popup.dispatchEvent(new Event('pagehide'));
  };
  const handlers = new Map(),
    events = [];
  const parent = new Element(),
    player = new Element();
  parent.append(player);
  let playing = true,
    requests = 0,
    resolve;
  const browser = {
    document: doc,
    navigator: {
      mediaSession: { setActionHandler: (action, handler) => handlers.set(action, handler) },
    },
    focus: () => events.push('focus'),
    documentPictureInPicture: {
      requestWindow: () => {
        requests++;
        return new Promise((r) => {
          resolve = r;
        });
      },
    },
  };
  const controller = new PictureInPictureController(
    player,
    {
      playing: () => playing,
      changed: (value) => events.push(value),
    },
    browser,
  );
  return {
    controller,
    browser,
    doc,
    popup,
    parent,
    player,
    handlers,
    events,
    requests: () => requests,
    resolve: () => resolve(popup),
    pause: () => {
      playing = false;
    },
  };
}

test('PiP moves the same player, copies styles and base URL, and restores it on return or window close', async () => {
  const f = fixture();
  f.doc.visibilityState = 'hidden';
  f.controller.update('ka', 'Radialla test');
  const pending = f.controller.open();
  void f.controller.open();
  assert.equal(f.requests(), 1);
  f.resolve();
  await pending;
  assert.equal(f.player.parent, f.popup.document.body);
  assert.equal(f.popup.document.documentElement.lang, 'ka');
  assert.equal(f.popup.document.title, 'Radialla test');
  assert.equal(f.popup.document.head.children[0].href, 'https://radialla.ge/');
  assert.equal(f.popup.document.head.children.length, 2);
  f.controller.update('en', 'New station');
  assert.equal(f.popup.document.title, 'New station');
  f.controller.returnToTab();
  assert.equal(f.player.parent, f.parent);
  assert.deepEqual(f.events, [true, 'focus', false]);
  const second = f.controller.open();
  f.resolve();
  await second;
  f.popup.close();
  assert.equal(f.player.parent, f.parent);
  assert.equal(f.events.at(-1), false);
  f.controller.destroy();
  assert.equal(f.handlers.get('enterpictureinpicture'), null);
});

test('browser-triggered automatic PiP requires playback and closes when the tab becomes visible', async () => {
  const f = fixture();
  f.handlers.get('enterpictureinpicture')();
  assert.equal(f.requests(), 0);
  f.doc.visibilityState = 'hidden';
  f.pause();
  f.handlers.get('enterpictureinpicture')();
  assert.equal(f.requests(), 0);
  // A fresh playing session accepts the browser action.
  const playing = fixture();
  playing.doc.visibilityState = 'hidden';
  playing.handlers.get('enterpictureinpicture')();
  playing.resolve();
  await Promise.resolve();
  assert.equal(playing.player.parent, playing.popup.document.body);
  playing.doc.visibilityState = 'visible';
  playing.doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(playing.player.parent, playing.parent);
  assert.equal(playing.popup.closed, true);
  f.controller.destroy();
  playing.controller.destroy();
});

test('denied or unsupported PiP does not move the player or report a false open state', async () => {
  const f = fixture();
  f.doc.visibilityState = 'hidden';
  f.browser.documentPictureInPicture.requestWindow = async () => {
    throw Error('Denied');
  };
  await f.controller.open();
  assert.equal(f.player.parent, f.parent);
  assert.deepEqual(f.events, []);
  f.controller.destroy();
  delete f.browser.documentPictureInPicture;
  const unsupported = new PictureInPictureController(
    f.player,
    {
      changed() {},
      playing() {
        return true;
      },
    },
    f.browser,
  );
  assert.equal(unsupported.supported, false);
  await unsupported.open();
  assert.equal(f.player.parent, f.parent);
  unsupported.destroy();
});

test('late PiP requests after destruction, a return to the tab or a pause close without moving the player', async () => {
  for (const reason of ['destroyed', 'visible', 'paused']) {
    const f = fixture();
    f.doc.visibilityState = 'hidden';
    const pending = f.controller.open();
    if (reason === 'destroyed') f.controller.destroy();
    else if (reason === 'visible') f.doc.visibilityState = 'visible';
    else f.pause();
    f.resolve();
    await pending;
    assert.equal(f.player.parent, f.parent);
    assert.equal(f.popup.closed, true);
    f.controller.destroy();
  }
});
