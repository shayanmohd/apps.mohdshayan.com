/* Getting things out of the phone and back in again. There is no server, so a pack is a file:
   you send it, someone else opens it, and their copy merges with yours. That is the whole
   pooling mechanism, and it is deliberately something you do by hand. */
const N = (() => {
  const has = () => typeof window.Native !== 'undefined' && window.Native;
  return {
    isNative: () => { try { return !!(has() && Native.isNative()); } catch (e) { return false; } },
    buzz(ms, amp) {
      if (!Store.settings().haptics) return;
      try { if (has() && Native.vibrate) Native.vibrate(ms, amp || 150); }
      catch (e) {}
    },
    pattern(arr, amp) {
      if (!Store.settings().haptics) return;
      try { if (has() && Native.vibratePattern) Native.vibratePattern(JSON.stringify(arr), amp || 160); }
      catch (e) {}
    },
    shareText(subject, text) {
      try { if (has() && Native.shareText) { Native.shareText(subject, text); return true; } } catch (e) {}
      if (navigator.share) { navigator.share({ title: subject, text }).catch(() => {}); return true; }
      return false;
    },
    saveFile(name, mime, base64) {
      try { if (has() && Native.saveFile) return Native.saveFile(name, mime, base64) || ''; } catch (e) {}
      return '';
    },
    shareUri(uri, mime) {
      try { if (has() && Native.shareUri) { Native.shareUri(uri, mime); return true; } } catch (e) {}
      return false;
    }
  };
})();

const Share = (() => {

  function b64ofString(s) {
    const bytes = new TextEncoder().encode(s);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    return btoa(bin);
  }

  function fileName(title) {
    const d = new Date();
    const stamp = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const slug = (title || 'places').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
    return 'doorway-' + (slug || 'places') + '-' + stamp + '.json';
  }

  /* Build a pack. Photographs are large, so they only travel when asked for. */
  async function buildPack(opts) {
    const pack = Store.exportPack(opts);
    if (opts && opts.photos) {
      const media = {};
      for (const s of pack.surveys) {
        for (const p of (s.photos || [])) {
          if (media[p.media]) continue;
          const b = await Photos.base64(p.media);
          if (b) media[p.media] = b;
          else p.media = null;
        }
        s.photos = (s.photos || []).filter(p => p.media);
      }
      pack.media = media;
    } else {
      for (const s of pack.surveys) s.photos = [];
    }
    const json = JSON.stringify(pack);
    return { pack, json, bytes: new TextEncoder().encode(json).length };
  }

  /* Write it where the person can find it, then offer it to the share sheet.
     In a browser there is no share sheet, so it becomes an ordinary download. */
  async function deliver(json, title) {
    const name = fileName(title);
    const b64 = b64ofString(json);
    const uri = N.saveFile(name, 'application/json', b64);
    if (uri) {
      N.shareUri(uri, 'application/json');
      return { ok: true, name, native: true };
    }
    try {
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      return { ok: true, name, native: false };
    } catch (e) { return { ok: false, name, error: e.message }; }
  }

  async function ingest(text) {
    let pack;
    try { pack = JSON.parse(text); }
    catch (e) { throw new Error('That did not read as a Doorway pack. It should be a file ending in .json.'); }
    const result = Store.importPack(pack);
    if (pack.media) {
      let n = 0;
      for (const id of Object.keys(pack.media)) {
        const r = await Photos.putBase64(pack.media[id]);
        if (r) n++;
      }
      result.photosStored = n;
    }
    return result;
  }

  function readFile(file) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result || ''));
      fr.onerror = () => rej(new Error('That file could not be read.'));
      fr.readAsText(file);
    });
  }

  /* One place, written out in words, for a message to somebody who does not have the app. */
  function placeText(place) {
    const c = Store.compose(place.id);
    const lines = [place.name + (place.area ? ', ' + place.area : '')];
    const fresh = Store.freshness(c.lastAt);
    lines.push(fresh.k === 'none' ? 'Not surveyed yet.' : fresh.label + ', ' + c.surveyCount + (c.surveyCount === 1 ? ' survey.' : ' surveys.'));
    for (const g of Store.GROUPS) {
      const rows = Store.FACTS.filter(f => f.g === g.g && c.facts[f.k]);
      if (!rows.length) continue;
      lines.push('');
      lines.push(g.title.toUpperCase());
      for (const f of rows) lines.push('  ' + f.label + ': ' + Store.say(f.k, c.facts[f.k].v));
    }
    if (place.note) { lines.push(''); lines.push('Note: ' + place.note); }
    lines.push('');
    lines.push('Recorded in Doorway. Facts are what a person saw on the date given, not a guarantee.');
    return lines.join('\n');
  }

  return { buildPack, deliver, ingest, readFile, placeText, fileName };
})();
