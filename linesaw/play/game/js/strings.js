/*
 * Every word the game shows, in one table per language. In play the game uses icons and numbers only;
 * words appear on menus, cards, hints and settings. The language follows the device (navigator.language)
 * and falls back to English for any missing word. howTo is written so the landing page can reuse it.
 * No em or en dashes. A cut is always line against line: no words about string coatings.
 */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.LS = root.LS || {}).strings = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var en = {
    title: 'Linesaw',
    tagline: 'Rooftop kite fighting at dusk',
    hold: 'Hold',
    letGo: 'Let go',
    crossLine: 'Fly across its line',
    glowHint: 'Let go when your line turns red',
    hintSteer: 'Let go to turn. Hold to fly.',
    daily: 'Daily',
    dailyN: 'Daily {n}',
    friendSky: 'Daily {n}',
    friendNote: 'From a link. Not scored.',
    sky: 'Sky {n}',
    play: 'Play',
    solo: 'Solo',
    twoPlayers: '2 players',
    twoPlayersNote: 'One phone. Left half against right half.',
    keysSolo: 'Hold Space',
    keysTwo: 'Left: A    Right: L',
    nextSky: 'Next sky',
    retry: 'Retry',
    menu: 'Menu',
    nextMatch: 'Next match',
    resume: 'Resume',
    leave: 'Leave',
    leaveDaily: 'Leaving ends today\'s Daily with what it has.',
    paused: 'Paused',
    endSky: 'End sky',
    outOfKites: 'Out of kites',
    spareAd: 'Watch an ad: +1 kite',
    spareFree: 'Take +1 kite',
    secondAd: 'Watch an ad: play today\'s sky again',
    secondFree: 'Play today\'s sky again',
    rewardSkipped: 'The ad was closed early, so no bonus this time.',
    rewardNotReady: 'No ad is ready right now. Try again in a moment.',
    sunset: 'Sunset',
    leftEarly: 'Left early',
    dailyDone: 'Today\'s Daily is done. A new sky comes at midnight.',
    playedToday: 'Played',
    secondMark: 'Second sky',
    cuts: 'Cuts',
    score: 'Score',
    kitesLost: 'Kites lost',
    longestDuel: 'Longest duel',
    seconds: '{n} s',
    newRecord: 'New record',
    streak: 'Streak',
    leftWins: 'Left rooftop wins',
    rightWins: 'Right rooftop wins',
    settings: 'Settings',
    records: 'Records',
    howToPlay: 'How to play',
    close: 'Close',
    sound: 'Sound',
    vibration: 'Vibration',
    on: 'On',
    off: 'Off',
    privacyOptions: 'Privacy options',
    privacyPolicy: 'Privacy policy',
    removeAds: 'Remove ads',
    removeAdsPrice: 'Remove ads, {price}',
    removeAdsLine: 'One purchase removes the ads between skies and matches for good, solo and with a friend. Bonuses are given without an ad.',
    restore: 'Restore purchases',
    adFreeThanks: 'Ads removed. Thank you.',
    purchase: {
      purchased: 'Ads removed. Thank you.',
      owned: 'Ads were already removed on this account.',
      pending: 'Payment pending. Ads go once Google Play confirms it.',
      cancelled: 'Purchase cancelled.',
      unavailable: 'Purchases need the Google Play Store, which is not available here.',
      notOffered: 'Remove ads is not on sale here right now.',
      offline: 'Google Play could not be reached. Try again when you are online.',
      failed: 'The purchase did not go through.'
    },
    restored: {
      yes: 'Remove ads restored.',
      no: 'No Remove ads purchase was found on this Google account.',
      failed: 'Google Play could not be reached. Try again later.'
    },
    share: 'Share',
    shareCopied: 'Copied. Paste it anywhere.',
    shareFailed: 'Could not share right now.',
    mostCuts: 'Most cuts in a sky',
    bestScore: 'Best score',
    skiesFlown: 'Skies flown',
    matchesPlayed: 'Matches played',
    kites: 'Kites',
    patterns: ['Moon', 'Split', 'Band'],
    patternHow: ['From the start', 'Win a duel from below', 'Five cuts in one sky'],
    newKite: 'New kite: {name}',
    festival: { uttarayan: 'Uttarayan sky' },
    licences: 'Font: Barlow (SIL Open Font License). Icons: Phosphor (MIT). Every sound is made in the game.',
    howTo: [
      'Hold to pull your line: the kite darts the way its nose points. Let go to give slack: the kite slows, drifts with the wind and its nose turns. Steering is timing: let go, wait for the nose, then hold.',
      'Fly across a rival\'s line and the two lines catch. Both lines wear where they cross. Pulling saws fastest, but a line pulled too long heats up and wears itself, so pull in short bursts and let go when your line turns red.',
      'A sky lasts until sunset, 75 seconds, with three kites. Each cut scores more when it follows another cut without losing a kite in between.',
      'In 2 players, each person holds one half of the screen. First to three cuts wins.'
    ],
    a11y: {
      game: 'Kite fight. Hold to pull the line, let go to give slack.',
      pause: 'Pause',
      settings: 'Settings',
      sound: 'Sound on or off',
      records: 'Records and kites',
      close: 'Close',
      kitesLeft: 'Kites left'
    }
  };

  var tables = { en: en };

  function pick(lang) {
    var code = String(lang || 'en').toLowerCase();
    return tables[code] || tables[code.split('-')[0]] || en;
  }

  function lang() {
    try {
      return (typeof navigator !== 'undefined' && navigator.language) || 'en';
    } catch (e) {
      return 'en';
    }
  }

  // A table with English underneath, so a missing word never shows as undefined.
  function withFallback(t) {
    if (t === en) return en;
    var out = {};
    for (var k in en) if (Object.prototype.hasOwnProperty.call(en, k)) out[k] = Object.prototype.hasOwnProperty.call(t, k) ? t[k] : en[k];
    return out;
  }

  function format(s, vars) {
    return String(s).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? vars[k] : m; });
  }

  return { t: withFallback(pick(lang())), en: en, tables: tables, format: format, pick: pick };
});
