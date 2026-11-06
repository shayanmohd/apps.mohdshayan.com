/*
 * Every word the game shows, in one table (text-light: play itself needs none). S(key, ...args) fills
 * {0}, {1} from the arguments. No dashes.
 */
(function (root) {
  'use strict';

  var EN = {
    // Home and menus
    title: 'Pawnfare',
    tagline: 'Chess history, one short board at a time',
    play: 'Play',
    continueRun: 'Continue',
    newRun: 'New run',
    newRunEnds: 'The run in progress ends here.',
    daily: 'Daily',
    dailyNumber: 'Daily #{0}',
    dailyDone: 'Done {0}/5',
    dailyGoing: 'Board {0} of 5',
    dailyNew: '5 boards, one army',
    museum: 'Museum',
    archive: 'Archive',
    settings: 'Settings',
    back: 'Back',
    home: 'Home',
    resume: 'Resume',
    paused: 'Paused',
    pause: 'Pause',
    streak: 'Streak {0}',
    bestRun: 'Best {0}/8',
    boardOf: 'Board {0} of {1}',
    eraBoard: '{0}, board {1} of {2}',
    eraCleared: '{0}, {1} of 8 boards',
    dailyMeta: '{0}, {1} of 5 boards',
    dailyBoardMeta: '{0}, board {1} of 5',
    chooseEra: 'Choose an era',
    locked: 'Locked',
    era2Locked: 'Win a shatranj run, or 16 shatranj boards',
    stars: 'Stars',

    // Eras and Daily armies
    era_shatranj: 'Shatranj',
    era_madqueen: 'The mad queen',
    eraPlace_shatranj: 'Baghdad, c. 850',
    eraPlace_madqueen: 'Valencia, c. 1475',
    army_baghdad: 'Baghdad, 850',
    army_samarkand: 'Samarkand, 1400',
    army_valencia: 'Valencia, 1475',
    army_ayutthaya: 'Ayutthaya, 1600',

    // Play
    movesLeft: 'Moves left',
    par: 'par {0}',
    take: 'Take',
    draftTitle: 'Choose one',
    draftPiece: 'New piece',
    draftPromote: 'Promotion',
    draftFuse: 'Fuse',
    next: 'Next',
    boardWon: 'King taken',
    boardLost: 'Board lost',
    armySpent: 'Your army can no longer take a king',
    endRun: 'End run',
    runOver: 'Run over',
    runComplete: 'Run complete',
    boardsCleared: '{0} of 8 boards',
    newPieces: 'New in the museum',
    era2Open: 'The mad queen era is open',
    mastery0: 'Complete a run',
    mastery1: 'Every board at par',
    mastery2: 'No piece lost',

    // Rewarded offers: the reward first, no pressure
    adSecondWind: 'Watch an ad: replay this board',
    freeSecondWind: 'Replay this board',
    adTakeBack: 'Watch an ad: take back',
    freeTakeBack: 'Take back',
    adFourth: 'Watch an ad: a fourth choice',
    freeFourth: 'Take a fourth choice',
    adArchive: 'Watch an ad: play this day',
    freeArchive: 'Play this day',
    rewardNotGiven: 'No reward this time. Nothing else changed.',
    archiveLeft: '{0} left today',
    archiveNone: 'No more archive days today',

    // Daily
    dailyIntro: 'Everyone plays this army against the same 5 boards today.',
    start: 'Start',
    dailyResult: 'Daily #{0}',
    dailyArchived: 'Archive day #{0}',
    share: 'Share',
    shared: 'Shared.',
    copied: 'Copied. Paste it anywhere.',
    shareFailed: 'Sharing is not available here.',
    shareTitle: 'Pawnfare Daily #{0}: {1}/5',
    shareTitleArchive: 'Pawnfare Daily #{0}: {1}/5 (archive)',
    comeBack: 'A new Daily at midnight',

    // Museum
    museumLocked: 'Not found yet',
    sameMoveAs: 'Moves as the {0}',
    compound: '{0} and {1}',

    // Settings and purchase
    sound: 'Sound',
    haptics: 'Vibration',
    reducedMotion: 'Reduced motion',
    on: 'On',
    off: 'Off',
    auto: 'Auto',
    replayTutorial: 'Show the first board hint again',
    privacyOptions: 'Privacy options',
    privacyPolicy: 'Privacy policy',
    removeAds: 'Remove ads and archive',
    removeAdsPrice: 'Remove ads and archive, {0}',
    removeAdsWhat: 'No ads between boards, every past Daily, and rewarded bonuses without an ad.',
    restore: 'Restore purchases',
    notNow: 'Not now',
    buy_purchased: 'Ads removed and the archive is open. Thank you.',
    buy_owned: 'Already yours on this account.',
    buy_pending: 'Payment pending. Everything opens once Google Play confirms it.',
    buy_cancelled: 'Purchase cancelled.',
    buy_unavailable: 'Purchases need the Google Play Store, which is not available here.',
    buy_notOffered: 'Not on sale here right now.',
    buy_offline: 'Google Play could not be reached. Try again when online.',
    buy_failed: 'The purchase did not go through.',
    restore_ok: 'Purchases restored.',
    restore_none: 'No purchase found on this account.',
    restore_failed: 'Google Play could not be asked. Try again later.',
    version: 'Version {0}',

    // Pieces: names, glosses, history
    piece_baidaq: 'Baidaq', gloss_baidaq: 'foot soldier',
    piece_ferz: 'Ferz', gloss_ferz: 'counsellor',
    piece_fil: 'Fil', gloss_fil: 'elephant',
    piece_faras: 'Faras', gloss_faras: 'horse',
    piece_rukh: 'Rukh', gloss_rukh: 'chariot',
    piece_wazir: 'Wazir', gloss_wazir: 'vizier',
    piece_dabbaba: 'Dabbaba', gloss_dabbaba: 'war engine',
    piece_jamal: 'Jamal', gloss_jamal: 'camel',
    piece_pao: 'Pao', gloss_pao: 'cannon',
    piece_kyosha: 'Kyosha', gloss_kyosha: 'lance',
    piece_khon: 'Khon', gloss_khon: 'elephant',
    piece_gin: 'Gin', gloss_gin: 'silver general',
    piece_kin: 'Kin', gloss_kin: 'gold general',
    piece_bishop: 'Bishop', gloss_bishop: 'the new bishop',
    piece_queen: 'Queen', gloss_queen: 'the mad queen',
    piece_shah: 'Shah', gloss_shah: 'king',
    piece_champion: 'Champion', gloss_champion: 'rukh and faras',
    piece_centaur: 'Centaur', gloss_centaur: 'bishop and faras',
    piece_amazon: 'Amazon', gloss_amazon: 'queen and faras',
    piece_mann: 'Mann', gloss_mann: 'ferz and wazir',

    place_baidaq: 'Baghdad, c. 850', place_ferz: 'Persia, c. 600', place_fil: 'Baghdad, c. 850',
    place_faras: 'Baghdad, c. 850', place_rukh: 'Baghdad, c. 850', place_wazir: 'Samarkand, c. 1400',
    place_dabbaba: 'Samarkand, c. 1400', place_jamal: 'Samarkand, c. 1400', place_pao: 'Kaifeng, c. 1100',
    place_kyosha: 'Kyoto, c. 1200', place_khon: 'Ayutthaya, c. 1600', place_gin: 'Kyoto, c. 1200',
    place_kin: 'Kyoto, c. 1200', place_bishop: 'Valencia, c. 1475', place_queen: 'Valencia, c. 1475',
    place_shah: 'Persia, c. 600', place_champion: 'Sicily, 1617', place_centaur: 'Sicily, 1617',
    place_amazon: 'Russia, 18th century', place_mann: 'Germany, c. 1200',

    history_baidaq: 'The foot soldier of shatranj steps one square forward and takes one square diagonally forward. It had no double step; on the last row it became a ferz.',
    history_ferz: 'The counsellor stepped one square diagonally. Around 1475 it became the queen: the queen descends from this one piece.',
    history_fil: 'The elephant leapt exactly two squares diagonally, over anything between. It became the long bishop around 1475.',
    history_faras: 'The horse has moved the same way since chaturanga in India.',
    history_rukh: 'The chariot already moved as the rook does today. Its Persian name gave the rook its name.',
    history_wazir: 'In the great chess played at Timur\'s court, the vizier stepped one square straight.',
    history_dabbaba: 'The war engine of Timur\'s great chess leapt exactly two squares straight.',
    history_jamal: 'The camel of Timur\'s great chess leapt one square further than the horse.',
    history_pao: 'The cannon of xiangqi slides like a chariot, but captures only by jumping exactly one piece.',
    history_kyosha: 'The lance of shogi charges straight ahead and never turns back.',
    history_khon: 'The elephant of makruk, Thai chess, steps one square diagonally or one straight forward.',
    history_gin: 'The silver general of shogi steps one square diagonally or one straight forward, as the khon does.',
    history_kin: 'The gold general of shogi steps one square straight, or one diagonally forward.',
    history_bishop: 'Around 1475 the elephant\'s short leap became a ride along the whole diagonal.',
    history_queen: 'Around 1475, in Valencia, the ferz became the queen and crossed the whole board. Players called it the chess of the mad queen.',
    history_shah: 'The king. Capturing it ends the board.',
    history_champion: 'Pietro Carrera\'s 1617 book proposed a piece that moves as rook and knight together.',
    history_centaur: 'Carrera\'s second new piece of 1617 moved as bishop and knight together.',
    history_amazon: 'In 18th century Russia the queen could also move as a knight.',
    history_mann: 'Courier chess, played in Germany from about 1200, had a man who stepped one square any way.'
  };

  function S(key) {
    var text = Object.prototype.hasOwnProperty.call(EN, key) ? EN[key] : key;
    for (var i = 1; i < arguments.length; i++) text = text.split('{' + (i - 1) + '}').join(String(arguments[i]));
    return text;
  }

  var api = { S: S, table: EN };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.Pawnfare = root.Pawnfare || {}).strings = api;
})(this);
