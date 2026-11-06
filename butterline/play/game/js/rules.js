/*
 * The ad rules the game enforces on top of the shell's own cap (GAME-DESIGN.md section 8). Pure: the
 * caller passes the counters and the capabilities and keeps the counters in the save.
 *
 * Interstitial break points, and only these:
 *   circuits_end  the end of a Circuits run of 3 or more landings, before its result card
 *   daily_next    Next between Daily approaches, once per daily, after the 3rd approach or later
 */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.BL = root.BL || {}).rules = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MIN_FINISHED = 3;
  var LANDINGS_PER_AD = 4;
  var MIN_RUN_LANDINGS = 3;
  var DAILY_FROM = 3;
  var KEEP_RUN_PER_DAY = 2;

  /**
   * ads: {finished, landingsSinceAd} from the save. ctx: {kind, runLandings, approachesDone,
   * dailyAdUsed, rewardOffered, adFree}. Resolves whether the game may ask the shell at all.
   */
  function interstitialAllowed(ads, ctx) {
    if (ctx.adFree) return { ok: false, why: 'adFree' };
    if (ctx.rewardOffered) return { ok: false, why: 'rewardBreak' };
    if ((ads.finished | 0) < MIN_FINISHED) return { ok: false, why: 'warmup' };
    if ((ads.landingsSinceAd | 0) < LANDINGS_PER_AD) return { ok: false, why: 'count' };
    if (ctx.kind === 'circuits_end') {
      if ((ctx.runLandings | 0) < MIN_RUN_LANDINGS) return { ok: false, why: 'shortRun' };
      return { ok: true, why: 'ok' };
    }
    if (ctx.kind === 'daily_next') {
      if ((ctx.approachesDone | 0) < DAILY_FROM) return { ok: false, why: 'early' };
      if (ctx.dailyAdUsed) return { ok: false, why: 'dailyUsed' };
      return { ok: true, why: 'ok' };
    }
    return { ok: false, why: 'notABreak' };
  }

  /** After the shell answered an interstitial request. Only a shown ad resets the count. */
  function afterInterstitial(ads, result) {
    if (result && result.shown) ads.landingsSinceAd = 0;
    return ads;
  }

  /** After a rewarded ad was watched (not for an ad free grant): no interstitial right after it. */
  function afterRewarded(ads, result) {
    if (result && result.granted && result.reason === 'watched') ads.landingsSinceAd = 0;
    return ads;
  }

  /** A rewarded offer exists only while one can be shown now, or the player is ad free. */
  function rewardReady(caps) {
    return !!(caps && (caps.adFree || (caps.rewarded && caps.rewardedReady)));
  }

  function canKeepRun(caps, run, keepRunsToday) {
    return rewardReady(caps) && run.landings >= MIN_RUN_LANDINGS && !run.kept && (keepRunsToday | 0) < KEEP_RUN_PER_DAY;
  }

  function canGoAround(caps, daily, failed) {
    return rewardReady(caps) && !!failed && !daily.goAroundUsed;
  }

  function canSecondRound(caps, daily) {
    return rewardReady(caps) && !!daily.done && !daily.secondUsed;
  }

  /** The one Remove ads offer on its own: the first result card that contains a butter landing. */
  function offerRemoveAdsOnResult(caps, prompted, hadButter) {
    return !!(caps && caps.removeAds && !caps.adFree && !prompted && hadButter);
  }

  return {
    MIN_FINISHED: MIN_FINISHED,
    LANDINGS_PER_AD: LANDINGS_PER_AD,
    MIN_RUN_LANDINGS: MIN_RUN_LANDINGS,
    DAILY_FROM: DAILY_FROM,
    KEEP_RUN_PER_DAY: KEEP_RUN_PER_DAY,
    interstitialAllowed: interstitialAllowed,
    afterInterstitial: afterInterstitial,
    afterRewarded: afterRewarded,
    rewardReady: rewardReady,
    canKeepRun: canKeepRun,
    canGoAround: canGoAround,
    canSecondRound: canSecondRound,
    offerRemoveAdsOnResult: offerRemoveAdsOnResult
  };
});
