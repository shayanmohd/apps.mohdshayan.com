/*
 * The flight: a point mass with lift, drag, thrust and gravity in the air-relative frame, stepped at a
 * fixed 120 Hz. One input: hold raises the nose in the air; on the ground, letting go lowers the nose
 * wheel and holding then brakes. Deterministic: the same flight options and the same hold per step give
 * the same landing.
 */
(function (root, factory) {
  var node = typeof require === 'function' && typeof module === 'object';
  var m = factory(
    node ? require('./aircraft.js') : root.BL.aircraft,
    node ? require('./airports.js') : root.BL.airports,
    node ? require('./wind.js') : root.BL.wind,
    node ? require('./grade.js') : root.BL.grade
  );
  if (node && module.exports) module.exports = m;
  else (root.BL = root.BL || {}).sim = m;
})(typeof self !== 'undefined' ? self : this, function (aircraft, airports, wind, grade) {
  'use strict';

  var DT = 1 / 120;
  var G = aircraft.G;
  var APPROACH_SECONDS = 16;
  var STAMP_DELAY = 0.35;
  var BOUNCE_HEIGHT = 0.25;
  var STALL_LIMIT = 0.6;
  var TAXI_SPEED = 4;
  var CALLOUTS_FT = [50, 30, 20, 10];
  var FT = 0.3048;
  var TRACE_HZ = 30;
  var TOUCHDOWN_ZONE = 0.2; // of the runway length, beyond the aim point
  // The flare assist of a newcomer's first landings (opts.gentle; main.js decides, never for the Daily):
  // below GENTLE_ZONE a hold cannot slow the sink under the larger of GENTLE_SINK and the height over
  // GENTLE_TAU, so holding too long settles the aircraft onto the runway instead of ballooning it into a
  // stall and a hard drop. On the ground, brakes once applied stay on to the stop. GAME-DESIGN.md section 4.
  var GENTLE_ZONE = 10;   // m above the ground
  var GENTLE_SINK = 0.45; // m/s, about 90 fpm
  var GENTLE_TAU = 1.5;   // s

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /**
   * opts: aircraft (id), airport (id), seed (uint32), step (wind step), tutorial (bool), gentle (bool:
   * the flare assist).
   */
  function createFlight(opts) {
    var ac = aircraft.get(opts.aircraft);
    var ap = airports.get(opts.airport);
    var rw = airports.runway(ap, ac);
    var tutorial = !!opts.tutorial;
    var step = opts.step || 0;
    var params = wind.stepParams(ap, step, tutorial);
    var vg = ac.vref - params.headwind * 1.15;
    var xStart = rw.aim - vg * APPROACH_SECONDS;
    var air = wind.buildAir({
      seed: opts.seed >>> 0, airport: ap, aircraft: ac, rw: rw, step: step, tutorial: tutorial,
      xStart: xStart, groundSpeed: vg
    });
    var aimH = airports.groundAt(ap, rw, rw.aim);
    var h0 = aimH + (rw.aim - xStart) * Math.tan(ac.glide) * (tutorial ? 1.08 : 1);
    if (step >= 2 && !tutorial) {
      // A little variety in where the approach starts: up to 6 percent high or low.
      var off = ((air.seed >>> 8) % 1000) / 1000 * 2 - 1;
      h0 *= 1 + 0.06 * off;
    }
    // The approach power is set for the day's mean wind, so a hands-off aircraft tracks the glide path
    // over the ground in steady air and only the air's surprises move it off.
    var meanWx = 0;
    for (var k = 0; k < 8; k++) meanWx += wind.bandWind(air, h0 * (k + 0.5) / 8) / 8;
    var vgMean = Math.max(8, ac.vref + meanWx);
    var gammaAir = -Math.atan(vgMean * Math.tan(ac.glide) / ac.vref);
    var tr = aircraft.trim(ac, gammaAir);
    var w = wind.sample(air, xStart, h0, 0, {});
    var vx = ac.vref + w.wx;
    var vz = w.wz + ac.vref * Math.tan(gammaAir);
    var f = {
      ac: ac, ap: ap, rw: rw, air: air, step: step, tutorial: tutorial, seed: opts.seed >>> 0,
      t: 0, steps: 0,
      x: xStart, h: h0, vx: vx, vz: vz,
      theta: tr.theta, p: ac.pTrim, thetaLo: tr.thetaLo, thrustApp: tr.thrust, alphaTrim: tr.alpha,
      xStart: xStart, h0: h0, aimH: aimH,
      phase: 'air',
      hold: false,
      airspeed: ac.vref, alpha: tr.alpha, gamma: gammaAir, thrust: tr.thrust, throttle: tr.thrust,
      hr: h0 - airports.groundAt(ap, rw, xStart),
      lift: G, ge: 0,
      stalledFor: 0, stall: false, shaker: false,
      contact: null, contactTheta: 0, bounced: false, noseDown: false, braking: false,
      stamp: null, stampAt: -1, fpm: 0, score: 0, dxAim: 0,
      done: false, outcome: null, doneReason: null,
      calloutsLeft: CALLOUTS_FT.slice(),
      events: [],
      trace: [], traceNext: 0, flare: null,
      wind: w,
      maxHeld: 0, heldInFlare: false, gentle: !!opts.gentle
    };
    return f;
  }

  function slopeAt(f, x) {
    if (airports.isRunway(f.rw, x)) return f.ap.slope;
    var a = airports.groundAt(f.ap, f.rw, x - 1);
    var b = airports.groundAt(f.ap, f.rw, x + 1);
    return (b - a) / 2;
  }

  function emit(f, type, data) {
    f.events.push({ type: type, t: f.t, data: data || null });
  }

  function finish(f, outcome, reason) {
    if (f.done) return;
    f.done = true;
    f.outcome = outcome;
    f.doneReason = reason;
    emit(f, 'done', { outcome: outcome, reason: reason });
  }

  function setStamp(f, stamp) {
    f.stamp = stamp;
    f.score = grade.score(stamp, f.fpm, f.dxAim, f.rw.length);
    emit(f, 'stamp', { stamp: stamp, fpm: f.fpm, score: f.score });
    if (!grade.isClean(stamp)) finish(f, 'fail', stamp);
  }

  /** Aerodynamic forces at the current state; writes accelerations into f.ax, f.az. */
  function forces(f, hr, onGround) {
    var ac = f.ac;
    // The air's layers follow the runway plane, so the surface shear is the same on an uphill strip.
    var w = wind.sample(f.air, f.x, f.h - airports.baseAt(f.ap, f.rw, f.x), f.t, f.wind);
    var vax = f.vx - w.wx;
    var vaz = f.vz - w.wz;
    var V = Math.sqrt(vax * vax + vaz * vaz);
    var gamma = Math.atan2(vaz, vax);
    var alpha = f.theta - gamma;
    var ge = clamp(1 - hr / ac.geSpan, 0, 1);
    var cl0 = aircraft.liftCoef(ac, alpha);
    var cl = cl0 * (1 + ac.geLift * ge * ge * ge);
    if (onGround) cl *= f.noseDown ? 0.3 : ac.dumpers; // lift dumpers (jet on contact, all once the nose is down)
    var cd = ac.cd0 + ac.k * (1 - ac.geDrag * ge) * cl0 * cl0;
    var q = ac.kL * V * V;
    var L = q * cl;
    var D = q * cd;
    // The throttle follows the aircraft's profile: it holds the approach speed with a spool-up lag and
    // retards to idle from the retard height down. Past the touchdown zone it closes for good, so a
    // floating aircraft settles onto the runway instead of being held off it all the way to the far end.
    var tCmd = clamp(f.thrustApp + 0.18 * (ac.vref - V), 0, f.thrustApp * 2.5 + 0.6);
    tCmd *= clamp((hr - 0.5) / (ac.retardH - 0.5), 0, 1);
    if (f.x > f.rw.aim + TOUCHDOWN_ZONE * f.rw.length) tCmd = 0;
    if (onGround) tCmd = 0;
    f.throttle += (tCmd - f.throttle) * (1 - Math.exp(-DT / ac.spool));
    var T = f.throttle;
    var ct = Math.cos(f.theta), st = Math.sin(f.theta), cg = Math.cos(gamma), sg = Math.sin(gamma);
    f.ax = T * ct - D * cg - L * sg;
    f.az = T * st - D * sg + L * cg - G;
    f.airspeed = V;
    f.alpha = alpha;
    f.gamma = gamma;
    f.thrust = T;
    f.lift = L;
    f.ge = ge;
  }

  function pitchInAir(f, hold, dt) {
    var ac = f.ac;
    f.p = hold ? Math.min(1, f.p + ac.pUp * dt) : Math.max(0, f.p - ac.pDown * dt);
    var cmd = f.thetaLo + f.p * ac.pitchRange;
    f.theta += (cmd - f.theta) * (1 - Math.exp(-dt / ac.tauPitch));
  }

  function record(f) {
    if (f.t < f.traceNext) return;
    f.traceNext = f.t + 1 / TRACE_HZ;
    f.trace.push(f.t, Math.max(0, f.hr), f.vz);
    if (f.trace.length > TRACE_HZ * 6 * 3) f.trace.splice(0, 3);
  }

  /** The last 4 seconds before touchdown, as [seconds before touchdown, height, sink fpm] triples. */
  function captureFlare(f) {
    var out = [];
    var tc = f.t;
    for (var i = 0; i < f.trace.length; i += 3) {
      var dtb = tc - f.trace[i];
      if (dtb <= 4.0001) out.push(Math.round(dtb * 100) / 100, Math.round(f.trace[i + 1] * 100) / 100, grade.fpmFromMs(-f.trace[i + 2]));
    }
    return out;
  }

  function touchdown(f, hr) {
    var slope = slopeAt(f, f.x);
    var vzRel = f.vz - f.vx * slope;
    f.fpm = grade.fpmFromMs(-vzRel);
    f.dxAim = f.x - f.rw.aim;
    f.contact = { x: f.x, t: f.t, fpm: f.fpm, airspeed: f.airspeed };
    f.contactTheta = f.theta;
    f.flare = captureFlare(f);
    emit(f, 'touch', { fpm: f.fpm, x: f.x });
    // Below the runway surface by more than a step's sink: it flew into the edge before the threshold.
    var intoEdge = f.x >= 0 && f.x < 8 && hr < -0.2;
    if (!airports.isRunway(f.rw, f.x) || intoEdge) {
      f.stampAt = f.t;
      setStamp(f, f.x < 8 ? 'short' : 'overrun');
      return;
    }
    // The gear gives some of a firm landing back as a rebound: a hard arrival springs the aircraft back
    // into the air, and with flying speed left it may climb past the bounce height.
    var e = clamp((f.fpm - 200) / 450, 0, 1) * 0.55;
    var rebound = e * Math.max(0, -vzRel);
    f.h = airports.groundAt(f.ap, f.rw, f.x);
    f.stampAt = f.t + STAMP_DELAY;
    if (rebound > 0.3) {
      f.vz = f.vx * slope + rebound;
      f.h += 0.001;
      f.phase = 'air';
    } else {
      f.vz = f.vx * slope;
      f.phase = 'ground';
    }
  }

  /** One fixed step of 1/120 s. hold: the player's input this step. */
  function step(f, hold) {
    if (f.done) return coast(f);
    var dt = DT;
    var ac = f.ac;
    f.hold = !!hold;
    var ground = airports.groundAt(f.ap, f.rw, f.x);
    var hr = f.h - ground;

    if (f.phase === 'air') {
      var input = hold;
      if (f.gentle && hold && hr < GENTLE_ZONE) {
        var slopeHere = f.x >= 0 && f.x <= f.rw.end ? f.ap.slope : 0;
        var sink = f.vx * slopeHere - f.vz;
        if (sink < Math.max(GENTLE_SINK, hr / GENTLE_TAU)) hold = false;
      }
      pitchInAir(f, hold, dt);
      forces(f, hr, false);
      f.vx += f.ax * dt;
      f.vz += f.az * dt;
      f.x += f.vx * dt;
      f.h += f.vz * dt;
      ground = airports.groundAt(f.ap, f.rw, f.x);
      hr = f.h - ground;
      f.hr = hr;
      if (input) f.maxHeld = Math.max(f.maxHeld, f.p);
      if (input && hr < 8) f.heldInFlare = true;

      var stallMargin = ac.alphaStall - f.alpha;
      f.shaker = stallMargin < 2.5 * aircraft.DEG;
      f.stall = stallMargin < 0;
      f.stalledFor = f.stall ? f.stalledFor + dt : Math.max(0, f.stalledFor - 2 * dt);

      while (f.calloutsLeft.length && hr <= f.calloutsLeft[0] * FT) {
        emit(f, 'callout', { ft: f.calloutsLeft.shift() });
      }

      if (f.contact) {
        if (hr > BOUNCE_HEIGHT && !f.bounced && !f.done) {
          f.bounced = true;
          emit(f, 'bounce', null);
          f.stampAt = f.t;
          setStamp(f, 'bounce');
        }
        if (hr <= 0) {
          f.h = ground;
          f.vz = f.vx * slopeAt(f, f.x);
          f.phase = 'ground';
        }
      } else if (hr <= 0) {
        touchdown(f, hr);
      } else if (f.stalledFor >= STALL_LIMIT) {
        f.fpm = grade.fpmFromMs(-f.vz);
        f.stampAt = f.t;
        setStamp(f, 'stall');
      } else if (f.h > f.h0 * 1.3 + 8) {
        // Climbed away from the approach: a missed approach, ended at once rather than flown out.
        f.fpm = 0;
        f.stampAt = f.t;
        f.dxAim = f.x - f.rw.aim;
        setStamp(f, 'missed');
      } else if (f.x > f.rw.end) {
        f.fpm = 0;
        f.stampAt = f.t;
        f.dxAim = f.x - f.rw.aim;
        setStamp(f, 'overrun');
      }
      record(f);
    } else if (f.phase === 'ground') {
      var slope = slopeAt(f, f.x);
      var slopeAng = Math.atan(slope);
      if (!f.noseDown) {
        if (hold) {
          // Holding keeps the nose up, but no higher than the touchdown attitude, and only for a moment: the
          // elevator loses its grip after a second or as the aircraft slows, the nose wheel comes down by
          // itself and holding then brakes. Letting go first is still the shorter stop.
          f.p = Math.min(1, f.p + ac.pUp * dt);
          var since = f.contact ? f.t - f.contact.t : 0;
          var grip = Math.min(clamp((f.airspeed / ac.vref - 0.7) / 0.22, 0, 1), clamp(2 - since, 0, 1));
          // Only a fast touchdown leaves enough speed to pull the aircraft off the runway again.
          var fast = clamp((f.airspeed / ac.vref - 1) / 0.1, 0, 1);
          var cap = Math.min(slopeAng + ac.tail * grip, f.contactTheta + (1.5 + 4 * fast) * aircraft.DEG);
          var cmd = Math.min(cap, f.thetaLo + f.p * ac.pitchRange);
          f.theta += (cmd - f.theta) * (1 - Math.exp(-dt / ac.tauPitch));
        } else {
          f.p = Math.max(0, f.p - ac.pDown * dt);
          f.theta += (slopeAng - f.theta) * (1 - Math.exp(-dt / 0.22));
        }
        if (f.theta - slopeAng < 0.4 * aircraft.DEG) {
          f.noseDown = true;
          f.theta = slopeAng;
          f.p = 0;
          emit(f, 'nosedown', null);
        }
      } else {
        f.theta = slopeAng;
      }
      forces(f, 0, true);
      var lift = Math.max(0, f.lift);
      var weightOnWheels = clamp(1 - lift / G, 0.15, 1);
      // Under the flare assist, brakes once applied stay on to the stop: a newcomer's short press on the
      // first landings no longer rolls off the end after a clean touchdown.
      f.braking = f.noseDown && (hold || (f.gentle && f.braking));
      var decel = ac.roll * G * weightOnWheels + (f.braking ? ac.brake * weightOnWheels : 0);
      f.vx += (f.ax - decel - 0 * slope) * dt;
      if (f.az > 0.12 * G && !f.noseDown) {
        // Enough lift to leave the runway again.
        f.phase = 'air';
        f.vz += f.az * dt;
      } else {
        f.vz = f.vx * slope;
      }
      if (f.vx < 0) f.vx = 0;
      f.x += f.vx * dt;
      f.h = f.phase === 'ground' ? airports.groundAt(f.ap, f.rw, f.x) : f.h + f.vz * dt;
      f.hr = f.h - airports.groundAt(f.ap, f.rw, f.x);
      f.shaker = false;
      f.stall = false;
      if (!f.done && f.x > f.rw.end && f.vx > 2) {
        f.stampAt = f.t;
        setStamp(f, 'overrun');
      }
    }

    if (f.contact && !f.stamp && f.t >= f.stampAt) {
      setStamp(f, f.bounced ? 'bounce' : grade.classify(f.fpm));
    }
    if (f.stamp && !f.done && f.phase === 'ground' && f.vx < TAXI_SPEED) {
      finish(f, 'clean', 'stopped');
    }
    f.t += dt;
    f.steps++;
    return f;
  }

  /** After the outcome is known the aircraft only coasts to a stop, for the picture; no more events. */
  function coast(f) {
    var dt = DT;
    var ground = airports.groundAt(f.ap, f.rw, f.x);
    if (f.phase === 'air') {
      pitchInAir(f, false, dt);
      forces(f, f.h - ground, false);
      f.vx += f.ax * dt;
      f.vz += f.az * dt;
      f.x += f.vx * dt;
      f.h += f.vz * dt;
      ground = airports.groundAt(f.ap, f.rw, f.x);
      if (f.h <= ground) {
        f.h = ground;
        f.vz = 0;
        f.phase = 'ground';
      }
    } else {
      var slopeAng = Math.atan(slopeAt(f, f.x));
      f.theta += (slopeAng - f.theta) * (1 - Math.exp(-dt / 0.22));
      f.vx = Math.max(0, f.vx - 5 * dt);
      f.x += f.vx * dt;
      f.h = airports.groundAt(f.ap, f.rw, f.x);
      f.vz = 0;
    }
    f.hr = f.h - airports.groundAt(f.ap, f.rw, f.x);
    f.shaker = false;
    f.t += dt;
    f.steps++;
    return f;
  }

  /** Glide path height at x: the butter line. */
  function glideAt(f, x) {
    return f.aimH + (f.rw.aim - x) * Math.tan(f.ac.glide);
  }

  /** PAPI reading from the aircraft's position: 2 white (high), 1 (on slope) or 0 (low). */
  function papi(f) {
    var dist = Math.max(1, f.rw.aim - f.x);
    var angle = Math.atan2(f.h - f.aimH, dist);
    var err = angle - f.ac.glide;
    var band = 0.3 * aircraft.DEG + 0.15 * f.ac.glide;
    if (f.x > f.rw.aim) return 1;
    if (err > band) return 2;
    if (err < -band) return 0;
    return 1;
  }

  return {
    DT: DT,
    APPROACH_SECONDS: APPROACH_SECONDS,
    STAMP_DELAY: STAMP_DELAY,
    TAXI_SPEED: TAXI_SPEED,
    FT: FT,
    createFlight: createFlight,
    step: step,
    glideAt: glideAt,
    papi: papi
  };
});
