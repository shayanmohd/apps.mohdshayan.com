/*
 * Progress and the ad rules, both pure: what a finished show unlocks, the standing goals, postcards,
 * and when the game may ask for an interstitial or offer a rewarded bonus or Remove ads.
 */
(function (root) {
  'use strict';
  var Sky = root.Sky = root.Sky || {};

  // Fixed skill milestones, never random. Order is the order they are shown.
  var UNLOCKS = [
    { id: 'willow', kind: 'shell', type: 1, test: function (s) { return s.maxChain >= 7; } },
    { id: 'crossette', kind: 'shell', type: 2, test: function (s) { return s.perfects >= 3; } },
    { id: 'ring', kind: 'shell', type: 3, test: function (s) { return s.bigClear; } },
    { id: 'desert', kind: 'skyline', test: function (s) { return s.finished && !s.lightsOut; } },
    { id: 'snow', kind: 'skyline', test: function (s) { return s.fullClears >= 6; } }
  ];

  var GOALS = { chain: 15, perfectRun: 8 };

  /** Shell types a normal show may use. */
  function shellTypes(save) {
    var list = [0];
    if (save.unlocks.willow) list.push(1);
    if (save.unlocks.crossette) list.push(2);
    if (save.unlocks.ring) list.push(3);
    return list;
  }

  /**
   * Records a finished show. summary from Show.summary(); chain is the show's longest chain (bursts);
   * ctx: { day, preview }. Returns what changed, for the result card.
   */
  function applyShow(save, summary, chain, ctx) {
    ctx = ctx || {};
    var res = { unlocked: [], newBest: false, goals: [], postcard: false };
    save.stats.shows += 1;
    save.stats.firstShowDone = true;
    if (!summary.daily) {
      save.stats.normalShows += 1;
      save.stats.showsSinceAd += 1;
      var prev = save.best[summary.skyline] || 0;
      if (summary.score > prev) { save.best[summary.skyline] = summary.score; res.newBest = prev > 0; }
    }
    for (var i = 0; i < UNLOCKS.length; i++) {
      var u = UNLOCKS[i];
      if (!save.unlocks[u.id] && u.test(summary)) { save.unlocks[u.id] = true; res.unlocked.push(u.id); }
    }
    if (summary.maxChain > save.goals.chain) {
      if (summary.maxChain >= GOALS.chain && save.goals.chain < GOALS.chain) res.goals.push('chain');
      save.goals.chain = summary.maxChain;
    }
    if (summary.noDud && !save.goals.noDud) { save.goals.noDud = true; res.goals.push('noDud'); }
    if (summary.bestPerfectRun > save.goals.perfectRun) {
      if (summary.bestPerfectRun >= GOALS.perfectRun && save.goals.perfectRun < GOALS.perfectRun) res.goals.push('perfectRun');
      save.goals.perfectRun = summary.bestPerfectRun;
    }
    if (chain && chain.bursts && chain.bursts.length) {
      var card = save.postcards[summary.skyline];
      if (!card || chain.length > card.length) {
        save.postcards[summary.skyline] = { length: chain.length, bursts: chain.bursts.slice(0, 48), day: ctx.day | 0 };
        res.postcard = true;
      }
    }
    if (ctx.preview && save.previews.left[ctx.preview] > 0) save.previews.left[ctx.preview] -= 1;
    if (summary.skyline && !summary.daily) save.lastSkyline = summary.skyline;
    return res;
  }

  /** Records a Daily try. tryIndex 1 or 2. Keeps the better score; the second try is marked. */
  function applyDaily(save, day, summary, chain, tryIndex) {
    var h = save.daily.history;
    var rec = h[day] || { score: 0, chain: 0, perfects: 0, marks: [], tries: 0, second: false, done: false, bursts: null };
    rec.tries = Math.max(rec.tries, tryIndex);
    if (tryIndex === 2) rec.second = true;
    if (!rec.done || summary.score > rec.score) {
      rec.score = summary.score;
      rec.chain = summary.maxChain;
      rec.perfects = summary.perfects;
      rec.marks = summary.volleys.slice(0, 20);
      rec.bursts = chain && chain.bursts ? chain.bursts.slice(0, 48) : null;
    }
    rec.done = true;
    h[day] = rec;
    return rec;
  }

  /** Spends the Daily try when it starts, so leaving a try does not give a free one. */
  function startDaily(save, day, tryIndex) {
    var h = save.daily.history;
    var rec = h[day] || { score: 0, chain: 0, perfects: 0, marks: [], tries: 0, second: false, done: false, bursts: null };
    rec.tries = Math.max(rec.tries, tryIndex);
    if (tryIndex === 2) rec.second = true;
    h[day] = rec;
    return rec;
  }

  function dailyState(save, day) {
    var rec = save.daily.history[day];
    if (!rec || rec.tries === 0) return 'open';
    if (rec.tries === 1) return 'second';
    return 'done';
  }

  // ---- ad rules (WEBGAME-RECIPE section 3 and the Skychime ad plan) ----

  /**
   * Next show on a normal show's result card. ctx: { daily, encoreUsed, rewardedSinceEnd }.
   * At most one per 3 normal shows, none before 3 shows since install, never after the Daily, never right
   * after Encore or any rewarded ad.
   */
  function mayInterstitial(save, ctx) {
    if (!ctx || ctx.daily || ctx.encoreUsed || ctx.rewardedSinceEnd) return false;
    return save.stats.normalShows >= 3 && save.stats.showsSinceAd >= 3;
  }

  function interstitialShown(save) { save.stats.showsSinceAd = 0; }

  function rewardOffered(caps) { return !!(caps && (caps.adFree || caps.rewardedReady)); }

  function mayDailySecond(save, day, caps) {
    return dailyState(save, day) === 'second' && rewardOffered(caps);
  }

  /** Skyline preview: three shows on a locked skill skyline, once per day. */
  function mayPreview(save, day, id, caps) {
    if (id !== 'desert' && id !== 'snow') return false;
    if (save.unlocks[id]) return false;
    if ((save.previews.left[id] || 0) > 0) return false;
    if (save.previews.day === day) return false;
    return rewardOffered(caps);
  }

  function grantPreview(save, day, id) {
    save.previews.day = day;
    save.previews.left[id] = 3;
  }

  function canPlaySkyline(save, id, opts) {
    opts = opts || {};
    if (id === 'harbour') return true;
    if (id === 'river') return !!opts.adFree;
    if (id === 'newyear') return opts.festival === 'newyear';
    return !!save.unlocks[id] || (save.previews.left[id] || 0) > 0;
  }

  /**
   * The one quiet Remove ads card, once ever, on the first normal show's result card with a full clear of
   * the player's own, from the third normal show on (the first break that can hold an ad), so the very
   * first result screens never carry an offer.
   */
  function mayOfferRemoveAds(save, summary, caps) {
    if (!caps || !caps.removeAds || caps.adFree || save.offers.removeAdsShown) return false;
    if (save.stats.normalShows < 3) return false;
    return !summary.daily && !!summary.playerClear;
  }

  var api = {
    UNLOCKS: UNLOCKS, GOALS: GOALS, shellTypes: shellTypes, applyShow: applyShow, applyDaily: applyDaily,
    startDaily: startDaily, dailyState: dailyState, mayInterstitial: mayInterstitial,
    interstitialShown: interstitialShown, rewardOffered: rewardOffered, mayDailySecond: mayDailySecond,
    mayPreview: mayPreview, grantPreview: grantPreview, canPlaySkyline: canPlaySkyline,
    mayOfferRemoveAds: mayOfferRemoveAds
  };
  Sky.progress = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
