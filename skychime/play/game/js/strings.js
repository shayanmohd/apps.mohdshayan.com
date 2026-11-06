/*
 * Every word the game shows, in one table. Play itself uses icons and numbers; text appears on menus and
 * cards only. howTo and tips are also the source for the landing page's how-to-play section.
 */
(function (root) {
  'use strict';
  var Sky = root.Sky = root.Sky || {};

  var en = {
    title: 'Skychime',
    tapToBegin: 'Tap to begin',
    play: 'Play',
    playOn: 'Play {name}',
    daily: 'Daily show',
    dailyNumber: 'Daily #{n}',
    dailyPlay: 'Play today\'s show',
    dailyDone: 'Played today',
    dailyComeBack: 'A new show at midnight',
    dailySecondAd: 'Watch an ad: second try',
    dailySecondFree: 'Take a second try',
    dailyTry2: 'Second try',
    streak: '{n} day streak',
    streakNone: 'No streak yet',
    calendar: 'Last 4 weeks',
    nextShow: 'Next show',
    again: 'Play again',
    menu: 'Menu',
    share: 'Share',
    shareCopied: 'Copied to the clipboard',
    shareShared: 'Shared',
    shareFailed: 'Sharing is not available here',
    resume: 'Resume',
    pause: 'Pause',
    paused: 'Paused',
    endShow: 'End show',
    lightsOut: 'The city went dark',
    encoreAd: 'Watch an ad: relight the city',
    encoreFree: 'Relight the city',
    previewAd: 'Watch an ad: 3 shows here',
    previewFree: 'Take 3 shows here',
    previewLeft: '{n} preview shows left',
    rewardNotReady: 'No ad is ready right now.',
    rewardNotGranted: 'No reward this time. The ad did not finish.',
    locked: 'Locked',
    settings: 'Settings',
    sound: 'Sound',
    soundOn: 'Sound on',
    soundOff: 'Sound off',
    vibration: 'Vibration',
    reducedFlash: 'Reduced flashing',
    reducedMotion: 'Reduced motion',
    auto: 'Auto',
    on: 'On',
    off: 'Off',
    howToPlay: 'How to play',
    removeAds: 'Remove ads',
    removeAdsPrice: 'Remove ads, {price}',
    removeAdsDesc: 'Removes the ads between shows for good, gives rewarded bonuses without an ad and opens the river city skyline.',
    restore: 'Restore purchases',
    privacyOptions: 'Privacy options',
    privacyPolicy: 'Privacy policy',
    close: 'Close',
    notNow: 'Not now',
    adFreeThanks: 'Ads removed. Thank you.',
    buy: {
      purchased: 'Ads removed. The river city is open.',
      owned: 'Already yours on this account. Ads removed.',
      pending: 'Payment pending. Ads go once Google Play confirms it.',
      cancelled: 'Purchase cancelled.',
      unavailable: 'Purchases need the Google Play Store, which is not available here.',
      notOffered: 'Remove ads is not on sale here right now.',
      offline: 'Google Play could not be reached. Try again when online.',
      failed: 'The purchase did not go through.'
    },
    restored: 'Purchase restored. Ads removed.',
    restoredNone: 'No Remove ads purchase found on this account.',
    shells: { peony: 'Peony', willow: 'Willow', crossette: 'Crossette', ring: 'Ring' },
    skylines: { harbour: 'Harbour', desert: 'Desert fort', snow: 'Snowy town', newyear: 'New Year', river: 'River city' },
    newShell: 'New shell: {name}',
    newSkyline: 'New skyline: {name}',
    hints: {
      willow: 'Chain 7 from one spark',
      crossette: '3 Perfects in one show',
      ring: 'Clear a volley of 8 or more',
      desert: 'Finish a show with the city lit',
      snow: '6 full clears in one show',
      river: 'Comes with Remove ads',
      newyear: 'Opens 26 Dec to 6 Jan'
    },
    goals: {
      chain: 'Chain 15 from one spark',
      noDud: 'A show with no dud',
      perfectRun: '8 Perfects in a row'
    },
    goalDone: 'Goal reached: {name}',
    best: 'Best {n}',
    newBest: 'New best',
    perfect: 'Perfect',
    statChain: 'Longest chain',
    statPerfects: 'Perfects',
    statClears: 'Full clears',
    statDuds: 'Duds',
    postcard: 'Longest chain, {name}',
    noPostcard: 'Your longest chain will be kept here.',
    postcardOpen: 'Postcard of your longest chain',
    postcardCaption: 'Your longest chain here: {n}',
    skylinesTitle: 'Skylines',
    goalsTitle: 'Goals',
    howTo: 'Shells climb from the skyline in volleys, and each volley gives you one spark. Tap one shell to ' +
      'burst it. Its sparks light every shell they touch, and those burst in turn. Shells the chain misses ' +
      'fall dark and a district of the city goes out. Tap a shell at the top of its climb, on the beat, for ' +
      'a Perfect and a wider bloom. Clear a whole volley to relight a district and raise your multiplier. ' +
      'When the whole city is dark, the show is over.',
    tips: [
      'Start from the shell that peaks first: the later shells are still climbing into its sparks.',
      'Every shell peaks on a beat. Listen, or watch the skyline pulse.',
      'Willows hang and fall. Use them to carry a chain into the next volley.',
      'Crossettes fire four long jets. Line one up with a distant shell.',
      'Rings are hollow: they miss shells close to the centre but reach far.',
      'A missed shell shows where the nearest spark passed, so you can judge the gap next time.'
    ]
  };

  var tables = { en: en };
  var active = en;

  function lookup(key) {
    var parts = key.split('.');
    var v = active;
    for (var i = 0; i < parts.length && v != null; i++) v = v[parts[i]];
    if (v == null) {
      v = en;
      for (i = 0; i < parts.length && v != null; i++) v = v[parts[i]];
    }
    return v == null ? key : v;
  }

  /** t('playOn', {name: 'Harbour'}) */
  function t(key, vars) {
    var s = lookup(key);
    if (typeof s !== 'string' || !vars) return s;
    return s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? String(vars[k]) : m; });
  }

  function use(lang) {
    var code = String(lang || 'en').slice(0, 2).toLowerCase();
    active = tables[code] || en;
  }

  var api = { t: t, use: use, tables: tables };
  Sky.strings = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
