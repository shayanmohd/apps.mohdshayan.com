/*
 * Run bookkeeping, progression and the ad rules, as pure functions over plain objects (no browser APIs),
 * so the rules that decide when an ad may be asked for are unit tested.
 */
(function (root) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var eras = node ? require('./eras.js') : root.Pawnfare.eras;

  var RUN_LENGTH = 8;
  var TAKE_BACKS_PER_RUN = 3;
  var ARCHIVE_PER_DAY = 3;

  /** A fresh run in an era. */
  function newRun(eraId, seed) {
    return {
      era: eraId,
      seed: seed >>> 0,
      index: 0,
      army: eras.ERAS[eraId].army.slice(),
      wins: 0,
      lostPieces: 0,
      allAtPar: true,
      results: [],
      flags: { secondWind: false, fourth: false, takeBacks: 0 },
      drafted: []
    };
  }

  /** Records a won board: the surviving army, moves against par. Returns the run (mutated). */
  function recordWin(run, result) {
    run.wins++;
    run.army = result.survivors.slice();
    run.lostPieces += result.lost | 0;
    if (result.moves > result.par) run.allAtPar = false;
    run.results.push({ won: true, moves: result.moves, par: result.par, lost: result.lost | 0 });
    return run;
  }

  function recordLoss(run, result) {
    run.results.push({ won: false, moves: result.moves, par: result.par, lost: result.lost | 0 });
    return run;
  }

  function isComplete(run) { return run.wins >= RUN_LENGTH; }

  /** Mastery stars a finished run earns in its era: [complete, every board at par, no piece lost]. */
  function masteryOf(run) {
    var done = isComplete(run);
    return [done, done && run.allAtPar, done && run.lostPieces === 0];
  }

  /**
   * Pieces (and the mad queen era) a won board unlocks: milestones on boards won in one run, and the
   * second era after a complete shatranj run or 16 shatranj boards won in all.
   */
  function unlocksAfterWin(progress, eraId, winsInRun) {
    var out = { pieces: [], era: null };
    var have = progress.unlocked || [];
    eras.UNLOCKS.forEach(function (u) {
      if (u.era === eraId && winsInRun >= u.wins && have.indexOf(u.piece) < 0) out.pieces.push(u.piece);
    });
    var shatranjWins = (progress.stats && progress.stats.eraWins && progress.stats.eraWins.shatranj) || 0;
    if (!progress.eras || !progress.eras.madqueen) {
      if (eraId === 'shatranj' && (winsInRun >= RUN_LENGTH || shatranjWins >= eras.ERA2_TOTAL_WINS)) out.era = 'madqueen';
    }
    return out;
  }

  /**
   * May the game ask for an interstitial at this break? ctx:
   *   placement        'board_break' (after a won board, before the draft) or 'run_end' (before the summary)
   *   mode             'run', 'daily' or 'archive'
   *   finishedBoards   boards finished since install, the one just finished included
   *   winsSinceAd      boards won since the last interstitial that showed, this one included
   *   runWins          boards won in this run
   *   boardsReached    the board number the run reached (1 to 8)
   *   rewardedInBreak  a rewarded ad was watched on the board just played or in this break
   *   adFree           the player owns Remove ads
   */
  function mayInterstitial(ctx) {
    if (ctx.adFree) return false;
    if (ctx.mode !== 'run') return false; // never before, during or after a Daily or an archive day
    if (ctx.finishedBoards <= 3) return false; // none in the first 3 boards after install
    if (ctx.winsSinceAd < 3) return false; // at most one per 3 won boards
    if (ctx.rewardedInBreak) return false; // at most one ad per break, never right after a rewarded one
    if (ctx.placement === 'board_break') {
      return ctx.runWins > 0 && ctx.runWins % 3 === 0 && ctx.runWins < RUN_LENGTH;
    }
    if (ctx.placement === 'run_end') {
      return ctx.boardsReached >= 4; // a quick loss (under 4 boards) never meets an ad
    }
    return false;
  }

  /** Rewarded offers, by name, given the run's flags (the caller also checks caps.rewardedReady). */
  function mayOffer(name, ctx) {
    switch (name) {
      case 'secondWind': return ctx.mode === 'run' && !ctx.run.flags.secondWind;
      case 'takeBack':
        return ctx.mode === 'run' && ctx.run.flags.takeBacks < TAKE_BACKS_PER_RUN && !ctx.boardTookBack && ctx.movesMade > 0;
      case 'fourth': return ctx.mode === 'run' && !ctx.run.flags.fourth;
      case 'archive': return (ctx.archiveUsed | 0) < ARCHIVE_PER_DAY;
      default: return false;
    }
  }

  var api = {
    RUN_LENGTH: RUN_LENGTH, TAKE_BACKS_PER_RUN: TAKE_BACKS_PER_RUN, ARCHIVE_PER_DAY: ARCHIVE_PER_DAY,
    newRun: newRun, recordWin: recordWin, recordLoss: recordLoss, isComplete: isComplete, masteryOf: masteryOf,
    unlocksAfterWin: unlocksAfterWin, mayInterstitial: mayInterstitial, mayOffer: mayOffer
  };
  if (node) module.exports = api;
  else (root.Pawnfare = root.Pawnfare || {}).run = api;
})(this);
