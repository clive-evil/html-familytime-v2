// Optional voice commands via the browser's own speech recognition (Web Speech
// API). No cloud service is added by this game; note that some browsers (e.g.
// Chrome) run their recognition through the vendor's own service.
// The transcript is shown exactly as heard. Dave's mistakes are Dave's, not ours.
import { parsePhrase } from './commands.js';

export function voiceSupported() {
  return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export class Voice {
  constructor({ onCommands, onStatus }) {
    this.onCommands = onCommands; this.onStatus = onStatus;
    this.enabled = false; this.rec = null; this.threshold = 0.45;
  }
  start() {
    if (!voiceSupported()) { this.onStatus?.('unsupported'); return false; }
    if (this.rec) { this.enabled = true; try { this.rec.start(); } catch { /* already */ } return true; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = 'en-GB'; rec.continuous = true; rec.interimResults = false; rec.maxAlternatives = 3;
    rec.onresult = (ev) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (!r.isFinal) continue;
        // take the best alternative that actually contains a command
        let best = null;
        for (let k = 0; k < r.length; k++) {
          const alt = r[k];
          const parsed = parsePhrase(alt.transcript);
          if (parsed.commands.length) { best = { transcript: alt.transcript, confidence: alt.confidence, commands: parsed.commands }; break; }
          if (!best) best = { transcript: alt.transcript, confidence: alt.confidence, commands: [] };
        }
        // Chrome often reports confidence 0 for "unknown"; only distrust explicit low scores
        const conf = best.confidence;
        const low = (conf > 0 && conf < this.threshold) || !best.commands.length;
        this.onCommands?.({ ...best, lowConfidence: low });
      }
    };
    rec.onerror = (e) => { this.onStatus?.(e.error === 'not-allowed' ? 'denied' : 'error:' + e.error); };
    rec.onend = () => { if (this.enabled) { try { rec.start(); } catch { /* ignore */ } } else this.onStatus?.('off'); };
    rec.onstart = () => this.onStatus?.('listening');
    this.rec = rec; this.enabled = true;
    try { rec.start(); } catch { /* ignore */ }
    return true;
  }
  stop() { this.enabled = false; try { this.rec?.stop(); } catch { /* ignore */ } }
}
