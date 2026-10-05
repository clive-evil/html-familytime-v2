// Internal analytics abstraction. Local-only for QA; designed so a CrazyGames
// or mobile analytics adapter can be plugged in later via addSink().
const KEY = 'bowlingsmash.analytics';
const CAP = 3000;

export class Analytics {
  constructor({ memory = false, debug = false } = {}) {
    this.memory = memory;
    this.debug = debug;
    this.sinks = [];
    this.sessionId = Math.random().toString(36).slice(2, 10);
    this.buffer = [];
    if (!memory) {
      try { this.buffer = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { this.buffer = []; }
    }
  }

  addSink(fn) { this.sinks.push(fn); }

  track(event, fields = {}) {
    const e = { event, t: Date.now(), session: this.sessionId, ...fields };
    this.buffer.push(e);
    if (this.buffer.length > CAP) this.buffer.splice(0, this.buffer.length - CAP);
    if (!this.memory) {
      try { localStorage.setItem(KEY, JSON.stringify(this.buffer)); } catch { /* */ }
    }
    if (this.debug) console.debug('[analytics]', event, fields);
    for (const s of this.sinks) { try { s(e); } catch { /* sink errors never break the game */ } }
    return e;
  }

  events(name) { return name ? this.buffer.filter((e) => e.event === name) : this.buffer.slice(); }
  clear() { this.buffer = []; if (!this.memory) try { localStorage.removeItem(KEY); } catch { /* */ } }
}
