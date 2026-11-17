/*
 * Every word Slogstop shows, in one table per language. Play is icons and numbers; words appear on
 * menus, cards, the why line and settings. The device language picks the table (Settings can override
 * it); a missing word falls back to English. No em or en dashes. Numbers are always Latin digits.
 *
 * Cricket words stay the words players use: yorker, bouncer, free hit, no ball and over are written
 * in each script as commentators say them. The Remove ads and archive button is translated in the game;
 * the product name in the Play Console stays as listed there. Urdu is right to left (dirOf); the
 * ground, the wheel and the ball line never mirror. Each language is its own file (lang-xx.js, loaded
 * before this one); English is below and is what a missing word falls back to.
 */
(function (root, factory) {
  var m = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.SS = root.SS || {}).strings = m;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  var CODES = ['hi', 'ur', 'bn', 'ta', 'te', 'mr', 'si'];

  var en = {
    langName: 'English',
    tagline: 'The last over, on one phone.',
    daily: 'Daily Last Over',
    dailyN: 'Daily #{n}',
    dailyNeed: 'Defend {t} off 6, {w}',
    dailyWon: 'Defended {t}. Back tomorrow for #{next}.',
    dailyLost: '{t} not defended. Back tomorrow for #{next}.',
    streakN: '{n} day streak',
    twoPlayers: '2 players',
    twoPlayersNote: 'Face to face, one phone',
    ladder: 'Ladder',
    ladderNote: 'Rung {r} of 30, {s} stars',
    defend: 'Defend',
    chase: 'Chase',
    wickets1: '1 wicket',
    wicketsN: '{n} wickets',
    need: 'Need {t} off {b}',
    needBalls1: 'Need {t} off 1',
    target: 'Target {t}',
    runsFor: '{r} for {w}',
    ballsLeft: '{b} balls left',
    ball1Left: '1 ball left',
    youBowl: 'You bowl',
    youBat: 'You bat',
    setField: 'Set the field',
    fieldNote: 'Pick a shape, then drag one fielder if you like.',
    fieldLegend: 'Numbers: the chance of a 4 or 6 off a good hit there. Glow: where he likes to hit. Drag one fielder if you like.',
    ringBadge: '{i} in, {o} out',
    fiveOut: 'Five outside the ring at most.',
    bowl: 'Bowl',
    start: 'Start',
    ready: 'Ready',
    batters: {
      slogger: 'Leg side slogger', cutter: 'Off side cutter', scooper: 'Scooper', straight: 'Straight hitter',
      nudger: 'Nudger', finisher: 'Finisher'
    },
    battersNote: {
      slogger: 'Loves midwicket and long on.', cutter: 'Cuts and slices square on the off side.',
      scooper: 'Goes fine: third man and fine leg.', straight: 'Hits down the ground.',
      nudger: 'Blocks and runs, rarely gets out.', finisher: 'Reads the field and the over best.'
    },
    bowlers: {
      yorkers: 'Yorker man', wide: 'Wide yorker man', slower: 'Change of pace', bouncer: 'Enforcer',
      death: 'Death bowler', mixer: 'Mixer'
    },
    bowlersNote: {
      yorkers: 'Bowls yorkers to a leg side field.', wide: 'Bowls wide of off to an off side field.',
      slower: 'Takes pace off to a field in front.', bouncer: 'Bangs it in to a field behind square.',
      death: 'Mixes yorkers and slower balls.', mixer: 'Bowls anything and reads you.'
    },
    batterIs: 'Batter: {s}',
    bowlerIs: 'Bowler: {s}',
    shirt: '#{n}',
    deliveries: ['Yorker', 'Wide yorker', 'Slower ball', 'Bouncer'],
    zones: ['Long off', 'Cover', 'Third man', 'Fine leg', 'Midwicket', 'Long on'],
    block: 'Block',
    out: 'Out',
    four: '4 or 6',
    oddsOut: 'Out {p}',
    oddsFour: '4+ {p}',
    oddsBeaten: 'If beaten, out {p}',
    heatNote: 'Glow and numbers: where he will hit this ball.',
    planNote: 'His plan this ball',
    freeHit: 'Free hit',
    freeHitNote: 'You cannot be out this ball.',
    noBall: 'No ball',
    shapes: ['Death', 'Leg side', 'Off side', 'In front', 'Behind', 'Straight'],
    why: {
      open0: '{d} to {z}: open, nobody there.',
      open1: '{d} to {z}: open, a ring fielder.',
      open2: '{d} to {z}: open, a deep fielder.',
      open3: '{d} to {z}: open, ring and deep.',
      shut: '{d} to {z}: shut, beaten.',
      edge: '{d} to {z}: beaten, edged behind.',
      slip: 'The yorker slipped into a full toss.',
      block: '{d}, blocked.',
      leave: 'Too late to pick: left alone.',
      noBall: 'Too late to bowl: no ball, free hit next.'
    },
    result: { 6: 'Six', 4: 'Four', 2: 'Two', 1: 'Single', 0: 'Dot', W: 'Out', bowled: 'Bowled', caught: 'Caught', caughtBehind: 'Caught behind' },
    defended: 'Defended {t}',
    notDefended: '{t} not defended',
    chased: 'Chased {t}',
    notChased: '{t} not chased',
    conceded: 'They scored {r} for {w}.',
    scored: 'You scored {r} for {w}.',
    next: 'Next',
    nextRung: 'Next rung',
    retry: 'Try again',
    menu: 'Menu',
    share: 'Share',
    shareCopied: 'Copied. Paste it anywhere.',
    shareFailed: 'Sharing did not work this time.',
    shareDaily: { won: 'Slogstop #{n}{r}: defended {t}, {line}', lost: 'Slogstop #{n}{r}: {t} not defended, {line}' },
    shareSolo: {
      defended: 'Slogstop: I defended {t} off the last over, {line}. Beat my over:',
      notDefended: 'Slogstop: {t} off the last over was too few, {line}. Can you defend it?',
      chased: 'Slogstop: I chased {t} off the last over, {line}. Beat my over:',
      notChased: 'Slogstop: I fell short chasing {t}, {line}. Can you chase it?'
    },
    shareDuel: 'Slogstop duel: {a} against {b}',
    beatMyOver: 'Beat my over',
    beatNote: 'A friend sent this over. Play it the same way and it goes the same way.',
    theirLine: 'Their over',
    yourLine: 'Your over',
    theirResult: 'They: {res}',
    play: 'Play',
    rung: 'Rung {n}',
    starsRule: {
      defend: ['Hold them', 'Take a wicket', 'Keep them to half the target'],
      chase: ['Chase it', 'Win with a ball to spare', 'Lose no wicket']
    },
    nextStar: 'Next star: {r}',
    nbShort: 'NB',
    locked: 'Win the rung before it first.',
    // the duel
    tapBall: 'Tap a ball before 1',
    tapZone: 'Tap where to hit',
    pickedLock: 'Locked in',
    waitField: 'The bowler is setting the field',
    late: 'Late',
    youWin: 'You win',
    theyWin: 'They win',
    tie: 'Tie',
    superOver: 'Super Over',
    inningsBreak: 'Swap: you bowl next',
    inningsBreakBat: 'Swap: you bat next',
    chaseTarget: 'Target {t}',
    firstBat: 'You bat first',
    firstBowl: 'You bowl first',
    nextMatch: 'Next match',
    matchScore: '{a} against {b}',
    keysTop: 'Keys: Q W E R T Y U',
    keysBottom: 'Keys: Z X C V B N M',
    // rewarded
    freeHitAd: 'Watch an ad: free hit',
    freeHitTake: 'Take a free hit',
    againAd: 'Watch an ad: one more try',
    againTake: 'Take one more try',
    repairAd: 'Watch an ad: keep your streak',
    repairTake: 'Keep your streak',
    repairNote: 'You missed yesterday. Your {n} day streak can stay.',
    repaired: 'Streak kept.',
    rewardSkipped: 'The ad closed early, so no bonus this time.',
    rewardNotReady: 'No ad is ready right now. Try again in a moment.',
    secondTry: 'Second try',
    // remove ads
    removeAds: 'Remove ads and archive',
    removeAdsPrice: 'Remove ads and archive, {price}',
    removeAdsLine: 'One purchase removes the ads between overs and duels for good, opens every past Daily Last Over and gives the bonuses without an ad.',
    restore: 'Restore purchases',
    purchase: {
      purchased: 'Ads removed and the archive is open. Thank you.',
      owned: 'This account already has Remove ads and archive.',
      pending: 'Payment pending. It unlocks once Google Play confirms it.',
      cancelled: 'Purchase cancelled.',
      unavailable: 'Purchases need the Google Play Store, which is not available here.',
      notOffered: 'Remove ads and archive is not on sale here right now.',
      offline: 'Google Play could not be reached. Try again when online.',
      failed: 'The purchase did not go through.'
    },
    restored: {
      yes: 'Remove ads and archive restored.',
      no: 'No purchase of Remove ads and archive was found on this Google account.',
      failed: 'Google Play could not be reached. Try again later.'
    },
    archive: 'Archive',
    archiveNote: 'Every past Daily Last Over. Archive overs do not change your streak.',
    dayN: '#{n}',
    notPlayed: 'Not played',
    // settings and sheets
    settings: 'Settings',
    language: 'Language',
    languageAuto: 'Phone language',
    sound: 'Sound',
    motion: 'Reduced motion',
    on: 'On',
    off: 'Off',
    howToPlay: 'How to play',
    privacyOptions: 'Privacy options',
    privacyPolicy: 'Privacy policy',
    close: 'Close',
    paused: 'Paused',
    resume: 'Resume',
    leave: 'Leave the over',
    leaveDaily: 'Leaving now counts today\'s Daily as lost.',
    licences: 'Font: Archivo (SIL Open Font License). Icons: Phosphor (MIT). Every sound is made in the game. Every player is made up.',
    howTo: [
      'Each ball is two hidden picks. The bowler picks a delivery: yorker, wide yorker, slower ball or bouncer. The batter picks where to hit, or blocks.',
      'Every delivery leaves three zones open and shuts the other three. The small wheel on each delivery shows its open zones. Hit into an open zone and the field decides how far it goes: no fielder there is usually a boundary, a deep fielder saves it and sometimes takes the catch. Hit into a shut zone and you are beaten: a dot, and out about one time in six. A block is never out.',
      'Yorkers slip into a full toss one ball in twelve, and a full toss can be hit anywhere. Before each over the bowler picks one of six field shapes and may drag one fielder; five may stand outside the ring.',
      'With a friend, lay the phone flat between you. Each ball is a throw: 3, 2, 1, and both tap. Bowl late and it is a no ball with a free hit next. Bat late and you leave it. One over each, and a Super Over if it is tied.'
    ],
    a11y: { pause: 'Pause', settings: 'Settings', sound: 'Sound on or off', archive: 'Archive', how: 'How to play', close: 'Close' }
  };

  var tables = { en: en };
  if (typeof module === 'object' && module.exports) {
    CODES.forEach(function (c) { tables[c] = require('./lang-' + c + '.js'); });
  } else if (root && root.SS && root.SS.langs) {
    CODES.forEach(function (c) { if (root.SS.langs[c]) tables[c] = root.SS.langs[c]; });
  }
  var RTL = { ur: true };
  var BY_LANGUAGE = { en: 'en', hi: 'hi', ur: 'ur', bn: 'bn', ta: 'ta', te: 'te', mr: 'mr', si: 'si' };

  /** The table code for a device language tag (hi, hi-IN, ur_PK, bn-BD...), en for anything else. */
  function resolve(tag) {
    var parts = String(tag || 'en').replace(/_/g, '-').toLowerCase().split('-');
    var lang = parts[0];
    if (lang === 'pa' && (parts.indexOf('arab') > 0 || parts.indexOf('pk') > 0)) lang = 'ur';
    if (lang === 'hi' && parts.indexOf('latn') > 0) lang = 'en';
    return Object.prototype.hasOwnProperty.call(BY_LANGUAGE, lang) && tables[BY_LANGUAGE[lang]] ? BY_LANGUAGE[lang] : 'en';
  }

  function dirOf(code) { return RTL[code] ? 'rtl' : 'ltr'; }

  function deviceLang() {
    try {
      return (typeof navigator !== 'undefined' && navigator.language) || 'en';
    } catch (e) {
      return 'en';
    }
  }

  // A table with English underneath, word by word, inside nested groups and lists too.
  function under(t, base) {
    if (Array.isArray(base)) {
      var list = [];
      for (var i = 0; i < base.length; i++) list.push(Array.isArray(t) && typeof t[i] === typeof base[i] ? t[i] : base[i]);
      return list;
    }
    if (base && typeof base === 'object') {
      var out = {};
      var src = t && typeof t === 'object' && !Array.isArray(t) ? t : {};
      for (var k in base) {
        if (Object.prototype.hasOwnProperty.call(base, k)) {
          out[k] = Object.prototype.hasOwnProperty.call(src, k) ? under(src[k], base[k]) : base[k];
        }
      }
      return out;
    }
    return typeof t === typeof base ? t : base;
  }

  function table(code) {
    var t = tables[code] || en;
    return t === en ? en : under(t, en);
  }

  function format(s, vars) {
    return String(s).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? vars[k] : m; });
  }

  return { en: en, tables: tables, table: table, resolve: resolve, dirOf: dirOf, deviceLang: deviceLang, format: format, codes: ['en', 'hi', 'ur', 'bn', 'ta', 'te', 'mr', 'si'] };
});
