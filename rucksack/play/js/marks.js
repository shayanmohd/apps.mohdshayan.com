/* Rucksack: everything drawn as SVG rather than typed as a glyph.
   One stroke weight (1.6 at a 24 grid), round caps, round joins, no emoji and
   no icon font anywhere in the app.

   The centrepiece is `ribbon()`: the whole 3,500 km road as a band of contour
   lines with the walked part inked across them toward a low sun. It is the same
   idea as the launcher icon, at a size you can read a journey in. */
var Marks = (function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  function svg(view, cls) {
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', view);
    s.setAttribute('fill', 'none');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('focusable', 'false');
    if (cls) s.setAttribute('class', cls);
    return s;
  }
  function el(name, attrs) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }
  function stroked(s) {
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '1.6');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    return s;
  }

  /* ------------------------------------------------------------- tab icons
     Five marks on the same 24 grid: a tent over the ground, contour lines, a
     sewn journal, a pack with a flap, and a counted column. */
  var ICON = {
    camp: ['M2.5 20h19', 'M12 5.6 5.6 20', 'm12 5.6 6.4 14.4', 'M12 13.2 8.6 20', 'M12 13.2l3.4 6.8'],
    map: ['M2.6 16.4c3.4-3.4 6-4.8 9.4-4.8s6 1.4 9.4 4.8',
          'M4.4 20.4c2.8-2.6 4.9-3.7 7.6-3.7s4.8 1.1 7.6 3.7',
          'M5.2 11.4c2.6-2.9 4.6-4.2 6.8-4.2s4.2 1.3 6.8 4.2',
          'M8.4 6.6c1.4-1.4 2.3-2 3.6-2s2.2.6 3.6 2'],
    journal: ['M6 3.4h10.6a2 2 0 0 1 2 2v15.2H8a2 2 0 0 1-2-2z',
              'M6 3.4a2 2 0 0 0-2 2v13.2a2 2 0 0 1 2-2',
              'M10.4 8.4h4.8', 'M10.4 12.2h4.8'],
    pack: ['M6.6 9.6a5.4 5.4 0 0 1 10.8 0v10.8H6.6z',
           'M9.6 9.6V6.8a2.4 2.4 0 0 1 4.8 0v2.8',
           'M6.6 14.6h10.8', 'M10.6 17.6h2.8'],
    ledger: ['M4.6 20.4V9.8', 'M9.6 20.4V5.6', 'M14.4 20.4v-8.4', 'M19.4 20.4V8.2', 'M2.6 20.4h18.8']
  };

  /* Small marks used in the chrome. */
  var GLYPH = {
    plus: ['M12 6.4v11.2', 'M6.4 12h11.2'],
    minus: ['M6.4 12h11.2'],
    you: ['M12 3.6v3.2', 'M12 17.2v3.2', 'M3.6 12h3.2', 'M17.2 12h3.2', 'M12 9.8a2.2 2.2 0 1 0 .01 0'],
    all: ['M4 8.4V4h4.4', 'M15.6 4H20v4.4', 'M20 15.6V20h-4.4', 'M8.4 20H4v-4.4'],
    close: ['M6.6 6.6l10.8 10.8', 'M17.4 6.6L6.6 17.4'],
    down: ['M12 4.6v11.6', 'm7.4 11.8 4.6 4.6 4.6-4.6', 'M5 19.4h14']
  };

  function icon(name, size) {
    var paths = ICON[name] || GLYPH[name];
    if (!paths) return null;
    var s = stroked(svg('0 0 24 24'));
    if (size) { s.setAttribute('width', size); s.setAttribute('height', size); }
    for (var i = 0; i < paths.length; i++) s.appendChild(el('path', { d: paths[i] }));
    return s;
  }
  function iconHtml(name) {
    var s = icon(name);
    return s ? s.outerHTML : '';
  }

  /* -------------------------------------------------------------- the ribbon
     A band of contour lines with the road inked across them. The walked part is
     solid ink, the rest is a faint dotted line running to a low sun on the
     right, which is Cael. Everything is one path so it stays crisp at any size
     and costs nothing to redraw. */
  var RW = 360, RH = 116;

  function roadY(t) {
    // one long wander across the band, low at the start and climbing at the end
    return 78 - t * 30
      - Math.sin(t * 7.1 + 0.6) * 8.5
      - Math.sin(t * 3.3 + 2.1) * 5.5
      - Math.sin(t * 15.7) * 2.2;
  }
  function roadX(t) { return 16 + t * 328; }
  function roadPath(from, to, step) {
    var d = '', n = Math.max(2, Math.round((to - from) / (step || 0.008)));
    for (var i = 0; i <= n; i++) {
      var t = from + (to - from) * (i / n);
      d += (i ? 'L' : 'M') + roadX(t).toFixed(2) + ' ' + roadY(t).toFixed(2);
    }
    return d;
  }
  function contourPath(k) {
    // contours run parallel to the road, spread out below it and bunched above
    var d = '', n = 44;
    for (var i = 0; i <= n; i++) {
      var t = i / n;
      var lift = k * (11 - k * 0.7);
      var y = roadY(t) + lift + Math.sin(t * 5.4 + k * 1.3) * (2.2 + k * 0.5);
      d += (i ? 'L' : 'M') + roadX(t).toFixed(2) + ' ' + y.toFixed(2);
    }
    return d;
  }

  /** Build the ribbon once. Call `set(fraction, campFraction)` to move it. */
  function ribbon() {
    var s = svg('0 0 ' + RW + ' ' + RH, 'ribbon-svg');
    s.setAttribute('preserveAspectRatio', 'none');

    var defs = el('defs', {});
    var sun = el('radialGradient', { id: 'rk-sun', cx: '0.5', cy: '0.5', r: '0.5' });
    sun.appendChild(el('stop', { offset: '0', 'stop-color': '#F2B24C', 'stop-opacity': '0.62' }));
    sun.appendChild(el('stop', { offset: '0.45', 'stop-color': '#DE9A3A', 'stop-opacity': '0.22' }));
    sun.appendChild(el('stop', { offset: '1', 'stop-color': '#DE9A3A', 'stop-opacity': '0' }));
    defs.appendChild(sun);
    var fade = el('linearGradient', { id: 'rk-fade', x1: '0', y1: '0', x2: '1', y2: '0' });
    fade.appendChild(el('stop', { offset: '0', 'stop-color': '#B8873A', 'stop-opacity': '0.55' }));
    fade.appendChild(el('stop', { offset: '0.7', 'stop-color': '#B8873A', 'stop-opacity': '0.30' }));
    fade.appendChild(el('stop', { offset: '1', 'stop-color': '#B8873A', 'stop-opacity': '0.16' }));
    defs.appendChild(fade);
    s.appendChild(defs);

    // the glow of the low sun, sitting on the right where the road runs out
    var sunEnd = { x: roadX(1), y: roadY(1) };
    s.appendChild(el('circle', { cx: sunEnd.x, cy: sunEnd.y, r: 54, fill: 'url(#rk-sun)', class: 'ribbon-glow' }));

    // contours, behind everything
    var g = el('g', { class: 'ribbon-contours' });
    for (var k = -2; k <= 4; k++) {
      g.appendChild(el('path', {
        d: contourPath(k), stroke: 'url(#rk-fade)',
        'stroke-width': (k === 0 ? 0 : 1), fill: 'none', 'stroke-linecap': 'round'
      }));
    }
    s.appendChild(g);

    // the whole road, faint, then the walked part inked over it
    s.appendChild(el('path', {
      d: roadPath(0, 1), class: 'ribbon-ahead', fill: 'none',
      'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-dasharray': '1 5'
    }));
    var walked = el('path', {
      d: roadPath(0, 0.0001), class: 'ribbon-walked', fill: 'none',
      'stroke-width': '2.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round'
    });
    s.appendChild(walked);

    // the sun disc, half over the horizon of the last contour
    s.appendChild(el('circle', { cx: sunEnd.x, cy: sunEnd.y, r: 7.4, class: 'ribbon-sun' }));

    // the camp you struck this morning, and where you are now
    var camp = el('path', { d: 'M0 0', class: 'ribbon-camp', 'stroke-width': '1.6', fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    s.appendChild(camp);
    var here = el('g', { class: 'ribbon-here' });
    here.appendChild(el('circle', { r: 6.2, class: 'ribbon-here-ring' }));
    here.appendChild(el('circle', { r: 3.4, class: 'ribbon-here-dot' }));
    s.appendChild(here);

    function set(f, campF) {
      f = Math.max(0, Math.min(1, f || 0));
      walked.setAttribute('d', roadPath(0, Math.max(0.0006, f)));
      var p = { x: roadX(f), y: roadY(f) };
      here.setAttribute('transform', 'translate(' + p.x.toFixed(2) + ' ' + p.y.toFixed(2) + ')');
      if (campF === null || campF === undefined || campF <= 0.0005) {
        camp.setAttribute('d', 'M0 0');
      } else {
        var cf = Math.max(0, Math.min(1, campF));
        var cx = roadX(cf), cy = roadY(cf);
        camp.setAttribute('d', 'M' + (cx - 4.4).toFixed(2) + ' ' + (cy + 3.6).toFixed(2) +
          'L' + cx.toFixed(2) + ' ' + (cy - 4.6).toFixed(2) +
          'L' + (cx + 4.4).toFixed(2) + ' ' + (cy + 3.6).toFixed(2) + 'Z');
      }
    }
    return { node: s, set: set };
  }

  /* ------------------------------------------------------- the app's own mark
     The launcher icon, drawn with the same numbers: contour lines, a road
     winding across them, and a low sun at the end of it. */
  var MARK_CONT = [
    'M-3.0 59.5Q3.3 60.5 6.5 61.0Q9.7 61.5 12.8 62.0Q16.0 62.5 19.1 63.0Q22.3 63.4 25.5 63.8Q28.7 64.1 31.9 64.3Q35.0 64.6 38.1 64.7Q41.3 64.7 44.5 64.6Q47.7 64.4 50.9 64.0Q54.0 63.5 57.1 62.8Q60.3 62.1 63.5 61.1Q66.7 60.1 69.8 58.9Q73.0 57.7 76.2 56.5Q79.3 55.2 82.5 53.9Q85.7 52.6 88.8 51.5Q92.0 50.3 95.2 49.5Q98.3 48.6 101.5 48.1Q104.7 47.6 107.8 47.5T111.0 47.5',
    'M-3.0 68.8Q3.3 70.1 6.5 70.7Q9.7 71.2 12.8 71.7Q16.0 72.2 19.1 72.6Q22.3 72.9 25.5 73.3Q28.7 73.6 31.9 73.8Q35.0 74.0 38.1 74.0Q41.3 74.1 44.5 74.0Q47.7 73.9 50.9 73.5Q54.0 73.0 57.1 72.2Q60.3 71.4 63.5 70.3Q66.7 69.2 69.8 67.8Q73.0 66.3 76.2 64.7Q79.3 63.0 82.5 61.4Q85.7 59.7 88.8 58.2Q92.0 56.6 95.2 55.4Q98.3 54.2 101.5 53.5Q104.7 52.9 107.8 52.8T111.0 52.6',
    'M-3.0 79.3Q3.3 81.0 6.5 81.6Q9.7 82.2 12.8 82.7Q16.0 83.1 19.1 83.4Q22.3 83.7 25.5 84.0Q28.7 84.2 31.9 84.4Q35.0 84.6 38.1 84.7Q41.3 84.8 44.5 84.7Q47.7 84.5 50.9 84.1Q54.0 83.7 57.1 82.8Q60.3 82.0 63.5 80.7Q66.7 79.4 69.8 77.7Q73.0 75.9 76.2 73.9Q79.3 71.9 82.5 69.8Q85.7 67.6 88.8 65.7Q92.0 63.7 95.2 62.2Q98.3 60.6 101.5 59.7Q104.7 58.8 107.8 58.6T111.0 58.4',
    'M-3.0 90.9Q3.3 93.0 6.5 93.7Q9.7 94.4 12.8 94.8Q16.0 95.2 19.1 95.5Q22.3 95.7 25.5 95.9Q28.7 96.1 31.9 96.3Q35.0 96.4 38.1 96.5Q41.3 96.5 44.5 96.5Q47.7 96.4 50.9 96.0Q54.0 95.5 57.1 94.6Q60.3 93.7 63.5 92.2Q66.7 90.7 69.8 88.7Q73.0 86.6 76.2 84.2Q79.3 81.7 82.5 79.1Q85.7 76.4 88.8 74.0Q92.0 71.5 95.2 69.5Q98.3 67.6 101.5 66.4Q104.7 65.3 107.8 65.1T111.0 64.9',
    'M-3.0 103.7Q3.3 106.2 6.5 107.0Q9.7 107.8 12.8 108.2Q16.0 108.5 19.1 108.7Q22.3 108.9 25.5 109.0Q28.7 109.1 31.9 109.2Q35.0 109.3 38.1 109.4Q41.3 109.5 44.5 109.5Q47.7 109.4 50.9 109.0Q54.0 108.6 57.1 107.6Q60.3 106.6 63.5 104.9Q66.7 103.2 69.8 100.8Q73.0 98.4 76.2 95.5Q79.3 92.5 82.5 89.3Q85.7 86.2 88.8 83.2Q92.0 80.2 95.2 77.8Q98.3 75.4 101.5 74.0Q104.7 72.5 107.8 72.2T111.0 71.9',
    'M-3.0 117.7Q3.3 120.7 6.5 121.6Q9.7 122.4 12.8 122.8Q16.0 123.1 19.1 123.2Q22.3 123.2 25.5 123.3Q28.7 123.3 31.9 123.4Q35.0 123.5 38.1 123.6Q41.3 123.7 44.5 123.7Q47.7 123.6 50.9 123.2Q54.0 122.8 57.1 121.7Q60.3 120.6 63.5 118.7Q66.7 116.8 69.8 114.0Q73.0 111.2 76.2 107.8Q79.3 104.3 82.5 100.5Q85.7 96.8 88.8 93.2Q92.0 89.6 95.2 86.7Q98.3 83.8 101.5 82.0Q104.7 80.3 107.8 80.0T111.0 79.7',
    'M-3.0 132.8Q3.3 136.4 6.5 137.3Q9.7 138.2 12.8 138.5Q16.0 138.8 19.1 138.8Q22.3 138.8 25.5 138.8Q28.7 138.7 31.9 138.8Q35.0 138.8 38.1 138.9Q41.3 139.0 44.5 139.0Q47.7 139.0 50.9 138.6Q54.0 138.2 57.1 137.1Q60.3 135.9 63.5 133.7Q66.7 131.5 69.8 128.3Q73.0 125.1 76.2 121.1Q79.3 117.1 82.5 112.7Q85.7 108.2 88.8 104.0Q92.0 99.8 95.2 96.4Q98.3 93.0 101.5 91.0Q104.7 88.9 107.8 88.5T111.0 88.0'
  ];
  var MARK_ROAD = 'M48.8 94.4L48.4 93.2L47.9 91.9L47.3 90.8L46.6 89.7L45.9 88.7L45.2 87.8L44.5 86.9L43.8 86.2L43.1 85.4L42.5 84.8L41.9 84.2L41.3 83.6L40.7 83.1L40.2 82.5L39.8 82.0L39.3 81.5L38.9 81.0L38.6 80.5L38.3 79.9L38.0 79.3L37.7 78.7L37.5 78.1L37.4 77.9L37.3 77.8L37.3 77.8L37.3 77.6L37.5 77.3L37.8 76.9L38.3 76.4L39.0 75.9L39.8 75.4L40.7 74.9L41.7 74.3L42.8 73.8L43.9 73.2L45.0 72.5L46.1 71.9L47.2 71.1L48.3 70.3L49.3 69.4L50.2 68.4L51.0 67.2L51.7 66.0L52.1 64.7L52.3 63.6L52.3 62.7L52.3 61.8L52.2 60.9L52.0 60.2L51.7 59.4L51.4 58.8L51.1 58.2L50.7 57.6L50.4 57.1L50.0 56.6L49.7 56.2L49.4 55.8L49.2 55.4L48.9 55.0L48.7 54.6L48.6 54.2L48.5 53.8L48.4 53.4L48.4 53.0L48.4 52.5L48.5 51.9L48.7 51.3L49.0 50.8L49.4 50.2L49.8 49.7L50.3 49.2L50.8 48.7L51.4 48.3L52.0 47.8L52.7 47.4L53.4 47.0L54.2 46.6L55.0 46.3L55.8 45.9L56.6 45.6L57.5 45.3L58.4 44.9L59.3 44.6L60.2 44.3L61.1 44.0L62.1 43.7L63.0 43.4L63.9 43.0L63.7 42.2L62.7 42.5L61.8 42.8L60.9 43.1L59.9 43.3L59.0 43.6L58.0 43.9L57.1 44.1L56.2 44.4L55.3 44.7L54.4 45.0L53.6 45.3L52.8 45.6L51.9 46.0L51.2 46.4L50.4 46.8L49.7 47.2L49.0 47.7L48.4 48.3L47.8 48.9L47.2 49.5L46.7 50.3L46.3 51.1L46.0 51.9L45.8 52.6L45.7 53.4L45.7 54.1L45.7 54.8L45.9 55.5L46.0 56.1L46.2 56.7L46.4 57.3L46.7 57.9L46.9 58.4L47.1 58.9L47.3 59.4L47.5 59.8L47.6 60.3L47.7 60.7L47.7 61.1L47.7 61.5L47.7 61.9L47.6 62.3L47.5 62.7L47.3 63.1L47.0 63.8L46.6 64.3L46.2 64.8L45.6 65.3L44.9 65.7L44.1 66.2L43.2 66.7L42.2 67.1L41.2 67.5L40.1 68.0L39.0 68.4L37.8 68.8L36.7 69.3L35.5 69.8L34.4 70.4L33.3 71.1L32.2 72.0L31.2 73.0L30.3 74.3L29.6 75.8L29.3 77.5L29.3 79.1L29.5 80.6L29.7 81.8L30.1 83.1L30.5 84.2L30.9 85.3L31.4 86.4L31.9 87.3L32.5 88.2L33.0 89.1L33.6 89.9L34.1 90.6L34.6 91.4L35.0 92.0L35.4 92.7L35.8 93.3L36.1 93.9L36.4 94.5L36.6 95.1L36.8 95.6L36.9 96.2L37.0 96.8L37.2 97.6Z';
  var MARK_KERB = 'M39.3 81.5L38.9 81.0L38.6 80.5L38.3 79.9L38.0 79.3L37.7 78.7L37.5 78.1L37.4 77.9L37.3 77.8L37.3 77.8L37.3 77.6L37.5 77.3L37.8 76.9L38.3 76.4L39.0 75.9L39.8 75.4L40.7 74.9L41.7 74.3L42.8 73.8L43.9 73.2L45.0 72.5L46.1 71.9L47.2 71.1L48.3 70.3L49.3 69.4L50.2 68.4L51.0 67.2L51.7 66.0L52.1 64.7L52.3 63.6L52.3 62.7L52.3 61.8L52.2 60.9L52.0 60.2L51.7 59.4L51.4 58.8L51.1 58.2L50.7 57.6L50.4 57.1L50.0 56.6L49.7 56.2L49.4 55.8L49.2 55.4L48.9 55.0L48.7 54.6L48.6 54.2L48.5 53.8L48.4 53.4L48.4 53.0L48.4 52.5L48.5 51.9';

  function mark(size) {
    var s = svg('0 0 108 108', 'mark');
    s.setAttribute('width', size || 64);
    s.setAttribute('height', size || 64);
    var d = el('defs', {});
    var halo = el('radialGradient', { id: 'rk-mk-halo', cx: '0.5', cy: '0.5', r: '0.5' });
    halo.appendChild(el('stop', { offset: '0', 'stop-color': '#F6C463', 'stop-opacity': '0.55' }));
    halo.appendChild(el('stop', { offset: '1', 'stop-color': '#EFA43A', 'stop-opacity': '0' }));
    d.appendChild(halo);
    var cont = el('linearGradient', { id: 'rk-mk-cont', x1: '0', y1: '0', x2: '1', y2: '0' });
    cont.appendChild(el('stop', { offset: '0', 'stop-color': '#B8873A', 'stop-opacity': '0.35' }));
    cont.appendChild(el('stop', { offset: '0.5', 'stop-color': '#C08E3C', 'stop-opacity': '0.9' }));
    cont.appendChild(el('stop', { offset: '1', 'stop-color': '#E0A94E', 'stop-opacity': '0.7' }));
    d.appendChild(cont);
    s.appendChild(d);

    s.appendChild(el('circle', { cx: 69, cy: 35, r: 26, fill: 'url(#rk-mk-halo)' }));
    var g = el('g', { stroke: 'url(#rk-mk-cont)', fill: 'none', 'stroke-linecap': 'round' });
    for (var i = 0; i < MARK_CONT.length; i++) {
      g.appendChild(el('path', { d: MARK_CONT[i], 'stroke-width': (1.7 + i * 0.25).toFixed(2) }));
    }
    s.appendChild(g);
    s.appendChild(el('circle', { cx: 69, cy: 35, r: 10, fill: '#E9A83A' }));
    s.appendChild(el('path', { d: MARK_ROAD, fill: '#2F5D50' }));
    s.appendChild(el('path', { d: MARK_KERB, fill: 'none', stroke: '#F3EADA', 'stroke-width': '1.1', 'stroke-linecap': 'round', opacity: '0.5' }));
    return s;
  }

  /* ---------------------------------------------------------- empty states
     Drawn, not described. Each one is the same ink language as the map. */
  function drawing(kind) {
    var s = stroked(svg('0 0 120 84', 'drawn'));
    s.setAttribute('stroke-width', '1.5');
    var g;
    if (kind === 'journal') {
      s.appendChild(el('path', { d: 'M18 20h34a6 6 0 0 1 6 6v40H24a6 6 0 0 1-6-6z' }));
      s.appendChild(el('path', { d: 'M102 20H68a6 6 0 0 0-6 6v40h34a6 6 0 0 0 6-6z' }));
      s.appendChild(el('path', { d: 'M60 26v40', opacity: '0.5' }));
      g = el('g', { opacity: '0.45' });
      g.appendChild(el('path', { d: 'M26 34h20' }));
      g.appendChild(el('path', { d: 'M26 42h24' }));
      g.appendChild(el('path', { d: 'M26 50h14' }));
      s.appendChild(g);
      s.appendChild(el('path', { d: 'M72 46c6-5 11-6 16-3s8 2 14-3', opacity: '0.6' }));
      s.appendChild(el('path', { d: 'M72 54c6-5 12-6 17-3s7 2 13-4', opacity: '0.4' }));
    } else if (kind === 'keeps') {
      s.appendChild(el('path', { d: 'M22 44c0-10 8-18 18-18h40c10 0 18 8 18 18v6c0 10-8 18-18 18H40c-10 0-18-8-18-18z' }));
      s.appendChild(el('path', { d: 'M40 26v-6a8 8 0 0 1 16 0v6', opacity: '0.6' }));
      s.appendChild(el('path', { d: 'M22 47h76', opacity: '0.5' }));
      g = el('g', { opacity: '0.4' });
      g.appendChild(el('circle', { cx: 46, cy: 58, r: 4 }));
      g.appendChild(el('circle', { cx: 62, cy: 58, r: 4 }));
      g.appendChild(el('circle', { cx: 78, cy: 58, r: 4 }));
      s.appendChild(g);
    } else if (kind === 'ledger') {
      s.appendChild(el('path', { d: 'M20 68h80' }));
      g = el('g', { opacity: '0.55' });
      g.appendChild(el('path', { d: 'M32 68V52' }));
      g.appendChild(el('path', { d: 'M48 68V44' }));
      g.appendChild(el('path', { d: 'M64 68V56' }));
      g.appendChild(el('path', { d: 'M80 68V38' }));
      s.appendChild(g);
      s.appendChild(el('path', { d: 'M24 30c8 0 8-10 16-10s8 10 16 10 8-10 16-10 8 10 16 10', opacity: '0.35' }));
    } else if (kind === 'gate') {
      s.appendChild(el('path', { d: 'M36 68V22' }));
      s.appendChild(el('path', { d: 'M84 68V22' }));
      s.appendChild(el('path', { d: 'M30 22h12', opacity: '0.7' }));
      s.appendChild(el('path', { d: 'M78 22h12', opacity: '0.7' }));
      s.appendChild(el('path', { d: 'M16 68h88' }));
      s.appendChild(el('path', { d: 'M52 68c2-10 6-16 8-24s2-12 0-18', opacity: '0.5' }));
      s.appendChild(el('circle', { cx: 60, cy: 34, r: 7, opacity: '0.45' }));
    }
    return s;
  }

  return {
    icon: icon, iconHtml: iconHtml, ribbon: ribbon, mark: mark, drawing: drawing,
    ICON: ICON, GLYPH: GLYPH
  };
})();
