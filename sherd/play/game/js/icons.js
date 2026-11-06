/*
 * Sherd's icons: one ink line (1.75 on a 24 grid, round ends), drawn for this game so they match the
 * board's pencil and ink. Static SVG markup, inserted with innerHTML (no script, CSP-safe).
 */
(function (root) {
  'use strict';
  var P = {
    back: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
    pause: '<path d="M9 6v12M15 6v12"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6"/>',
    undo: '<path d="M9 7 5 11l4 4"/><path d="M5 11h9a4.5 4.5 0 0 1 0 9h-3"/>',
    clear: '<path d="M6 6l12 12M18 6 6 18"/>',
    trowel: '<path d="M4.5 19.5 10 14"/><path d="M10 14l2.2-6.6L19.5 4.5l-2.9 7.3L10 14z"/>',
    survey: '<rect x="4" y="4" width="11" height="11" rx="1"/><path d="M7.7 4v11M11.3 4v11M4 7.7h11M4 11.3h11"/><path d="m15.5 15.5 4.5 4.5"/>',
    play: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m10.5 9.5 4 2.5-4 2.5z"/>',
    share: '<path d="M12 4v11"/><path d="m8 8 4-4 4 4"/><path d="M6 12.5v6h12v-6"/>',
    map: '<path d="M4 6.5h16M4 11.5h16M4 16.5h16"/><path d="M8 4.5v4M15 9.5v4M10 14.5v4"/>',
    home: '<path d="M4.5 11 12 4.5l7.5 6.5"/><path d="M6.5 9.5v10h11v-10"/>',
    vessel: '<path d="M9.5 3.5h5M10.3 3.5c0 2.3-4.8 3.6-4.8 8.7 0 4.3 2.7 7.3 6.5 7.3s6.5-3 6.5-7.3c0-5.1-4.8-6.4-4.8-8.7"/><path d="M8 20.5h8"/>',
    calendar: '<rect x="4" y="5.5" width="16" height="14" rx="1.5"/><path d="M4 9.5h16M8.5 3.5v4M15.5 3.5v4"/><path d="M8 13h2M14 13h2M8 16.5h2"/>',
    strata: '<path d="M3.5 8c3-1.5 5 1 8.5-.2S17 6.2 20.5 7.5"/><path d="M3.5 13c3-1.2 5.5 1 8.5-.2s5.5-1.8 8.5-.3"/><path d="M3.5 18c3-1 5.5.8 8.5-.2s5.5-1.4 8.5-.3"/><rect x="10" y="9.2" width="4" height="2.6" rx=".5"/>',
    soundOn: '<path d="M5 9.5h3l4.5-4v13L8 14.5H5z"/><path d="M15.5 9a4 4 0 0 1 0 6M17.8 6.5a7.5 7.5 0 0 1 0 11"/>',
    soundOff: '<path d="M5 9.5h3l4.5-4v13L8 14.5H5z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
    star: '<path d="m12 4.2 2.3 4.9 5.3.6-3.9 3.6 1.1 5.2L12 15.9l-4.8 2.6 1.1-5.2-3.9-3.6 5.3-.6z"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    lock: '<rect x="5.5" y="10.5" width="13" height="9" rx="1.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    next: '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
    retry: '<path d="M18.5 12a6.5 6.5 0 1 1-2-4.7"/><path d="M18.5 4.5v3.8h-3.8"/>',
    mend: '<path d="M6.5 17.5 17.5 6.5"/><path d="M9 6.5 6.5 9M17.5 15 15 17.5M11.5 9l3.5 3.5"/><rect x="3.5" y="3.5" width="17" height="17" rx="3"/>',
    glaze: '<path d="M6 8.5 12 4l6 4.5-2 9.5H8z"/><path d="M9 9.5c2 .8 4 .8 6 0"/>',
    double: '<path d="M7.5 7.5 11 4l3.5 3.5-1.3 5.2h-4.4z"/><path d="M11.5 13.5 15 10l3.5 3.5-1.3 5.2h-4.4z"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.4"/>',
    link: '<path d="M10 14l4-4"/><path d="M8.5 11.5 6.8 13.2a3 3 0 0 0 4.2 4.2l1.7-1.7M15.5 12.5l1.7-1.7a3 3 0 0 0-4.2-4.2l-1.7 1.7"/>',
    shield: '<path d="M12 3.8 5.5 6.3v5.2c0 4 2.8 7 6.5 8.7 3.7-1.7 6.5-4.7 6.5-8.7V6.3z"/>'
  };

  function svg(name, cls) {
    var body = P[name] || '';
    return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + body + '</svg>';
  }

  root.Sherd = root.Sherd || {};
  root.Sherd.icons = { svg: svg, names: Object.keys(P) };
})(this);
