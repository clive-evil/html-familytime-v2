/* Group boon vote — pure logic, used before the boss (lobby) and once mid-fight (battle).
 * Everybody votes; most votes wins; ties are broken by a visible, seeded tie-break spin.
 */
(function (root) {
  'use strict';
  const CW = (root.CW = root.CW || {});

  // Pick N boon ids. `avoid` = ids that must not appear (e.g. the boon already won);
  // `notSameAs` = a previous option set this one must differ from.
  CW.pickBoonOptions = function (rng, { avoid = [], notSameAs = null, n = CW.BOON_VOTE.choices } = {}) {
    const pool = Object.keys(CW.BOON_OPTIONS).filter((b) => !avoid.includes(b));
    for (let tries = 0; tries < 20; tries++) {
      const pick = rng.shuffle(pool).slice(0, n);
      if (!notSameAs || pick.slice().sort().join() !== notSameAs.slice().sort().join()) return pick;
    }
    return pool.slice(0, n);
  };

  class BoonVote {
    // voters: [{ id, isHuman, personality }]
    constructor({ rng, voters, options, k = 1, label = 'PRE-RAID', forceResult = null }) {
      this.rng = rng;
      this.voters = voters;
      this.options = options;
      this.k = k;
      this.label = label;
      this.forceResult = forceResult;
      this.time = 0;
      this.duration = CW.BOON_VOTE.seconds * k;
      this.votes = {};            // voterId → boonId
      this.events = [];
      this.state = 'open';        // open → tiebreak → done
      this.winner = null;
      this.tied = null;
      const [a, b] = CW.BOON_VOTE.botVoteWindow;
      this.botAt = {};
      for (const v of voters) if (!v.isHuman) this.botAt[v.id] = this.rng.range(a, b) * k;
    }
    emit(e) { e.t = this.time; this.events.push(e); }
    drain() { const e = this.events; this.events = []; return e; }
    remaining() { return Math.max(0, this.duration - this.time); }
    counts() {
      const c = Object.fromEntries(this.options.map((o) => [o, 0]));
      for (const b of Object.values(this.votes)) if (b in c) c[b]++;
      return c;
    }
    vote(voterId, boonId) {
      if (this.state !== 'open' || !this.options.includes(boonId)) return false;
      const changed = this.votes[voterId] !== boonId;
      this.votes[voterId] = boonId;
      if (changed) this.emit({ type: 'voteCast', voter: voterId, boon: boonId });
      return true;
    }
    _botChoice(v) {
      const per = CW.BOT_PERSONALITIES[v.personality] || {};
      const prefs = per.boonPrefs || {};
      const c = this.counts();
      return this.rng.weighted(this.options, (o) => 1 + (prefs[o] || 0) + CW.BOON_VOTE.herd * c[o]);
    }
    update(dt) {
      if (this.state === 'done') return;
      this.time += dt;
      if (this.state === 'open') {
        for (const v of this.voters) {
          if (v.isHuman || this.votes[v.id] || this.time < this.botAt[v.id]) continue;
          this.vote(v.id, this._botChoice(v));
        }
        if (this.time >= this.duration) this._close();
      } else if (this.state === 'tiebreak' && this.time >= this.tieEnd) this._finish(this.tieWinner);
    }
    _close() {
      // stragglers (bots that somehow didn't vote) vote now; the human simply abstains
      for (const v of this.voters) if (!v.isHuman && !this.votes[v.id]) this.vote(v.id, this._botChoice(v));
      if (this.forceResult && this.options.includes(this.forceResult)) return this._finish(this.forceResult, true);
      const c = this.counts();
      const max = Math.max(...Object.values(c));
      const top = this.options.filter((o) => c[o] === max);
      if (top.length === 1) return this._finish(top[0]);
      // deterministic (seeded) tie-break spin
      this.tied = top;
      this.tieWinner = this.rng.pick(top);
      this.state = 'tiebreak';
      this.tieEnd = this.time + CW.BOON_VOTE.tieBreakSec * this.k;
      this.emit({ type: 'voteTie', tied: top, winner: this.tieWinner });
    }
    _finish(boon, forced = false) {
      this.state = 'done';
      this.winner = boon;
      this.emit({ type: 'voteEnd', boon, counts: this.counts(), tied: this.tied, forced });
    }
    // skip the timer (debug / tests)
    closeNow() { if (this.state === 'open') { this.time = this.duration; this._close(); } if (this.state === 'tiebreak') this._finish(this.tieWinner); }
  }
  CW.BoonVote = BoonVote;
})(typeof window !== 'undefined' ? window : globalThis);
