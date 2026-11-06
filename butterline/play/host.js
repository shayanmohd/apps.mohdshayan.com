/*
 * The web side of the game bridge. The game runs in the same-origin iframe and talks to this page
 * through game-sdk.js and postMessage; this page answers with the same JSON as the Android shell.
 * Web differences: no interstitial, no rewarded ad (games hide or adapt those buttons), no Remove ads,
 * and banner() shows the page's own AdSense slots outside the play area.
 */
(function () {
  'use strict';
  var PROTOCOL = 1;
  var config = window.SHELL_WEB || { client: '', slots: {} };
  var frame = document.getElementById('game');
  var slots = Array.prototype.slice.call(document.querySelectorAll('.slot'));
  var bannerOn = false;

  // No below unit configured: reserve no strip under the game (host.css .no-below), before any banner.
  var belowSlot = document.querySelector('.slot-below');
  document.querySelector('.stage').classList.toggle('no-below', !(belowSlot && configured(belowSlot)));

  function configured(slot) {
    return !!(config.slots && config.slots[slot.getAttribute('data-slot')]);
  }

  function shown(slot) {
    return getComputedStyle(slot).display !== 'none';
  }

  // The reserved strip below the game, gap included, while the banner shows (0 on wide screens, where
  // the slot is beside the game). It is a fixed size, so it never changes while an ad loads.
  function bannerHeight() {
    var below = document.querySelector('.slot-below');
    if (!bannerOn || !below || !shown(below) || !configured(below)) return 0;
    return Math.round(below.getBoundingClientRect().height + parseFloat(getComputedStyle(below).marginTop || '0'));
  }

  function caps() {
    var anySlot = slots.some(configured);
    return {
      platform: 'web',
      protocol: PROTOCOL,
      testAds: false,
      adFree: false,
      adFreeKnown: true,
      interstitial: false,
      interstitialReady: false,
      rewarded: false,
      rewardedReady: false,
      banner: anySlot,
      bannerVisible: bannerOn && anySlot,
      bannerHeight: bannerHeight(),
      removeAds: false,
      removeAdsPrice: null,
      privacyOptions: false,
      haptics: typeof navigator.vibrate === 'function',
      insets: { top: 0, right: 0, bottom: 0, left: 0 }
    };
  }

  // An AdSense unit is created once per slot, the first time the game asks for a banner.
  function fill(slot) {
    if (!configured(slot) || slot.querySelector('ins')) return;
    var ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.setAttribute('data-ad-client', config.client);
    ins.setAttribute('data-ad-slot', config.slots[slot.getAttribute('data-slot')]);
    slot.appendChild(ins);
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      // AdSense blocked or not approved yet: the slot stays empty and the game carries on.
    }
  }

  function setBanner(show) {
    bannerOn = !!show;
    slots.forEach(function (slot) {
      if (bannerOn && configured(slot) && shown(slot)) fill(slot);
      slot.classList.toggle('on', bannerOn && configured(slot));
    });
    var visible = bannerOn && slots.some(function (s) { return configured(s) && shown(s); });
    return { visible: visible, height: bannerHeight(), reason: visible ? 'ok' : (bannerOn ? 'noSlot' : 'hidden') };
  }

  function answer(cmd, msg) {
    switch (cmd) {
      case 'hello':
      case 'ready':
        return caps();
      case 'interstitial':
        return { shown: false, reason: 'unavailable' };
      case 'rewarded':
        return { granted: false, reason: 'unavailable' };
      case 'banner':
        return setBanner(msg.show === true);
      case 'buyRemoveAds':
      case 'restore':
        return { ok: false, adFree: false, reason: 'notOffered' };
      case 'isAdFree':
        return { adFree: false, known: true };
      case 'privacyOptions':
        return { shown: false };
      case 'haptic':
        var ok = false;
        try { ok = typeof navigator.vibrate === 'function' && navigator.vibrate(10); } catch (e) { ok = false; }
        return { ok: !!ok };
      default:
        return null;
    }
  }

  function post(obj) {
    obj.v = PROTOCOL;
    frame.contentWindow.postMessage({ shellBridge: PROTOCOL, data: JSON.stringify(obj) }, location.origin);
  }

  window.addEventListener('message', function (e) {
    if (e.source !== frame.contentWindow || e.origin !== location.origin) return;
    if (!e.data || e.data.shellBridge !== PROTOCOL || typeof e.data.data !== 'string') return;
    var msg;
    try { msg = JSON.parse(e.data.data); } catch (err) { return; }
    if (!msg || typeof msg.cmd !== 'string') return;
    var result = answer(msg.cmd, msg);
    if (result && msg.id != null) post({ id: msg.id, result: result });
  });

  // A resize can move the slot from beside the game to below it.
  var lastHeight = -1;
  window.addEventListener('resize', function () {
    if (bannerOn) setBanner(true);
    var h = bannerHeight();
    if (h !== lastHeight) {
      lastHeight = h;
      post({ event: 'caps', caps: caps() });
    }
  });

  frame.addEventListener('load', function () {
    try { frame.contentWindow.focus(); } catch (e) { /* not ready */ }
  });
})();
