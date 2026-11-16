/*
 * When an ad may be offered or asked for, as pure functions of the save and the shell's caps. The shell
 * still caps interstitials (150 s, none in the first 60 s); the game keeps its own counts and never
 * counts on an ad showing (WEBGAME-RECIPE.md section 3, the wave 7 ad plan).
 *
 *   Interstitial  next_race: Next race on a career race's result card, 2+ career races since the last
 *                 one that showed. rush_end: a Stop Rush run of 4+ stops, after any Second wind offer is
 *                 declined, before the run summary. Neither until 3 races or runs are finished since
 *                 install; never in a break where a rewarded ad was shown; never around a daily.
 *   Rewarded      only while caps.rewardedReady (or ad free): redo_stop, second_wind, daily_again.
 *   Remove ads    from the menu while caps.removeAds; on its own once, after the first sub-2.00 stop.
 */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.TT = root.TT || {}).breaks = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var GRACE_FINISHED = 3;
  var RACES_BETWEEN = 2;
  var RUSH_MIN_STOPS = 4;

  function finished(save) {
    return save.races + save.dailies + save.runs;
  }

  /** Next race pressed on a career race's result card. */
  function nextRace(save, ctx) {
    if (ctx.adFree || ctx.rewardedThisBreak) return false;
    if (ctx.kind !== 'career') return false;
    if (finished(save) < GRACE_FINISHED) return false;
    return save.ads.sinceShown >= RACES_BETWEEN;
  }

  /** A Stop Rush run has ended (and any Second wind was declined). */
  function rushEnd(save, run, ctx) {
    if (ctx.adFree || run.rewarded) return false;
    if (finished(save) < GRACE_FINISHED) return false;
    return run.cleared + (run.failed ? 1 : 0) >= RUSH_MIN_STOPS;
  }

  /** The game's own count after an interstitial request resolves. */
  function noteInterstitial(save, result) {
    if (result && result.shown) save.ads.sinceShown = 0;
  }

  /** A rewarded offer may show: an ad is loaded and ready, or the player is ad free (no ad at all). */
  function rewardedOffer(caps) {
    if (!caps) return false;
    if (caps.platform !== 'android') return false;
    return !!(caps.adFree || caps.rewardedReady);
  }

  function redoOffer(state, caps) {
    return state.kind === 'career' && !state.redoUsed && rewardedOffer(caps);
  }

  function secondWindOffer(run, caps) {
    return !run.windUsed && rewardedOffer(caps);
  }

  function dailyAgainOffer(save, today, caps) {
    var d = save.daily;
    return d.day === today && d.state === 'done' && !d.again && d.tries < 2 && rewardedOffer(caps);
  }

  /** The Remove ads button in the menu. */
  function removeAdsMenu(caps) {
    return !!(caps && caps.removeAds && !caps.adFree);
  }

  /** The one Remove ads offer on its own, after the first sub-2.00 stop; never after a daily. */
  function removeAdsOffer(save, caps, kind) {
    if (!removeAdsMenu(caps)) return false;
    if (kind === 'daily') return false;
    return save.ads.offerPending && !save.ads.offered;
  }

  function noteRemoveAdsOffered(save) {
    save.ads.offered = true;
    save.ads.offerPending = false;
  }

  return {
    GRACE_FINISHED: GRACE_FINISHED, RACES_BETWEEN: RACES_BETWEEN, RUSH_MIN_STOPS: RUSH_MIN_STOPS,
    finished: finished, nextRace: nextRace, rushEnd: rushEnd, noteInterstitial: noteInterstitial,
    rewardedOffer: rewardedOffer, redoOffer: redoOffer, secondWindOffer: secondWindOffer,
    dailyAgainOffer: dailyAgainOffer, removeAdsMenu: removeAdsMenu, removeAdsOffer: removeAdsOffer,
    noteRemoveAdsOffered: noteRemoveAdsOffered
  };
});
