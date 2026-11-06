/*
 * The ad rules the game keeps on top of the shell's own cap (GAME-DESIGN.md section 5). Pure: the caller
 * passes the counts and the capabilities and keeps the counts in the save. The game never counts on an
 * ad showing: only a shown ad resets the counts.
 *
 * Interstitial break points, and only these:
 *   sky_next    Next sky on a solo sky's result card
 *   match_next  Next match after a finished best of five
 */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.LS = root.LS || {}).rules = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MIN_FINISHED = 3;   // skies or matches finished since install before any interstitial
  var SKIES_PER_AD = 3;
  var MATCHES_PER_AD = 2;
  var SPARE_MIN_CUTS = 2;

  /**
   * ads: {finished, skiesSinceAd, matchesSinceAd} from the save. ctx: {kind, adFree, daily, spareUsed}.
   * Whether the game may ask the shell for an interstitial at all.
   */
  function interstitialAllowed(ads, ctx) {
    if (!ctx || ctx.adFree) return { ok: false, why: 'adFree' };
    if (ctx.daily) return { ok: false, why: 'daily' };
    if (ctx.spareUsed) return { ok: false, why: 'rewardBreak' };
    if ((ads.finished | 0) < MIN_FINISHED) return { ok: false, why: 'warmup' };
    if (ctx.kind === 'sky_next') {
      return (ads.skiesSinceAd | 0) >= SKIES_PER_AD ? { ok: true, why: 'ok' } : { ok: false, why: 'count' };
    }
    if (ctx.kind === 'match_next') {
      return (ads.matchesSinceAd | 0) >= MATCHES_PER_AD ? { ok: true, why: 'ok' } : { ok: false, why: 'count' };
    }
    return { ok: false, why: 'notABreak' };
  }

  /** A finished sky (kind solo or daily) or match: the counts move on. The lesson is not counted. */
  function recordFinished(ads, kind) {
    ads.finished = (ads.finished | 0) + 1;
    if (kind === 'solo') ads.skiesSinceAd = (ads.skiesSinceAd | 0) + 1;
    if (kind === 'match') ads.matchesSinceAd = (ads.matchesSinceAd | 0) + 1;
    return ads;
  }

  /** After the shell answered. Only a shown ad resets the counts, both of them: never two in a row. */
  function afterInterstitial(ads, result) {
    if (result && result.shown) {
      ads.skiesSinceAd = 0;
      ads.matchesSinceAd = 0;
    }
    return ads;
  }

  /** A rewarded offer exists only while one can be shown now, or the player is ad free. */
  function rewardReady(caps) {
    return !!(caps && (caps.adFree || (caps.rewarded && caps.rewardedReady)));
  }

  /** Spare kite: once per sky, after the third kite was cut before sunset, with 2 or more cuts; never two-player. */
  function canSpare(caps, sky) {
    return rewardReady(caps) && !!sky && sky.mode !== 'lesson' && sky.phase === 'out' &&
      (sky.cuts | 0) >= SPARE_MIN_CUTS && !sky.spareUsed;
  }

  /** Daily second sky: once a day, after today's Daily is done. */
  function canSecondDaily(caps, daily, today) {
    return rewardReady(caps) && !!daily && daily.day === today && !!daily.done && !daily.second && !daily.secondStarted;
  }

  /** The one Remove ads offer on its own: the first finished two-player match's result card. */
  function offerRemoveAdsAfterMatch(caps, prompted) {
    return !!(caps && caps.removeAds && !caps.adFree && !prompted);
  }

  return {
    MIN_FINISHED: MIN_FINISHED, SKIES_PER_AD: SKIES_PER_AD, MATCHES_PER_AD: MATCHES_PER_AD,
    SPARE_MIN_CUTS: SPARE_MIN_CUTS,
    interstitialAllowed: interstitialAllowed, recordFinished: recordFinished, afterInterstitial: afterInterstitial,
    rewardReady: rewardReady, canSpare: canSpare, canSecondDaily: canSecondDaily,
    offerRemoveAdsAfterMatch: offerRemoveAdsAfterMatch
  };
});
