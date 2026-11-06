/*
 * Every word the game shows, in one table. In play the game uses only icons and numbers; words appear on
 * menus, cards and settings. howTo and tips are written so the landing page can reuse them as they are.
 * No em or en dashes.
 */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.BL = root.BL || {}).strings = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var en = {
    title: 'Butterline',
    tagline: 'Land it soft. Watch the air.',
    daily: 'Daily',
    circuits: 'Circuits',
    fly: 'Fly',
    flyAgain: 'Fly again',
    next: 'Next',
    menu: 'Menu',
    resume: 'Resume',
    paused: 'Paused',
    endRun: 'End run',
    leaveApproach: 'Leave approach',
    leaveNote: 'Leaving counts this approach as missed.',
    dailyLeftMissed: 'The Daily approach you left counts as missed.',
    settings: 'Settings',
    logbook: 'Logbook',
    howToPlay: 'How to play',
    close: 'Close',
    sound: 'Sound',
    vibration: 'Vibration',
    on: 'On',
    off: 'Off',
    privacyOptions: 'Privacy options',
    privacyNotReady: 'Privacy options could not open right now. Try again in a moment.',
    privacyPolicy: 'Privacy policy',
    removeAds: 'Remove ads',
    removeAdsPrice: 'Remove ads, {price}',
    removeAdsLine: 'One purchase removes the ads between landings for good. Bonuses are given without an ad.',
    restore: 'Restore purchases',
    adFreeThanks: 'Ads removed. Thank you for flying.',
    licences: 'Font: Sofia Sans Condensed (SIL Open Font License). Icons: Phosphor (MIT).',

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

    keepRunAd: 'Watch an ad: keep the run',
    keepRunFree: 'Keep the run',
    goAroundAd: 'Watch an ad: fly this approach again',
    goAroundFree: 'Fly this approach again',
    secondAd: 'Watch an ad: fly today in another aircraft',
    secondFree: 'Fly today in another aircraft',
    rewardSkipped: 'The ad was closed early, so no bonus this time.',
    rewardNotReady: 'No ad is ready right now. Try again in a moment.',
    pickAircraft: 'Pick an aircraft',

    share: 'Share',
    shareFailed: 'Could not share right now.',
    shareCopied: 'Copied. Paste it anywhere.',

    runOver: 'Run over',
    landings: 'Landings',
    score: 'Score',
    windStep: 'Wind step',
    approach: 'Approach {k} of 5',
    dailyTitle: 'Daily {n}',
    secondRound: 'Second round',
    dailyDone: 'Today is flown. A new airport at midnight.',
    dailyNext: 'Next daily in {h} h {m} min',
    total: 'Total',
    streak: 'Streak',
    best: 'Best',
    goAroundMark: 'Go around',
    yourFlare: 'This flare',
    bestFlare: 'Your best flare',
    newBest: 'New best',
    unlocked: 'Unlocked',
    lockedNeed: '{n} more landings',

    log: {
      landings: 'Clean landings',
      butters: 'Butter landings',
      smoothest: 'Smoothest touchdown',
      bestRun: 'Best run',
      bestRunScore: 'Best run score',
      butterStreak: 'Longest butter streak',
      dailyStreak: 'Daily streak',
      bestDaily: 'Best daily'
    },

    units: { fpm: 'fpm', kt: 'kt', ft: 'ft' },

    stamps: {
      butter: 'Butter',
      firm: 'Firm',
      hard: 'Hard',
      bounce: 'Bounce',
      stall: 'Stall',
      short: 'Short',
      overrun: 'Overrun',
      missed: 'Missed'
    },

    aircraft: { bush: 'Bush plane', turboprop: 'Turboprop', jet: 'Regional jet' },
    airports: { island: 'Island strip', mountain: 'Mountain strip', night: 'Night field', shear: 'Shear field' },

    howTo: [
      'Butterline is a landing game where you can see the air. The wind is drawn as streaks, so a gust, a sinking pocket or the wind dying near the ground shows before it reaches you.',
      'Hold anywhere to raise the nose: you sink less but lose speed. Let go and the aircraft settles: more speed, more sink. The throttle looks after itself.',
      'Follow the butter line down to the yellow aim mark. Two white lights mean you are high, two red lights mean low, one of each means you are on the slope.',
      'Over the runway, hold to flare and let the wheels kiss the ground. Under 60 feet per minute is a butter landing.',
      'On the ground, let go so the nose wheel comes down, then hold to brake. Stop before the end of the runway.',
      'Circuits: land again and again while the wind gets worse after every clean landing. A hard landing, a bounce, a stall, a short landing or an overrun ends the run.',
      'Daily: five approaches at the same airport, in the same air, for everyone today. There is no free retry.'
    ],
    tips: [
      'Streaks that tilt down mark sinking air. Hold a little before you reach it.',
      'Long, bright streaks are a gust. A stronger headwind lifts you; a lull drops you.',
      'The wind fades near the ground, so you lose speed in the flare. On windy days, flare a little earlier.',
      'Watch the shadow. When it meets the wheels, you are about to touch.',
      'Hold too long and the wing stalls. A shaking wing is the warning: ease off.',
      'The jet floats a long way just above the runway. Aim to touch at the yellow mark, not past it.'
    ],
    tipsTitle: 'Tips',

    a11y: {
      game: 'Butterline play area. Hold to raise the nose, let go to settle.',
      pause: 'Pause',
      sound: 'Sound on or off',
      settings: 'Settings',
      logbook: 'Logbook',
      prev: 'Previous',
      nextItem: 'Next',
      locked: 'Locked'
    }
  };

  function format(text, vars) {
    return String(text).replace(/\{(\w+)\}/g, function (m, k) {
      return vars && vars[k] != null ? String(vars[k]) : m;
    });
  }

  return { en: en, t: en, format: format };
});
