/*
 * Every word the game shows, in one table. The play screen uses icons and numbers; words appear on
 * sheets, rewarded buttons and messages. howTo and tips are written for reuse on the landing page.
 * {name} placeholders are filled by Sherd.t(key, values).
 */
(function (root) {
  'use strict';
  var STRINGS = {
    en: {
      appName: 'Sherd',
      tagline: 'Find the hidden shard in six tries.',
      daily: 'Daily dig',
      dailyNumber: 'No. {n}',
      expedition: 'Expedition',
      museum: 'Museum',
      archive: 'Archive',
      settings: 'Settings',
      begin: 'Begin',
      dig: 'Dig',
      undo: 'Undo',
      clear: 'Clear',
      legend: 'Marks',
      back: 'Back',
      pause: 'Pause',
      close: 'Close',

      dailyOpen: 'Today\'s dig is waiting',
      dailyInProgress: '{n} of {max} tries used',
      dailySolved: 'Found in {n}',
      dailyLost: 'Not found today',
      nextDaily: 'Next dig in {time}',
      timeHM: '{h} h {m} min',
      timeM: '{m} min',
      streak: '{n} day streak',
      streakBest: 'Best {n}',
      streakMended: 'Streak kept with a repair',

      siteName1: 'Terrace',
      siteName2: 'Trench',
      siteName3: 'Bedrock',
      siteName4: 'Deep site',
      siteLabel: 'Site {n}',
      digLabel: 'Dig {n}',
      digs: 'Digs {a} to {b}',
      digsFrom: 'Digs from {a}',
      par: 'Par {n}',
      startDig: 'Dig {n}',

      found: 'Found in {n}',
      notFound: 'Not found',
      fragmentsGained: '+{n} fragments',
      fragmentGained: '+1 fragment',
      doubled: 'Doubled',
      glazeGained: '+1 glaze piece',
      next: 'Next',
      retry: 'Retry',
      map: 'Map',
      home: 'Home',
      share: 'Share',
      copied: 'Copied to the clipboard',
      shareFailed: 'Sharing did not work here.',
      narrowing: 'Possible places for the shard',

      repairAd: 'Watch an ad: keep your {n} day streak',
      repairFree: 'Keep your {n} day streak',
      repairNote: 'You missed yesterday.',
      repairDone: 'Streak kept',
      archiveSub: '{n} past digs',
      archiveEmpty: 'Past digs appear here',
      archiveAd: 'Watch an ad: open this day',
      archiveLeft: '{n} of 3 openings left today',
      archiveApp: 'Past digs you have not played open in the Sherd app for Android.',
      archiveNone: 'No more ad openings today.',
      archiveOwned: 'Every past dig is open to you.',
      surveyAd: 'Watch an ad: survey a 3×3 block',
      surveyFree: 'Survey a 3×3 block',
      surveyPlace: 'Move the frame, then survey.',
      surveyGo: 'Survey here',
      surveyGoAd: 'Watch an ad: survey here',
      doubleAd: 'Watch an ad: double fragments for 3 digs',
      doubleFree: 'Double fragments for 3 digs',
      doubleActive: 'Double fragments: {n} digs left',
      doubleDone: 'Fragments doubled for 3 digs',
      noAd: 'No ad is ready right now. Try again in a moment.',
      noReward: 'The ad closed early, so there is no reward this time.',

      removeAds: 'Remove ads and archive',
      removeAdsBody: 'Removes the ads between digs for good, opens every past daily and gives rewarded bonuses without an ad.',
      buyFor: 'Buy for {price}',
      buy: 'Buy',
      restore: 'Restore purchases',
      notNow: 'Not now',
      owned: 'Ads removed and the archive is open. Thank you.',
      buyPurchased: 'Ads removed and the archive is open. Thank you.',
      buyOwned: 'This account already owns it. Ads are off.',
      buyPending: 'Payment pending. It takes effect once Google Play confirms it.',
      buyCancelled: 'Purchase cancelled.',
      buyUnavailable: 'Purchases need the Google Play Store, which is not available here.',
      buyNotOffered: 'This purchase is not on sale here right now.',
      buyOffline: 'Google Play could not be reached. Try again when online.',
      buyFailed: 'The purchase did not go through.',
      restoreNone: 'No purchase found on this account.',
      restoreOk: 'Purchase restored. Ads are off.',

      sound: 'Sound',
      haptics: 'Vibration',
      reduceMotion: 'Reduce motion',
      howToPlay: 'How to play',
      privacyOptions: 'Privacy options',
      privacyPolicy: 'Privacy policy',
      version: 'Version {v}',
      on: 'On',
      off: 'Off',

      paused: 'Paused',
      resume: 'Resume',
      leave: 'Leave dig',
      leaveNote: 'Your tries so far are kept.',

      restored: 'Restored',
      glazed: 'Glazed',
      fragmentsOf: '{a} of {b} fragments',
      glazeStock: '{n} glaze pieces waiting',
      glazeStock1: '1 glaze piece waiting',
      vesselRestored: 'Vessel restored',
      wingDone: 'Every vessel restored. New wings arrive in updates.',
      culture0: 'Velan',
      culture1: 'Oru',
      culture2: 'Tesh',

      howTo: [
        'A shard of five connected cells is buried somewhere in a 6 by 6 dig. It can be turned or flipped any way.',
        'Each try, paint any five connected cells and press Dig. Every cell you probed shows a mark.',
        'A glazed tile means the cell is part of the shard. A hatched rim means the shard is not there but touches that cell on a side. Plain soil means neither.',
        'Soil clears a plus shape: that cell and its four neighbours cannot hold the shard.',
        'Probe the shard exactly to dig it up. The daily dig gives you six tries, and everyone gets the same one.'
      ],
      tips: [
        'Probe a long line first: it touches many cells and tells you which rows to forget.',
        'A rim with soil on every other side points straight at the shard.',
        'Every probe can be anything, but a probe that could still be the shard is the one that can win.',
        'In the Expedition, a 3 by 3 survey is worth most early, before any glaze shows.',
        'Bedrock never hides the shard, so it rules out every shape that would cross it.'
      ]
    }
  };

  var lang = 'en';

  function t(key, values) {
    var table = STRINGS[lang] || STRINGS.en;
    var s = table[key];
    if (s == null) s = STRINGS.en[key];
    if (s == null) return key;
    if (Array.isArray(s)) return s;
    if (values) {
      s = s.replace(/\{(\w+)\}/g, function (m, k) { return values[k] != null ? String(values[k]) : m; });
    }
    return s;
  }

  var api = { STRINGS: STRINGS, t: t };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.Sherd = root.Sherd || {};
    root.Sherd.strings = api;
    root.Sherd.t = t;
  }
})(this);
