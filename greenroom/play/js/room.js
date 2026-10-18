/* The room you are speaking into.

   Two things live here. The bare stage is the app's own picture: a warm cone of
   light standing on dark boards with one microphone in it, the same shape as
   the launcher icon, and it brightens and widens as you project. The three
   audiences are rows of people drawn from circles and curves, lit from the
   stage you are standing on, reacting to how you are doing.

   Nothing here is a score and nothing here is stored. It is a texture: heads
   come up when you vary, phones come out when you flatten, and the sceptical
   room folds its arms until you land something. The moods differ in where they
   start and how much they forgive, not in the arithmetic. */

const Room = (() => {

  // Old WebViews reach this app through the Play Store, but a missing roundRect
  // should soften the drawing rather than stop it.
  if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      r = Math.min(r || 0, Math.abs(w) / 2, Math.abs(h) / 2);
      this.moveTo(x + r, y);
      this.arcTo(x + w, y, x + w, y + h, r);
      this.arcTo(x + w, y + h, x, y + h, r);
      this.arcTo(x, y + h, x, y, r);
      this.arcTo(x, y, x + w, y, r);
      this.closePath();
      return this;
    };
  }

  /* Android maps "animations off" to prefers-reduced-motion. Under it the scene
     holds still, at the middle of its travel, rather than disappearing. */
  const mq = (typeof window !== 'undefined' && window.matchMedia)
    ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduced = () => !!(mq && mq.matches);

  const MOODS = {
    friendly: { base: 0.74, gain: 0.42, decay: 0.10, phones: 0.10, arms: 0.00, nod: 1.0 },
    bored:    { base: 0.30, gain: 0.85, decay: 0.30, phones: 0.75, arms: 0.10, nod: 0.35 },
    hostile:  { base: 0.36, gain: 0.60, decay: 0.22, phones: 0.20, arms: 0.85, nod: 0.30 }
  };

  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  function build(mood, seed) {
    const r = rng(seed || 7);
    const m = MOODS[mood] || MOODS.friendly;
    /* Four rows, not three. A portrait screen is tall enough that three left
       the top half as empty wall, which read as an unfinished picture rather
       than as a dark room; the back row is small, faint and far away, and it
       is what gives the room its depth.

       `at` is where a row sits inside the band the room is allowed, not on the
       screen: the teleprompter takes the top of the screen when it is on, and
       the crowd has to sit under it rather than behind the words. */
    const rows = [
      { n: 11, at: 0.000, s: 0.50, shade: 0.20 },
      { n: 9,  at: 0.302, s: 0.72, shade: 0.36 },
      { n: 7,  at: 0.625, s: 0.98, shade: 0.62 },
      { n: 6,  at: 1.000, s: 1.30, shade: 0.90 }
    ];
    const span = FLOOR - topFrac;
    const people = [];
    rows.forEach((row, ri) => {
      for (let i = 0; i < row.n; i++) {
        const t = (i + 0.5) / row.n;
        people.push({
          row: ri,
          x: t + (r() - 0.5) * 0.060,
          y: topFrac + row.at * span + (r() - 0.5) * 0.012,
          s: row.s * (0.9 + r() * 0.2),
          shade: row.shade,
          hair: Math.floor(r() * 3),
          phase: r() * 6.28,
          breath: 0.7 + r() * 0.6,
          thresh: 0.15 + r() * 0.7,
          attn: m.base,
          phone: r() < m.phones * 0.7 ? 1 : 0,
          arms: r() < m.arms ? 1 : 0,
          lean: 0,
          nod: 0
        });
      }
    });
    people.sort((a, b) => a.row - b.row);
    return people;
  }

  /* ------------------------------------------------------------- the mood */

  // Where the crowd is allowed to sit. The front row is always on the floor;
  // the back row moves down when the teleprompter is covering the top.
  const FLOOR = 0.848;
  let topFrac = 0.36;
  let cv = null, cx = null, people = [], mood = 'friendly';
  let eng = 0.5, target = 0.5, raf = 0, t0 = 0, lastRoll = 0, live = null;
  let W = 0, H = 0, dpr = 1;
  // How big a person is drawn. Normally the short side of the stage; the small
  // previews override it so a 62px tile still shows a crowd rather than dust.
  let sref = 0;
  // The bare stage has one number of its own: how hard the light is being worked.
  let lamp = 0.42;

  function fit() {
    if (!cv) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sref = Math.min(W, H);
  }

  function open(canvas, m, signal, opts) {
    cv = canvas; cx = canvas.getContext('2d');
    mood = m; live = signal || null;
    topFrac = (opts && opts.top) || 0.36;
    people = m === 'none' ? [] : build(m, m.length * 977 + 13);
    eng = target = MOODS[m] ? MOODS[m].base : 0.5;
    lamp = 0.42;
    fit();
    t0 = performance.now();
    lastRoll = 0;
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function close() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0; cv = null; cx = null; people = []; live = null;
  }

  /** Turn the live meters into one number the room believes. */
  function judge(s, dt) {
    const m = MOODS[mood] || MOODS.friendly;
    if (!s) { target = m.base; return; }
    let want = m.base;
    // variety in loudness reads as life
    want += Math.min(0.30, s.dyn * 0.22) * m.gain * 2;
    // a pause after speaking lifts heads; a long silence loses them again
    if (s.silentFor > 0.55 && s.silentFor < 2.6) want += 0.18 * m.gain * 2;
    if (s.silentFor > 6) want -= 0.25;
    // too quiet and the back rows drift
    if (s.level < 0.14) want -= 0.20;
    // a run of very fast speech is hard to stay with
    if (s.wpm && s.wpm > 180) want -= 0.14;
    if (s.wpm && s.wpm >= 105 && s.wpm <= 160) want += 0.08;
    target = Math.max(0.02, Math.min(1, want));
    const k = target > eng ? 0.9 : m.decay * 3;
    eng += (target - eng) * Math.min(1, k * dt);
  }

  function roll() {
    const m = MOODS[mood] || MOODS.friendly;
    for (const p of people) {
      const up = eng > p.thresh;
      p.attn += ((up ? 1 : 0.12) - p.attn) * 0.35;
      // A phone comes out when attention goes, and goes away slowly, because a
      // room that empties its pockets after one good sentence is not a bored room.
      if (m.phones > 0) {
        if (!up && Math.random() < m.phones * 0.30) p.phone = 1;
        if (up && Math.random() < 0.18 * (1 - m.phones)) p.phone = 0;
      }
      if (up && Math.random() < 0.3 * m.nod) p.nod = 1;
      if (!up && Math.random() < 0.25) p.nod = 0;
      p.lean += (((up ? 1 : -1) * (m.arms > 0.5 ? 0.7 : 0.35)) - p.lean) * 0.3;
    }
  }

  /* ------------------------------------------------------- the bare stage */

  /** The app's own picture, drawn from the launcher icon's own coordinates so
      the two are literally the same drawing: a cone of light with one
      microphone standing in it, on an otherwise empty stage.

      `k` is how hard the light is working, 0 to 1, which is your own level.
      `fill` is the share of the box height the mark should take, so the same
      code serves a 66 pixel tile and a whole screen. */
  function stage(w, h, time, k, fill) {
    fill = fill || 0.46;
    const u = Math.min(w * 0.94 / 46, h * fill / 58);
    const cxm = w * 0.5;
    const floorY = h * (fill > 0.7 ? 0.86 : 0.80);
    // icon space to canvas: x 54 and y 76 are the middle of the floor
    const X = x => cxm + (x - 54) * u;
    const Y = y => floorY + (y - 76) * u;

    const g = cx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#14563A');
    g.addColorStop(0.48, '#0B3020');
    g.addColorStop(1, '#04150D');
    cx.fillStyle = g;
    cx.fillRect(0, 0, w, h);

    // the boards
    cx.strokeStyle = 'rgba(26,86,56,0.7)';
    cx.lineWidth = 1;
    cx.beginPath(); cx.moveTo(0, Y(79.5)); cx.lineTo(w, Y(79.5)); cx.stroke();
    cx.strokeStyle = 'rgba(14,54,35,0.9)';
    [90, 100].forEach(v => { cx.beginPath(); cx.moveTo(0, Y(v)); cx.lineTo(w, Y(v)); cx.stroke(); });

    const breath = reduced() ? 1 : 0.965 + 0.035 * Math.sin(time * 1.15);
    const lit = Math.max(0, Math.min(1, k)) * breath;
    const base = 21 * (0.94 + lit * 0.18);

    /* On a whole screen the lamp hangs above the top edge, the way a stage
       light does, so the beam runs the full height. In a small tile the whole
       fitting is drawn, because that is the icon. */
    const wide = fill < 0.6;
    const topY = wide ? -2 : Y(30.6);
    const topHalf = wide ? w * 0.115 : 10 * u;
    const botHalf = wide ? w * 0.37 * (0.94 + lit * 0.18) : base * u;

    // the beam
    const beam = cx.createLinearGradient(0, topY, 0, Y(76));
    beam.addColorStop(0, 'rgba(255,247,230,' + (0.44 + lit * 0.4).toFixed(3) + ')');
    beam.addColorStop(0.24, 'rgba(255,226,180,' + (0.3 + lit * 0.32).toFixed(3) + ')');
    beam.addColorStop(0.66, 'rgba(247,190,96,' + (0.11 + lit * 0.18).toFixed(3) + ')');
    beam.addColorStop(1, 'rgba(245,180,76,0.04)');
    cx.fillStyle = beam;
    cx.beginPath();
    cx.moveTo(cxm - topHalf, topY); cx.lineTo(cxm + topHalf, topY);
    cx.lineTo(cxm + botHalf, Y(76)); cx.lineTo(cxm - botHalf, Y(76));
    cx.closePath();
    cx.fill();

    cx.strokeStyle = 'rgba(255,250,240,' + (0.33 + lit * 0.28).toFixed(3) + ')';
    cx.lineWidth = Math.max(1, u * 0.13);
    cx.beginPath();
    cx.moveTo(cxm - topHalf, topY); cx.lineTo(cxm - botHalf, Y(76));
    cx.moveTo(cxm + topHalf, topY); cx.lineTo(cxm + botHalf, Y(76));
    cx.stroke();

    // the pool it makes on the boards
    const pr = botHalf * 1.06;
    const pool = cx.createRadialGradient(cxm, Y(76), 0, cxm, Y(76), pr);
    pool.addColorStop(0, 'rgba(255,239,216,' + (0.45 + lit * 0.42).toFixed(3) + ')');
    pool.addColorStop(0.4, 'rgba(245,180,76,0.26)');
    pool.addColorStop(1, 'rgba(245,180,76,0)');
    cx.fillStyle = pool;
    cx.beginPath();
    cx.ellipse(cxm, Y(76), pr, Math.max(3, 5.6 * u), 0, 0, 6.2832);
    cx.fill();

    // dust standing in the beam
    if (u > 1.6) {
      cx.fillStyle = '#FFF8EC';
      const span = Y(76) - topY;
      for (let i = 0; i < 7; i++) {
        const yy = topY + ((time * (span / 34) * (0.7 + i * 0.16) + i * span / 7) % span);
        const t = (yy - topY) / span;
        const xx = cxm + Math.sin(i * 1.9 + time * 0.3) * (topHalf + (botHalf - topHalf) * t) * 0.78;
        cx.globalAlpha = 0.5 * (1 - t * 0.55);
        cx.beginPath(); cx.arc(xx, yy, Math.max(0.9, u * 0.13), 0, 6.2832); cx.fill();
      }
      cx.globalAlpha = 1;
    }

    // the microphone: a dark shape standing in the light
    const dark = '#04150C';
    cx.strokeStyle = dark;
    cx.lineCap = 'round';
    cx.lineWidth = 4.8 * u;
    cx.beginPath(); cx.moveTo(X(44), Y(76.6)); cx.lineTo(X(64), Y(76.6)); cx.stroke();
    cx.lineCap = 'butt';
    cx.lineWidth = 5.4 * u;
    cx.beginPath(); cx.moveTo(X(54), Y(75.6)); cx.lineTo(X(54), Y(62)); cx.stroke();
    cx.fillStyle = dark;
    cx.beginPath(); cx.roundRect(X(49.4), Y(59), 9.2 * u, 5.6 * u, 1.8 * u); cx.fill();

    const body = cx.createLinearGradient(X(44.4), Y(33.4), X(63.6), Y(61.8));
    body.addColorStop(0, '#1B4630');
    body.addColorStop(0.4, '#061D11');
    body.addColorStop(1, '#02100A');
    cx.fillStyle = body;
    cx.beginPath(); cx.roundRect(X(44.4), Y(33.4), 19.2 * u, 28.4 * u, 9.6 * u); cx.fill();

    // the grille, drawn as the beam showing through
    cx.strokeStyle = 'rgba(255,235,200,0.30)';
    cx.lineCap = 'round';
    cx.lineWidth = Math.max(0.9, 2.1 * u);
    [44, 49.6, 55.2].forEach(v => {
      cx.beginPath(); cx.moveTo(X(49.6), Y(v)); cx.lineTo(X(58.4), Y(v)); cx.stroke();
    });

    // what the lamp lands on
    cx.strokeStyle = 'rgba(255,235,200,0.95)';
    cx.lineWidth = Math.max(1, 2.6 * u);
    cx.beginPath();
    cx.arc(X(54), Y(45.6), 9 * u, Math.PI * 1.22, Math.PI * 1.78);
    cx.stroke();
    cx.strokeStyle = 'rgba(255,235,200,0.55)';
    cx.lineWidth = Math.max(0.8, 1.5 * u);
    cx.beginPath(); cx.moveTo(X(45.6), Y(75)); cx.lineTo(X(62.4), Y(75)); cx.stroke();
    cx.strokeStyle = 'rgba(191,224,204,0.4)';
    cx.lineWidth = Math.max(0.8, 1.3 * u);
    cx.beginPath(); cx.moveTo(X(52.2), Y(74.8)); cx.lineTo(X(52.2), Y(64.2)); cx.stroke();

    // the lamp: a shade with the lens burning under it
    const ly0 = wide ? -h * 0.03 : Y(22);
    const ly1 = wide ? h * 0.028 : Y(30);
    const lx0 = wide ? topHalf * 0.86 : 7.2 * u;
    const lx1 = wide ? topHalf * 1.14 : 11.6 * u;
    const shade = cx.createLinearGradient(0, ly0, 0, ly1);
    shade.addColorStop(0, '#F6C877');
    shade.addColorStop(1, '#B87418');
    cx.fillStyle = shade;
    cx.beginPath();
    cx.moveTo(cxm - lx0, ly0); cx.lineTo(cxm + lx0, ly0);
    cx.lineTo(cxm + lx1, ly1); cx.lineTo(cxm - lx1, ly1);
    cx.closePath(); cx.fill();
    cx.fillStyle = '#FFFBF0';
    const lensH = wide ? Math.max(3, h * 0.007) : Math.max(1.6, 2.6 * u);
    cx.beginPath(); cx.roundRect(cxm - lx1 * 0.94, ly1 - lensH * 0.55, lx1 * 1.88, lensH, lensH / 2); cx.fill();
  }

  /* --------------------------------------------------------------- drawing */

  function backdrop(w, h) {
    const g = cx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#061710');
    g.addColorStop(0.42, '#0B2A1B');
    g.addColorStop(1, '#04120C');
    cx.fillStyle = g;
    cx.fillRect(0, 0, w, h);

    // the back of the room: a wall the silhouettes can read against, with no
    // edge of its own, because a drawn horizon reads as a seam
    const wall = cx.createRadialGradient(w * 0.5, h * 0.52, 0, w * 0.5, h * 0.52, w * 1.25);
    wall.addColorStop(0, 'rgba(31,102,68,0.34)');
    wall.addColorStop(0.55, 'rgba(20,70,46,0.13)');
    wall.addColorStop(1, 'rgba(20,70,46,0)');
    cx.fillStyle = wall;
    cx.fillRect(0, 0, w, h);

    // the ceiling: the room has a dark top, so the space above the back row
    // reads as depth and the meters have something to sit on
    const ch = h * Math.max(0.18, topFrac - 0.03);
    const ceil = cx.createLinearGradient(0, 0, 0, ch);
    ceil.addColorStop(0, 'rgba(2,11,7,0.86)');
    ceil.addColorStop(0.55, 'rgba(2,11,7,0.36)');
    ceil.addColorStop(1, 'rgba(2,11,7,0)');
    cx.fillStyle = ceil;
    cx.fillRect(0, 0, w, ch);

    // the light you are standing in, spilling off the stage into the front rows
    const spot = cx.createRadialGradient(w * 0.5, h * 1.04, h * 0.05, w * 0.5, h * 1.04, h * 0.95);
    spot.addColorStop(0, 'rgba(245,180,76,0.26)');
    spot.addColorStop(0.5, 'rgba(245,180,76,0.08)');
    spot.addColorStop(1, 'rgba(245,180,76,0)');
    cx.fillStyle = spot;
    cx.fillRect(0, 0, w, h);
  }

  function person(p, w, h, time) {
    const s = p.s * (sref || Math.min(w, h)) * 0.058;
    const breath = Math.sin(time * 1.1 * p.breath + p.phase) * 0.014 * s;
    const nod = p.nod ? Math.sin(time * 2.3 + p.phase) * 0.09 * s : 0;
    const down = (1 - p.attn) * (p.phone ? 0.30 : 0.16) * s;
    const x = p.x * w + p.lean * s * 0.14;
    const y = p.y * h + breath;

    // Rows further back sit deeper in the dark, which is what gives the room depth.
    const base = 24 + p.shade * 52;
    const rgb = (k) => 'rgb(' + Math.round(base * 0.80 * k) + ',' +
                                Math.round(base * 1.06 * k) + ',' +
                                Math.round(base * 0.92 * k) + ')';
    const body = rgb(1);

    // shoulders
    cx.fillStyle = body;
    cx.beginPath();
    cx.moveTo(x - s * 1.35, y + s * 2.4);
    cx.quadraticCurveTo(x - s * 1.28, y + s * 0.55, x - s * 0.52, y + s * 0.34);
    cx.quadraticCurveTo(x, y + s * 0.16, x + s * 0.52, y + s * 0.34);
    cx.quadraticCurveTo(x + s * 1.28, y + s * 0.55, x + s * 1.35, y + s * 2.4);
    cx.closePath();
    cx.fill();

    // the stage light falls on the near shoulder
    cx.strokeStyle = 'rgba(245,180,76,' + (0.14 + p.shade * 0.26) + ')';
    cx.lineWidth = Math.max(1, s * 0.10);
    cx.beginPath();
    cx.moveTo(x - s * 1.16, y + s * 1.5);
    cx.quadraticCurveTo(x - s * 1.14, y + s * 0.6, x - s * 0.5, y + s * 0.36);
    cx.stroke();

    // folded arms read as a band across the chest
    if (p.arms) {
      cx.fillStyle = rgb(0.66);
      cx.beginPath();
      cx.roundRect(x - s * 1.04, y + s * 1.02, s * 2.08, s * 0.44, s * 0.2);
      cx.fill();
      cx.strokeStyle = 'rgba(245,180,76,' + (0.06 + p.shade * 0.10) + ')';
      cx.lineWidth = Math.max(0.7, s * 0.05);
      cx.beginPath();
      cx.moveTo(x - s * 1.0, y + s * 1.04);
      cx.lineTo(x + s * 1.0, y + s * 1.04);
      cx.stroke();
    }

    // head, sitting clear of the shoulders
    const hy = y - s * 0.52 + down + nod;
    cx.fillStyle = body;
    cx.beginPath();
    cx.arc(x, hy, s * 0.64, 0, 6.2832);
    cx.fill();

    // hair, three silhouettes so the rows do not read as clones
    cx.beginPath();
    if (p.hair === 0) cx.arc(x, hy - s * 0.1, s * 0.65, Math.PI, 0);
    else if (p.hair === 1) { cx.arc(x, hy - s * 0.02, s * 0.72, Math.PI * 1.06, -0.06); }
    else { cx.arc(x, hy - s * 0.16, s * 0.57, Math.PI, 0); }
    cx.closePath();
    cx.fillStyle = rgb(0.58);
    cx.fill();

    // and catches the top of the head
    cx.strokeStyle = 'rgba(245,180,76,' + (0.18 + p.shade * 0.32) + ')';
    cx.lineWidth = Math.max(1, s * 0.10);
    cx.beginPath();
    cx.arc(x, hy, s * 0.64, Math.PI * 1.10, Math.PI * 1.94);
    cx.stroke();

    // a phone is a cold light held at the chest, and it lands on the chin
    if (p.phone) {
      const px = x + s * 0.30, py = y + s * 0.86;
      const g = cx.createRadialGradient(px, py, 0, px, py, s * 1.5);
      g.addColorStop(0, 'rgba(186,224,208,0.34)');
      g.addColorStop(0.45, 'rgba(186,224,208,0.12)');
      g.addColorStop(1, 'rgba(186,224,208,0)');
      cx.fillStyle = g;
      cx.beginPath(); cx.arc(px, py, s * 1.5, 0, 6.2832); cx.fill();
      cx.fillStyle = 'rgba(214,240,228,0.78)';
      cx.beginPath();
      cx.roundRect(px - s * 0.17, py - s * 0.30, s * 0.34, s * 0.52, s * 0.07);
      cx.fill();
      cx.strokeStyle = 'rgba(186,224,208,0.30)';
      cx.lineWidth = Math.max(0.7, s * 0.07);
      cx.beginPath();
      cx.arc(x, hy, s * 0.64, Math.PI * 0.18, Math.PI * 0.72);
      cx.stroke();
    }
  }

  function draw(time) {
    if (!cx) return;
    if (mood === 'none') { stage(W, H, time, lamp, 0.30); return; }
    backdrop(W, H);
    for (const p of people) person(p, W, H, time);
    // the front edge of the room, so the bottom row is seated in something
    const g = cx.createLinearGradient(0, H * 0.90, 0, H);
    g.addColorStop(0, 'rgba(5,15,10,0)');
    g.addColorStop(1, 'rgba(5,15,10,0.62)');
    cx.fillStyle = g;
    cx.fillRect(0, H * 0.90, W, H * 0.10);
  }

  let last = 0;
  function tick(now) {
    raf = requestAnimationFrame(tick);
    if (!cx) return;
    // Freezing travel is right under reduced motion. Deleting the picture is
    // not, so the clock holds at a point mid way through every cycle.
    const time = reduced() ? 1.35 : (now - t0) / 1000;
    const dt = Math.min(0.1, (now - last) / 1000 || 0.016);
    last = now;
    if (cv.clientWidth !== W || cv.clientHeight !== H) fit();
    const s = live ? live() : null;
    if (mood === 'none') {
      // the lamp answers your voice: it is the only feedback a bare stage gives
      const want = s ? Math.max(0, Math.min(1, s.level * 0.9 + (s.silentFor > 0.7 ? 0.10 : 0))) : 0.42;
      lamp += (want - lamp) * Math.min(1, 3.2 * dt);
    } else {
      judge(s, dt);
      if (now - lastRoll > 900) { lastRoll = now; roll(); }
    }
    draw(time);
  }

  /* ---------------------------------------------------- the small previews */

  function preview(canvas, m) {
    const c = canvas.getContext('2d');
    const d = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || 150, h = canvas.clientHeight || 66;
    canvas.width = Math.round(w * d); canvas.height = Math.round(h * d);
    c.setTransform(d, 0, 0, d, 0, 0);
    const saveCx = cx, saveW = W, saveH = H, savePeople = people, saveRef = sref;
    cx = c; W = w; H = h; sref = Math.min(w, h * 1.9);
    if (m === 'none') {
      stage(w, h, 1.35, 0.55, 0.82);
    } else {
      // the tile is 66 pixels tall: the far row would be three pixels of dust
      const wasTop = topFrac;
      topFrac = 0.36;
      people = build(m, m.length * 977 + 13).filter(p => p.row > 0);
      topFrac = wasTop;
      const mm = MOODS[m];
      for (const p of people) { p.attn = mm.base; p.nod = 0; p.lean = 0; p.y = p.y * 0.80 + 0.20; }
      const wasMood = mood;
      mood = m;
      draw(0.4);
      mood = wasMood;
    }
    cx = saveCx; W = saveW; H = saveH; people = savePeople; sref = saveRef;
  }

  return { open, close, preview, engagement: () => eng, MOODS };
})();
