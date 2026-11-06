/*
 * The two launch eras, the difficulty table of a run, and the Daily armies. Data only.
 */
(function (root) {
  'use strict';

  /**
   * Per board of a run (index 0 to 7): board size, rival guards, the shortest-win band the generator must
   * hit (its low end rejects trivial boards), the extra moves on top of par, and how strong the guards are
   * (tier 0 pawns and minor pieces, 1 adds knights and elephants, 2 adds a rukh, 3 the queen in era 2).
   * Boards 2 to 4 are eased for casual players (ship review, 2026-11-06): one more move each, board 3's
   * guards stay at tier 0 and board 4 has 2 guards, not 3. Board 1 comes from starters.js.
   */
  var RUN_BOARDS = [
    { W: 5, H: 5, guards: 1, band: [2, 2], slack: 2, tier: 0 },
    { W: 5, H: 5, guards: 2, band: [2, 3], slack: 3, tier: 0 },
    { W: 5, H: 5, guards: 2, band: [3, 3], slack: 3, tier: 0 },
    { W: 6, H: 6, guards: 2, band: [3, 3], slack: 3, tier: 1 },
    { W: 6, H: 6, guards: 3, band: [3, 4], slack: 1, tier: 1 },
    { W: 6, H: 6, guards: 4, band: [3, 4], slack: 1, tier: 2 },
    { W: 6, H: 6, guards: 4, band: [4, 4], slack: 1, tier: 2 },
    { W: 6, H: 6, guards: 5, band: [4, 4], slack: 1, tier: 3 }
  ];

  var ERAS = {
    shatranj: {
      id: 'shatranj',
      year: 850,
      army: ['rukh', 'faras', 'fil', 'ferz', 'baidaq'],
      promo: 'ferz',
      // Guards by tier: each tier's list adds to the ones before it.
      guards: [['baidaq', 'baidaq', 'ferz'], ['fil', 'faras'], ['rukh'], ['faras']],
      pool: ['baidaq', 'ferz', 'fil', 'faras', 'rukh', 'wazir', 'dabbaba'],
      promotions: [{ from: 'baidaq', to: 'ferz' }]
    },
    madqueen: {
      id: 'madqueen',
      year: 1475,
      army: ['rukh', 'faras', 'bishop', 'ferz', 'baidaq'],
      promo: 'queen',
      guards: [['baidaq', 'baidaq', 'ferz'], ['bishop', 'faras'], ['rukh'], ['queen']],
      pool: ['baidaq', 'ferz', 'fil', 'faras', 'rukh', 'bishop', 'wazir', 'dabbaba'],
      promotions: [{ from: 'ferz', to: 'queen' }, { from: 'fil', to: 'bishop' }, { from: 'baidaq', to: 'queen' }]
    }
  };

  var ERA_ORDER = ['shatranj', 'madqueen'];

  /** Milestones that unlock pieces for later runs: [era, boards won in one run, piece]. */
  var UNLOCKS = [
    { era: 'shatranj', wins: 3, piece: 'jamal' },
    { era: 'shatranj', wins: 5, piece: 'khon' },
    { era: 'shatranj', wins: 8, piece: 'pao' },
    { era: 'madqueen', wins: 5, piece: 'kyosha' },
    { era: 'madqueen', wins: 8, piece: 'kin' }
  ];

  /** The mad queen era opens after a complete shatranj run, or 16 shatranj boards won in all. */
  var ERA2_TOTAL_WINS = 16;

  var ARMY_MAX = 6;

  /** The Daily armies, in rotation. Every Daily board starts with the full army. */
  var DAILY_ARMIES = [
    { id: 'baghdad', year: 850, promo: 'ferz', army: ['rukh', 'faras', 'fil', 'ferz', 'baidaq'] },
    { id: 'samarkand', year: 1400, promo: 'ferz', army: ['rukh', 'jamal', 'dabbaba', 'wazir', 'ferz'] },
    { id: 'valencia', year: 1475, promo: 'queen', army: ['rukh', 'faras', 'bishop', 'queen', 'baidaq'] },
    { id: 'ayutthaya', year: 1600, promo: 'ferz', army: ['rukh', 'faras', 'khon', 'khon', 'ferz'] }
  ];

  /**
   * The five Daily boards' generator settings (a short, rising curve), used only by tools/build-tables.js.
   * Frozen copies of the launch run boards 2, 4, 5, 6 and 7, so easing a run never changes the Daily.
   */
  var DAILY_BOARDS = [
    { W: 5, H: 5, guards: 2, band: [2, 3], slack: 2, tier: 0 },
    { W: 6, H: 6, guards: 3, band: [3, 3], slack: 2, tier: 1 },
    { W: 6, H: 6, guards: 3, band: [3, 4], slack: 1, tier: 1 },
    { W: 6, H: 6, guards: 4, band: [3, 4], slack: 1, tier: 2 },
    { W: 6, H: 6, guards: 4, band: [4, 4], slack: 1, tier: 2 }
  ];

  var api = {
    RUN_BOARDS: RUN_BOARDS, ERAS: ERAS, ERA_ORDER: ERA_ORDER, UNLOCKS: UNLOCKS,
    ERA2_TOTAL_WINS: ERA2_TOTAL_WINS, ARMY_MAX: ARMY_MAX, DAILY_ARMIES: DAILY_ARMIES, DAILY_BOARDS: DAILY_BOARDS
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.Pawnfare = root.Pawnfare || {}).eras = api;
})(this);
