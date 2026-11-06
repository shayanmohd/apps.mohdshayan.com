/*
 * Every word the game shows, in one table. Play itself is wordless (icons and numbers); words appear on
 * sheets, offers and messages. {name} placeholders are filled by t(key, vars).
 */
(function (root) {
  'use strict';
  var FC = root.FC || (root.FC = {});

  var S = {
    title: 'Fogcarver',
    tagline: 'Carve an island out of the fog.',
    day: 'Day {n}',
    island: 'Island {n}',
    page: 'Page {n}',
    playToday: 'Play today’s island',
    continueToday: 'Continue today’s island',
    viewToday: 'Today’s map',
    continueIsland: 'Continue',
    atlas: 'Atlas',
    archive: 'Archive',
    settings: 'Settings',
    home: 'Home',
    next: 'Next island',
    playAgain: 'Play again',
    resume: 'Resume',
    share: 'Share',
    close: 'Close',
    paused: 'Paused',
    play: 'Play',
    streak: '{n} day streak',
    streakNone: 'No streak yet',
    streakBest: 'Best {n}',
    par: 'Par {n}',
    gold: 'Gold {n}',
    score: 'Score',
    tilesLeft: 'Tiles left',
    sound: 'Sound',
    reduceMotion: 'Reduce motion',
    on: 'On',
    off: 'Off',
    removeAds: 'Remove ads and archive',
    removeAdsPrice: 'Remove ads and archive, {price}',
    removeAdsWhat: 'No ads between islands, every past day open, and every rewarded bonus without an ad.',
    restore: 'Restore purchases',
    notNow: 'Not now',
    privacyOptions: 'Privacy options',
    privacyPolicy: 'Privacy policy',
    tutorialAgain: 'Play the first island again',
    adFreeThanks: 'Ads are removed on this device.',

    watchRepair: 'Watch an ad: keep your {n} day streak',
    takeRepair: 'Keep your {n} day streak',
    watchArchive: 'Watch an ad: open this day',
    watchSecond: 'Watch an ad: play today again',
    takeSecond: 'Play today again',
    watchPreview: 'Watch an ad: preview a locked page',
    takePreview: 'Preview a locked page',
    archiveLeft: '{n} of 3 left today',
    archiveNoneLeft: 'Three days opened today. More tomorrow.',
    archiveWeb: 'Past islands open in the Android app.',
    aboutLink: 'About Fogcarver',
    lockedPage: 'Opens when page {n} is finished',
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    previewMark: 'Preview',
    secondTry: 'Second try',
    newBest: 'New best',

    rewardNo: 'No ad played, so nothing changed.',
    adNotReady: 'No ad is ready yet. Try again in a moment.',
    rewardSkipped: 'The ad was closed early, so nothing changed.',
    buy: {
      purchased: 'Ads removed and every past day opened. Thank you.',
      owned: 'This account already owns it. Ads are removed.',
      pending: 'Payment pending. It applies once Google Play confirms it.',
      cancelled: 'Purchase cancelled.',
      unavailable: 'Purchases need the Google Play Store, which is not available here.',
      notOffered: 'It is not on sale here right now.',
      offline: 'Google Play could not be reached. Try again when online.',
      failed: 'The purchase did not go through.'
    },
    restored: 'Purchase restored. Ads are removed.',
    restoreNone: 'No purchase found on this Google account.',
    restoreFailed: 'Google Play could not be asked. Try again later.',
    shared: {
      shared: 'Shared.',
      opened: 'Share sheet closed.',
      copied: 'Copied. Paste it anywhere.',
      cancelled: 'Share cancelled.',
      busy: 'A share is already open.',
      invalid: 'That share card was refused.',
      unavailable: 'Sharing is not available here.',
      failed: 'Sharing failed.'
    },
    shareLine: 'Fogcarver #{n}: {score}, par {par}',
    shareSecond: ' (second try)',

    aria: {
      pause: 'Pause',
      undo: 'Undo the last tile',
      sound: 'Sound',
      settings: 'Settings',
      board: 'Island map',
      seams: 'Matching edges',
      shores: 'Shores',
      closures: 'Closed forests and villages',
      river: 'River to the sea',
      stars: '{n} of 3 stars'
    },

    howTo: [
      'Lay each tile on the island. Tap the tile to turn it, drag it onto a fogged cell and lift to place it.',
      'Edges that meet the same land score a point, and coast or river edges that meet the sea score too.',
      'Close a forest or a village on every side for a bonus; three tiles or more plant a landmark.',
      'Run a river from the spring to the sea for a lighthouse. Seams around the ruin count double.',
      'Undo takes back the last tile for free. Beat par, and chase gold.'
    ]
  };

  function t(key, vars) {
    var parts = key.split('.');
    var v = S;
    for (var i = 0; i < parts.length && v != null; i++) v = v[parts[i]];
    if (typeof v !== 'string') return key;
    if (vars) {
      v = v.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? String(vars[k]) : m; });
    }
    return v;
  }

  FC.strings = S;
  FC.t = t;
  if (typeof module !== 'undefined' && module.exports) module.exports = { strings: S, t: t };
})(typeof window !== 'undefined' ? window : globalThis);
