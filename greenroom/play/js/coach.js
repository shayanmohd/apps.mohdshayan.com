/* The coach. It reads the numbers the analysis produced and says at most two
   things, because a list of eleven corrections is a way of saying nothing.

   Rules of the voice, held deliberately: name the moment and the clock time so
   you can go and hear it; give one instruction you could act on in the next
   take; never use the words failed, poor, weak, bad or wrong; and always leave
   with something that is working, because the next take has to happen. */

const Coach = (() => {

  function mmss(t) {
    t = Math.max(0, Math.round(t));
    return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
  }

  /* --------------------------------------------------------- the candidates */

  function candidates(sig, ctx) {
    const s = sig.stats;
    const out = [];
    const speechMin = Math.max(0.2, s.speechSec / 60);

    // 1. a stretch where the pace ran away
    if (sig.fast && sig.fast.length) {
      const worst = sig.fast.slice().sort((a, b) => b.wpm * b.len - a.wpm * a.len)[0];
      out.push({
        family: 'pace',
        score: 0.55 + Math.min(0.4, (worst.wpm - 150) / 120) + Math.min(0.2, worst.len / 90),
        title: 'You speed up at ' + mmss(worst.at),
        body: 'From ' + mmss(worst.at) + ' you run at about ' + worst.wpm + ' words a minute for '
            + Math.round(worst.len) + ' seconds, against ' + s.wpm + ' across the take. A room follows '
            + 'the fast part least well, and it is usually the part you know best. Mark that passage and '
            + 'take it at the speed of the opening.',
        at: worst.at
      });
    }

    // 2. overall pace, either direction
    if (s.wpm > 168) {
      out.push({
        family: 'pace',
        score: 0.5 + Math.min(0.45, (s.wpm - 168) / 70),
        title: 'The whole take is at a run',
        body: 'You averaged about ' + s.wpm + ' words a minute. Comfortable listening sits nearer 130. '
            + 'Try the next take with one instruction only: finish every sentence before starting the next one.',
        at: sig.t0 + 2
      });
    } else if (s.wpm < 98 && s.speechSec > 40) {
      out.push({
        family: 'pace',
        score: 0.42 + Math.min(0.3, (98 - s.wpm) / 60),
        title: 'There is room to pick it up',
        body: 'About ' + s.wpm + ' words a minute across the take. That is deliberate, which suits a defence '
            + 'and drags in a toast. If the material is familiar, let the easy passages move.',
        at: sig.t0 + 2
      });
    }

    // 3. the bravery of silence
    if (s.bravePerMin < 1.2 && s.speechSec > 35) {
      const cand = (sig.pauses || []).filter(p => p.len >= 0.5).sort((a, b) => b.len - a.len)[0];
      out.push({
        family: 'pause',
        score: 0.62 + Math.min(0.3, (1.2 - s.bravePerMin) * 0.4),
        title: 'Almost nothing is allowed to land',
        body: 'You took ' + s.braveCount + ' pause' + (s.braveCount === 1 ? '' : 's')
            + ' of a second or more in ' + Math.round(s.speechSec) + ' seconds. Silence before a line is how '
            + 'an audience knows the line matters. Pick your two best sentences and put a full second in front of each.',
        at: cand ? cand.at : sig.t0 + 5
      });
    }

    // 4. a gap long enough that it reads as a hunt
    if (s.longestPause >= 3.4) {
      const p = sig.pauses.slice().sort((a, b) => b.len - a.len)[0];
      out.push({
        family: 'pause',
        score: 0.45 + Math.min(0.35, (p.len - 3.4) / 8),
        title: 'A ' + p.len.toFixed(1) + ' second gap at ' + mmss(p.at),
        body: 'Long enough that a room starts to wonder. If you were reaching for the next line, that is a '
            + 'note for the script rather than for you: write the first four words of the section after it, '
            + 'and rehearse the join on its own.',
        at: p.at
      });
    }

    // 5. flat stretches
    if (sig.mono && sig.mono.length) {
      const m = sig.mono.slice().sort((a, b) => b.len - a.len)[0];
      out.push({
        family: 'pitch',
        score: 0.5 + Math.min(0.35, m.len / 80),
        title: Math.round(m.len) + ' seconds on one note from ' + mmss(m.at),
        body: 'Your voice holds nearly still through there. It is almost always the passage you have said '
            + 'most often. Try telling that part to one person instead of a room, and let the sentence that '
            + 'matters most start higher than the one before it.',
        at: m.at
      });
    } else if (s.semiSd !== null && s.semiSd < 1.5 && s.speechSec > 30) {
      out.push({
        family: 'pitch',
        score: 0.44 + (1.5 - s.semiSd) * 0.25,
        title: 'The voice stays close to one note',
        body: 'Across the take your pitch moves about ' + s.semiSd.toFixed(1) + ' semitones either side of '
            + 'centre. Two to four is the range that keeps a room awake. The cheapest fix is a question: '
            + 'ask one out loud in the middle and your voice moves on its own.',
        at: sig.t0 + 8
      });
    }

    // 6. quiet stretches, judged against your own level
    if (sig.quiet && sig.quiet.length && s.quietSec >= 6) {
      const q = sig.quiet.slice().sort((a, b) => b.len - a.len)[0];
      out.push({
        family: 'level',
        score: 0.46 + Math.min(0.3, s.quietSec / 40),
        title: 'You drop away at ' + mmss(q.at),
        body: Math.round(q.len) + ' seconds noticeably quieter than the rest of you. In a real room that is '
            + 'the back three rows losing the thread. Whatever you were saying there, say it to the far wall.',
        at: q.at
      });
    }

    // 7. sentence endings falling off
    if (s.endDrop >= 4.5 && s.speechSec > 45) {
      out.push({
        family: 'level',
        score: 0.4 + Math.min(0.28, (s.endDrop - 4.5) / 12),
        title: 'The last stretch fades',
        body: 'Your closing minute sits about ' + s.endDrop.toFixed(0) + ' decibels under the rest of the take. '
            + 'Endings are where a room decides how it felt. Give the final three sentences the volume you '
            + 'gave the opening.',
        at: Math.max(sig.t0, sig.t1 - Math.max(20, (sig.t1 - sig.t0) * 0.12))
      });
    }

    // 8. length against the target
    const target = ctx.speech && ctx.speech.targetMin;
    if (target) {
      const over = s.dur / 60 - target;
      if (over > Math.max(0.6, target * 0.08)) {
        out.push({
          family: 'shape',
          score: 0.5 + Math.min(0.35, over / (target * 0.6)),
          title: 'Over by ' + fmtMin(over * 60),
          body: 'You planned ' + fmtMin(target * 60) + ' and this take ran ' + fmtMin(s.dur) + '. Cutting is faster '
              + 'than speeding up, and it is the only one of the two an audience enjoys. Find the section you '
              + 'would keep if you had half the time.',
          at: sig.t1 - 10
        });
      } else if (over < -Math.max(1, target * 0.25)) {
        out.push({
          family: 'shape',
          score: 0.35,
          title: 'Well inside your ' + fmtMin(target * 60),
          body: 'This take ran ' + fmtMin(s.dur) + '. You have room to slow the passages that matter and to '
              + 'let two or three of them breathe.',
          at: sig.t1 - 10
        });
      }
    }

    // 9. fillers, but only ones you marked yourself
    const marks = (ctx.marks || []).slice().sort((a, b) => a - b);
    if (marks.length >= 4) {
      const per = marks.length / speechMin;
      const cl = cluster(marks);
      out.push({
        family: 'filler',
        score: 0.52 + Math.min(0.3, (per - 2) / 8),
        title: 'You marked ' + marks.length + ' fillers, ' + per.toFixed(1) + ' a minute',
        body: (cl ? 'Half of them fall between ' + mmss(cl[0]) + ' and ' + mmss(cl[1]) + '. Fillers gather '
                  + 'where the next sentence is not decided yet, so that passage is really a scripting note. '
                : 'They are spread evenly, which usually means habit rather than hesitation. ')
            + 'The replacement for a filler is not a faster start. It is a closed mouth for half a second.',
        at: cl ? cl[0] : marks[0]
      });
    }

    return out;
  }

  /** Plain English for a duration. A twelve second take is twelve seconds, not
      "0 minutes 12 seconds", and one of anything is singular. */
  function fmtMin(sec) {
    const t = Math.max(0, Math.round(sec));
    const m = Math.floor(t / 60), s = t % 60;
    const mm = m ? m + (m === 1 ? ' minute' : ' minutes') : '';
    const ss = s ? s + (s === 1 ? ' second' : ' seconds') : '';
    if (mm && ss) return mm + ' ' + ss;
    return mm || ss || '0 seconds';
  }

  /** The tightest window holding half the marks, if there is a real cluster. */
  function cluster(marks) {
    const half = Math.ceil(marks.length / 2);
    let best = null;
    for (let i = 0; i + half - 1 < marks.length; i++) {
      const a = marks[i], b = marks[i + half - 1];
      if (!best || b - a < best[1] - best[0]) best = [a, b];
    }
    if (!best) return null;
    const span = best[1] - best[0];
    const total = marks[marks.length - 1] - marks[0];
    return (total > 20 && span < total * 0.4) ? best : null;
  }

  /* ------------------------------------------------------------- the keeper */

  function keeper(sig, ctx) {
    const s = sig.stats;
    if (s.bravePerMin >= 2) return ['The pauses.', 'You took ' + s.braveCount + ' of a second or more. That is a speaker who trusts the room.'];
    if (s.semiSd !== null && s.semiSd >= 2.4) return ['The life in it.', 'Your pitch moves about ' + s.semiSd.toFixed(1) + ' semitones either side of centre, which is what keeps a room looking up.'];
    if (s.wpm >= 112 && s.wpm <= 152) return ['The pace.', 'About ' + s.wpm + ' words a minute, held steady. That is a comfortable speed to be listened to at.'];
    if (s.dynRange >= 12) return ['The dynamics.', 'You are not saying everything at one volume, and a room notices that before it notices anything else.'];
    if (s.quietSec < 2 && s.endDrop < 3) return ['The level.', 'You held your volume from the first line to the last, which is rarer than it sounds.'];
    return ['You did the take.', 'The rehearsal that happens beats the one you plan. Come back tomorrow and do another.'];
  }

  /* ------------------------------------------------------------ the headline */

  function headline(sig, ctx) {
    const s = sig.stats, n = ctx.takeNumber || 1;
    const prev = ctx.prev && ctx.prev.sig ? ctx.prev.sig.stats : null;
    const label = 'Take ' + n;

    if (!prev) {
      if (n === 1) return [label + '. Here is your baseline.', 'Everything below is measured against this take from now on.'];
      return [label + '.', 'Two notes, and one thing worth keeping.'];
    }
    const gains = [];
    if (prev.wpm > 155 && s.wpm < prev.wpm - 8) gains.push(['Steadier than last time.', 'You came down from ' + prev.wpm + ' words a minute to ' + s.wpm + '.']);
    if (prev.monoSec && s.monoSec !== null && s.monoSec < prev.monoSec * 0.6) gains.push(['A lot less flat than last time.', 'Flat stretches down from ' + Math.round(prev.monoSec) + ' seconds to ' + Math.round(s.monoSec) + '.']);
    if (s.semiSd !== null && prev.semiSd !== null && s.semiSd > prev.semiSd + 0.35) gains.push(['More alive than the last one.', 'Your pitch moves ' + s.semiSd.toFixed(1) + ' semitones now, against ' + prev.semiSd.toFixed(1) + ' last time.']);
    if (s.braveCount > prev.braveCount) gains.push(['Braver with silence.', 'You took ' + s.braveCount + ' pauses over a second, up from ' + prev.braveCount + '.']);
    if (prev.quietSec > 6 && s.quietSec < prev.quietSec * 0.6) gains.push(['You held your level this time.', 'The quiet stretches are down from ' + Math.round(prev.quietSec) + ' seconds to ' + Math.round(s.quietSec) + '.']);

    if (gains.length) return [label + '. ' + gains[0][0], gains[0][1]];
    if (Math.abs(s.wpm - prev.wpm) <= 6 && Math.abs(s.braveCount - prev.braveCount) <= 1) {
      return [label + '. Very close to the last one.', 'Same pace, same pauses. A repeatable take is worth more than a lucky one.'];
    }
    return [label + '.', 'Two things to try, and one to keep.'];
  }

  /* ------------------------------------------------------------------ public */

  function notes(sig, ctx) {
    ctx = ctx || {};
    const cands = candidates(sig, ctx).sort((a, b) => b.score - a.score);
    const picked = [];
    const seen = {};
    for (const c of cands) {
      if (picked.length >= 2) break;
      if (seen[c.family]) continue;
      seen[c.family] = 1;
      picked.push({ family: c.family, title: c.title, body: c.body, at: +Math.max(0, c.at).toFixed(2) });
    }
    const h = headline(sig, ctx);
    const k = keeper(sig, ctx);
    return { headline: h[0], sub: h[1], priorities: picked, keepTitle: k[0], keepBody: k[1] };
  }

  return { notes, mmss };
})();
