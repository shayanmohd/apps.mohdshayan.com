/*
 * game-sdk.js: the one API every web game uses, identical in the Android shell and on the web.
 * Version 1.1.0 (1.1.0 added Shell.share and caps.share; protocol 1 is unchanged). Copy this file into
 * the game folder unchanged; new-web-game.sh and verify-webgame.sh check that the copy matches
 * _shiptools/webgame/game-sdk.js.
 *
 *   Android  window.ShellNative, injected by the shell's WebViewCompat.addWebMessageListener
 *   Web      the host page at /<slug>/play/, reached with postMessage (same origin only)
 *   None     the game opened on its own: no ads, no purchases, saves still work
 *
 * Shell.share uses the shell's system share sheet on Android. On the web and on its own the game shares
 * from its own frame (Web Share, else the clipboard), because Web Share needs the tap's user activation.
 *
 * Every call returns a Promise that resolves (never rejects), so a game never needs a catch.
 */
(function (global) {
  'use strict';

  var PROTOCOL = 1;
  var VERSION = '1.1.0';
  var HELLO_TIMEOUT_MS = 1500;
  var REQUEST_TIMEOUT_MS = 15000;
  var NO_TIMEOUT = 0;

  // Shell.share limits, the same as the Android shell's (share/SharePayload.kt).
  var SHARE_TEXT_MAX = 1000; // String.length: an emoji counts 2
  var SHARE_URL_MAX = 2048;
  var SHARE_URL = /^https:\/\/[A-Za-z0-9.-]+(:[0-9]{1,5})?([\/?#][\x21-\x7e]*)?$/;
  var PNG_PREFIX = 'data:image/png;base64,';
  var PNG_MAX_BYTES = 1572864; // 1.5 MB decoded
  var PNG_MAX_CHARS = Math.ceil(PNG_MAX_BYTES / 3) * 4;
  var PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  var native = global.ShellNative && typeof global.ShellNative.postMessage === 'function' ? global.ShellNative : null;
  var parentWin = null;
  try {
    if (!native && global.parent && global.parent !== global && global.parent.location.origin === global.location.origin) {
      parentWin = global.parent;
    }
  } catch (e) {
    parentWin = null; // a foreign parent page: not our host
  }

  function defaults(platform) {
    return {
      platform: platform,
      protocol: PROTOCOL,
      testAds: false,
      adFree: false,
      adFreeKnown: true,
      interstitial: false,
      interstitialReady: false,
      rewarded: false,
      rewardedReady: false,
      banner: false,
      bannerVisible: false,
      bannerHeight: 0,
      removeAds: false,
      removeAdsPrice: null,
      privacyOptions: false,
      haptics: false,
      // In the app the shell says so (an older shell never does); elsewhere the game shares itself.
      share: platform !== 'android' && webCanShare(),
      insets: { top: 0, right: 0, bottom: 0, left: 0 }
    };
  }

  function webCanShare() {
    try {
      var nav = global.navigator;
      return typeof nav.share === 'function' ||
        !!(nav.clipboard && typeof nav.clipboard.writeText === 'function') ||
        (typeof document.queryCommandSupported === 'function' && document.queryCommandSupported('copy'));
    } catch (e) {
      return false;
    }
  }

  var caps = defaults(native ? 'android' : parentWin ? 'web' : 'none');
  var nextId = 1;
  var pending = {};
  var listeners = { pause: [], resume: [], back: [], change: [] };

  // ---- transport ----

  function send(msg) {
    msg.v = PROTOCOL;
    var text = JSON.stringify(msg);
    if (native) {
      native.postMessage(text);
      return true;
    }
    if (parentWin) {
      parentWin.postMessage({ shellBridge: PROTOCOL, data: text }, global.location.origin);
      return true;
    }
    return false;
  }

  function receive(text) {
    var msg;
    try {
      msg = typeof text === 'string' ? JSON.parse(text) : null;
    } catch (e) {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    if (msg.id != null && pending[msg.id]) {
      var p = pending[msg.id];
      delete pending[msg.id];
      if (p.timer) clearTimeout(p.timer);
      p.resolve(msg.result || {});
      return;
    }
    if (msg.event) onEvent(msg);
  }

  if (native) {
    if (typeof native.addEventListener === 'function') {
      native.addEventListener('message', function (e) { receive(e.data); });
    } else {
      native.onmessage = function (e) { receive(e.data); };
    }
  } else if (parentWin) {
    global.addEventListener('message', function (e) {
      if (e.source !== parentWin || e.origin !== global.location.origin) return;
      if (!e.data || e.data.shellBridge !== PROTOCOL) return;
      receive(e.data.data);
    });
  }

  /** One request. Without a host, or when the host does not answer in time, resolves with [fallback]. */
  function call(cmd, args, fallback, timeoutMs) {
    return new Promise(function (resolve) {
      var msg = args || {};
      msg.cmd = cmd;
      msg.id = nextId++;
      var entry = { resolve: resolve, timer: null };
      pending[msg.id] = entry;
      if (!send(msg)) {
        delete pending[msg.id];
        resolve(fallback);
        return;
      }
      var wait = timeoutMs == null ? REQUEST_TIMEOUT_MS : timeoutMs;
      if (wait > 0) {
        entry.timer = setTimeout(function () {
          if (pending[msg.id]) {
            delete pending[msg.id];
            resolve(fallback);
          }
        }, wait);
      }
    });
  }

  // ---- state and events ----

  function applyInsets(insets) {
    if (!insets) return;
    caps.insets = {
      top: insets.top | 0, right: insets.right | 0, bottom: insets.bottom | 0, left: insets.left | 0
    };
    var s = document.documentElement.style;
    s.setProperty('--shell-top', caps.insets.top + 'px');
    s.setProperty('--shell-right', caps.insets.right + 'px');
    s.setProperty('--shell-bottom', caps.insets.bottom + 'px');
    s.setProperty('--shell-left', caps.insets.left + 'px');
  }

  function mergeCaps(next) {
    if (!next || typeof next !== 'object') return;
    for (var k in next) {
      if (Object.prototype.hasOwnProperty.call(next, k) && k !== 'insets') caps[k] = next[k];
    }
    applyInsets(next.insets);
  }

  function emit(name, arg) {
    var list = listeners[name].slice();
    var handled = false;
    for (var i = 0; i < list.length; i++) {
      try {
        if (list[i](arg) === true) handled = true;
      } catch (e) {
        if (global.console) console.error('Shell ' + name + ' handler failed', e);
      }
    }
    return handled;
  }

  function onEvent(msg) {
    switch (msg.event) {
      case 'caps':
        mergeCaps(msg.caps);
        emit('change', snapshot());
        break;
      case 'insets':
        applyInsets(msg.insets);
        emit('change', snapshot());
        break;
      case 'pause':
        emit('pause');
        break;
      case 'resume':
        emit('resume');
        break;
      case 'back':
        var handled = emit('back');
        send({ cmd: 'backResult', backId: msg.backId, handled: handled });
        break;
    }
  }

  // The web and stand-alone pages get pause, resume and back from the browser itself. In the app the
  // shell sends them, so the browser's own signals are ignored there to avoid doubles.
  if (!native) {
    document.addEventListener('visibilitychange', function () {
      emit(document.visibilityState === 'hidden' ? 'pause' : 'resume');
    });
    global.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') emit('back');
    });
  }

  function snapshot() {
    var copy = {};
    for (var k in caps) if (Object.prototype.hasOwnProperty.call(caps, k)) copy[k] = caps[k];
    copy.insets = { top: caps.insets.top, right: caps.insets.right, bottom: caps.insets.bottom, left: caps.insets.left };
    return copy;
  }

  function subscribe(name) {
    return function (fn) {
      if (typeof fn !== 'function') return function () {};
      listeners[name].push(fn);
      return function () {
        var i = listeners[name].indexOf(fn);
        if (i >= 0) listeners[name].splice(i, 1);
      };
    };
  }

  // Ask the host for its capabilities as soon as the script loads, so insets arrive before the game draws.
  var hello = call('hello', {}, null, HELLO_TIMEOUT_MS).then(function (result) {
    if (result) {
      mergeCaps(result);
    } else if (caps.platform !== 'android') {
      caps = defaults('none'); // no host answered: a page opened on its own
    }
    applyInsets(caps.insets);
    return snapshot();
  });

  // ---- share ----

  /** The share fields after the checks every platform makes first, or null for bad input. */
  function shareInput(o) {
    if (!o || typeof o !== 'object') return null;
    var text = o.text == null ? '' : o.text;
    var url = o.url == null ? '' : o.url;
    var png = o.png == null ? '' : o.png;
    if (typeof text !== 'string' || typeof url !== 'string' || typeof png !== 'string') return null;
    if (!text.trim()) text = '';
    if (!text && !png) return null; // text is required unless there is a picture
    if (text.length > SHARE_TEXT_MAX) return null;
    if (url && (url.length > SHARE_URL_MAX || !SHARE_URL.test(url))) return null;
    if (png && (png.indexOf(PNG_PREFIX) !== 0 || png.length - PNG_PREFIX.length > PNG_MAX_CHARS)) return null;
    return { text: text, url: url, png: png };
  }

  /** The picture's bytes, or null unless it is padded base64 of a PNG (by its signature) of at most 1.5 MB. */
  function pngBytes(dataUrl) {
    var b64 = dataUrl.slice(PNG_PREFIX.length);
    if (b64.length % 4 !== 0 || !/^[A-Za-z0-9+\/]*={0,2}$/.test(b64)) return null;
    var bin;
    try {
      bin = global.atob(b64);
    } catch (e) {
      return null;
    }
    if (bin.length < PNG_SIGNATURE.length || bin.length > PNG_MAX_BYTES) return null;
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    for (var j = 0; j < PNG_SIGNATURE.length; j++) {
      if (bytes[j] !== PNG_SIGNATURE[j]) return null;
    }
    return bytes;
  }

  var webSharing = false;

  /**
   * Web and stand-alone: Web Share with the picture where the browser can share files, else Web Share
   * with text and url, else the clipboard. Runs synchronously up to navigator.share or the copy, so the
   * tap's user activation still holds.
   */
  function webShare(input) {
    var bytes = null;
    if (input.png) {
      bytes = pngBytes(input.png);
      if (!bytes) return Promise.resolve({ ok: false, reason: 'invalid' });
    }
    if (webSharing) return Promise.resolve({ ok: false, reason: 'busy' });
    var nav = global.navigator;
    var data = {};
    if (input.text) data.text = input.text;
    if (input.url) data.url = input.url;
    var payload = null;
    if (bytes && typeof nav.canShare === 'function' && typeof global.File === 'function') {
      try {
        var withFile = { files: [new global.File([bytes], 'share.png', { type: 'image/png' })] };
        if (data.text) withFile.text = data.text;
        if (data.url) withFile.url = data.url;
        if (nav.canShare(withFile)) payload = withFile;
      } catch (e) {
        payload = null;
      }
    }
    if (!payload && typeof nav.share === 'function' && (data.text || data.url)) payload = data;
    if (payload) {
      var sharing;
      try {
        sharing = Promise.resolve(nav.share(payload));
      } catch (e) {
        sharing = Promise.reject(e);
      }
      webSharing = true;
      return sharing.then(function () {
        webSharing = false;
        return { ok: true, reason: 'shared' };
      }, function (e) {
        webSharing = false;
        var name = e && e.name;
        return { ok: false, reason: name === 'AbortError' ? 'cancelled' : name === 'InvalidStateError' ? 'busy' : 'failed' };
      });
    }
    var text = [data.text, data.url].filter(Boolean).join('\n');
    if (!text || !webCanShare()) return Promise.resolve({ ok: false, reason: 'unavailable' });
    return copyText(text);
  }

  /** navigator.clipboard, else a hidden textarea and execCommand('copy') while the tap still counts. */
  function copyText(text) {
    var copied = { ok: true, reason: 'copied' };
    function legacy() {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.setAttribute('aria-hidden', 'true');
      area.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;' +
        '-webkit-user-select:text;user-select:text';
      var ok = false;
      try {
        document.body.appendChild(area);
        area.select();
        area.setSelectionRange(0, text.length);
        ok = document.execCommand('copy');
      } catch (e) {
        ok = false;
      }
      if (area.parentNode) area.parentNode.removeChild(area);
      return ok ? copied : { ok: false, reason: 'failed' };
    }
    var clip = global.navigator.clipboard;
    if (clip && typeof clip.writeText === 'function') {
      try {
        return clip.writeText(text).then(function () { return copied; }, legacy);
      } catch (e) { /* fall through to the textarea */ }
    }
    return Promise.resolve(legacy());
  }

  // ---- saves: versioned JSON in localStorage, with a memory fallback when storage is blocked ----

  var save = { prefix: 'game', version: 1, migrate: null };
  var memory = {};

  function storageGet(key) {
    try {
      return global.localStorage.getItem(key);
    } catch (e) {
      return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
    }
  }

  function storageSet(key, value) {
    try {
      global.localStorage.setItem(key, value);
      return true;
    } catch (e) {
      memory[key] = value;
      return false;
    }
  }

  function storageRemove(key) {
    try {
      global.localStorage.removeItem(key);
    } catch (e) { /* storage blocked */ }
    delete memory[key];
  }

  function saveKey(slot) {
    return save.prefix + ':' + (slot || 'main');
  }

  var Shell = {
    version: VERSION,
    protocol: PROTOCOL,

    /** The current capabilities (a copy). Read again after onChange fires. */
    get caps() {
      return snapshot();
    },

    get platform() {
      return caps.platform;
    },

    /** Call once the game can be played. Resolves with the capabilities. */
    ready: function () {
      return hello.then(function () {
        return call('ready', {}, null).then(function (result) {
          if (result) mergeCaps(result);
          return snapshot();
        });
      });
    },

    /**
     * An interstitial at a natural break (between levels, after a game over screen), never during play,
     * on launch or on exit. The shell's cap may refuse it: shown false, with a reason. Pause the game
     * before calling and continue when the Promise resolves either way.
     */
    interstitial: function (placement) {
      return hello.then(function () {
        if (caps.platform !== 'android') return { shown: false, reason: 'unavailable' };
        return call('interstitial', { placement: String(placement || 'default') }, { shown: false, reason: 'noAnswer' }, NO_TIMEOUT);
      });
    },

    /**
     * A rewarded ad the player asked for, from a button that states the reward first. Grant the reward
     * only when granted is true. An ad free player gets granted true at once, without an ad.
     */
    rewarded: function (placement) {
      return hello.then(function () {
        if (caps.platform !== 'android') return { granted: false, reason: 'unavailable' };
        return call('rewarded', { placement: String(placement || 'default') }, { granted: false, reason: 'noAnswer' }, NO_TIMEOUT);
      });
    },

    /** Show or hide the banner outside the play area. Resolves with visible and its height in CSS px. */
    banner: function (show) {
      return hello.then(function () {
        return call('banner', { show: !!show }, { visible: false, height: 0, reason: 'unavailable' }).then(function (r) {
          caps.bannerVisible = !!r.visible;
          caps.bannerHeight = r.height | 0;
          return r;
        });
      });
    },

    isAdFree: function () {
      return hello.then(function () {
        return call('isAdFree', {}, { adFree: caps.adFree, known: true }).then(function (r) {
          return !!r.adFree;
        });
      });
    },

    /** The one-time Remove ads purchase (Android only). Resolves with ok, adFree and a reason. */
    buyRemoveAds: function () {
      return hello.then(function () {
        if (caps.platform !== 'android') return { ok: false, adFree: false, reason: 'notOffered' };
        return call('buyRemoveAds', {}, { ok: false, adFree: caps.adFree, reason: 'noAnswer' }, NO_TIMEOUT);
      });
    },

    /** Ask Google Play again whether this account owns Remove ads. */
    restore: function () {
      return hello.then(function () {
        if (caps.platform !== 'android') return { ok: false, adFree: false, reason: 'notOffered' };
        return call('restore', {}, { ok: false, adFree: caps.adFree, reason: 'noAnswer' }, 40000);
      });
    },

    /** The consent choices form. Offer an entry for it only while caps.privacyOptions is true. */
    privacyOptions: function () {
      return hello.then(function () {
        if (!caps.privacyOptions) return { shown: false };
        return call('privacyOptions', {}, { shown: false }, NO_TIMEOUT);
      });
    },

    /**
     * Share a card the player chose to share: { text, url, png }. text is required unless png is given
     * (at most 1000 characters); url is https only; png is canvas.toDataURL('image/png'), at most 1.5 MB.
     * Call it straight from the tap handler, before any await: Web Share needs the tap's user activation.
     * Resolves { ok, reason }: shared, opened (Android's sheet closed; it cannot tell more), copied (the
     * text went to the clipboard: say so), cancelled, invalid, busy, unavailable or failed. Show the
     * button only while caps.share is true; never reward sharing.
     */
    share: function (options) {
      var input = shareInput(options);
      if (!input) return Promise.resolve({ ok: false, reason: 'invalid' });
      if (!native) return webShare(input);
      return hello.then(function () {
        if (!caps.share) return { ok: false, reason: 'unavailable' }; // a shell from before Shell.share
        var args = { text: input.text || undefined, url: input.url || undefined, png: input.png || undefined };
        return call('share', args, { ok: false, reason: 'failed' }, NO_TIMEOUT);
      });
    },

    /** tap, light, medium, heavy, success or error. Follows the system's touch feedback setting. */
    haptic: function (style) {
      style = String(style || 'tap');
      if (caps.platform === 'android') return call('haptic', { style: style }, { ok: false }, 2000);
      var ms = { tap: 8, light: 6, medium: 12, heavy: 25, success: 15, error: 30 }[style] || 8;
      var ok = false;
      try {
        ok = typeof navigator.vibrate === 'function' && navigator.vibrate(ms);
      } catch (e) { ok = false; }
      return Promise.resolve({ ok: !!ok });
    },

    onPause: subscribe('pause'),
    onResume: subscribe('resume'),
    /** Return true from the handler when the game used the back press (closed a menu, paused). */
    onBack: subscribe('back'),
    /** Capabilities changed: consent settled, an ad loaded, Remove ads bought, banner or insets moved. */
    onChange: subscribe('change'),

    /**
     * Saves. configureSave({ prefix: 'mygame', version: 2, migrate: function (data, fromVersion) {...} })
     * once at start; migrate turns an older save into the current shape and is called by load.
     */
    configureSave: function (options) {
      options = options || {};
      if (options.prefix) save.prefix = String(options.prefix);
      if (options.version) save.version = options.version | 0;
      if (typeof options.migrate === 'function') save.migrate = options.migrate;
    },

    /** Stores data (anything JSON can hold). Returns false when storage is blocked and only memory holds it. */
    save: function (slot, data) {
      return storageSet(saveKey(slot), JSON.stringify({ v: save.version, at: Date.now(), data: data }));
    },

    /** The saved data, migrated to the current version, or [fallback] when there is none or it is broken. */
    load: function (slot, fallback) {
      var raw = storageGet(saveKey(slot));
      if (raw == null) return fallback;
      var record;
      try {
        record = JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
      if (!record || typeof record !== 'object' || !('data' in record)) return fallback;
      var from = record.v | 0;
      if (from < save.version && save.migrate) {
        try {
          var migrated = save.migrate(record.data, from);
          Shell.save(slot, migrated);
          return migrated;
        } catch (e) {
          return fallback;
        }
      }
      return record.data;
    },

    /** When the slot was last saved (ms since 1970), or null. */
    savedAt: function (slot) {
      try {
        var record = JSON.parse(storageGet(saveKey(slot)));
        return record && record.at ? record.at : null;
      } catch (e) {
        return null;
      }
    },

    clearSave: function (slot) {
      storageRemove(saveKey(slot));
    }
  };

  global.Shell = Shell;
})(window);
