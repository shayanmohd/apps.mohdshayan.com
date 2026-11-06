/*
 * The game's own ad rules (the shell adds its cap on top and may still refuse). Pure functions of the
 * caps, the save and the moment, so they are unit tested.
 *
 *   interstitial  atlas_next only: Next on a finished Atlas island's result card, from the 4th island
 *                 finished since install, at most one per 2 Atlas islands (counted since the last one that
 *                 showed), never in a break where a rewarded ad was watched, never for ad free players
 *   rewarded      offered only while caps.rewardedReady, or while ad free (then worded "Take")
 *   remove ads    shown only while caps.removeAds and not ad free; on its own once, after the first par
 */
(function (root) {
  'use strict';
  var FC = root.FC || (root.FC = {});

  var FIRST_AD_AFTER = 4;
  var ISLANDS_PER_AD = 2;

  /** ctx: { kind: 'atlas' | 'daily' | 'archive', rewardedThisBreak: bool } */
  function interstitialDue(caps, p, ctx) {
    if (!caps || caps.platform !== 'android' || !caps.interstitial || caps.adFree) return false;
    if (!ctx || ctx.kind !== 'atlas' || ctx.rewardedThisBreak || ctx.preview) return false;
    return p.atlas.finished >= FIRST_AD_AFTER && p.atlas.sinceAd >= ISLANDS_PER_AD;
  }

  function afterInterstitial(p, result) {
    if (result && result.shown) p.atlas.sinceAd = 0;
  }

  /** Whether a rewarded offer may be shown, and how to word it. */
  function rewardedOffer(caps) {
    if (!caps) return { show: false, take: false };
    if (caps.adFree && caps.platform === 'android') return { show: true, take: true };
    return { show: !!(caps.rewardedReady && caps.rewarded), take: false };
  }

  function removeAdsVisible(caps) {
    return !!(caps && caps.removeAds && !caps.adFree);
  }

  /** The one time Remove ads may be offered on its own: the first result whose score reaches par. */
  function removeAdsOfferDue(caps, p, reachedPar) {
    return removeAdsVisible(caps) && !p.offerShown && !!reachedPar;
  }

  var api = {
    FIRST_AD_AFTER: FIRST_AD_AFTER, ISLANDS_PER_AD: ISLANDS_PER_AD, interstitialDue: interstitialDue,
    afterInterstitial: afterInterstitial, rewardedOffer: rewardedOffer, removeAdsVisible: removeAdsVisible,
    removeAdsOfferDue: removeAdsOfferDue
  };
  FC.ads = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
