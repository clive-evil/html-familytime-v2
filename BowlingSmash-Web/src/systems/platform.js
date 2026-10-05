// Platform integration points (CrazyGames now, mobile later) + SIMULATED
// monetisation. Nothing here shows a real ad or takes real money.
//
// ┌──────────────────────────────────────────────────────────────────────┐
// │ SIMULATED MONETISATION: rewarded "ads" resolve after a short fake     │
// │ overlay so playtesters can feel the flow. Swap `requestRewarded` for  │
// │ the CrazyGames SDK `ad.requestAd('rewarded', …)` when integrating.    │
// └──────────────────────────────────────────────────────────────────────┘

export class Platform {
  constructor({ ui, analytics }) {
    this.ui = ui;
    this.analytics = analytics;
    this.sdk = typeof window !== 'undefined' && window.CrazyGames && window.CrazyGames.SDK ? window.CrazyGames.SDK : null;
    this.useRealSdkAds = false; // deliberately off for the prototype
  }

  gameplayStart() { try { this.sdk?.game?.gameplayStart(); } catch { /* */ } }
  gameplayStop() { try { this.sdk?.game?.gameplayStop(); } catch { /* */ } }
  happytime() { try { this.sdk?.game?.happytime(); } catch { /* */ } }
  loadingStop() { try { this.sdk?.game?.loadingStop(); } catch { /* */ } }

  /** Simulated rewarded ad. Resolves true when the "reward" should be granted. */
  async requestRewarded(placement) {
    this.analytics?.track('sim_rewarded_ad', { placement });
    if (this.ui) await this.ui.simulatedAd(placement);
    return true;
  }
}

/** Haptics stub - maps to navigator.vibrate on web, native bridge later. */
export const haptics = {
  enabled: true,
  pulse(kind = 'light') {
    if (!this.enabled || typeof navigator === 'undefined' || !navigator.vibrate) return;
    const ms = { light: 8, medium: 18, heavy: 35, success: [20, 40, 30] }[kind] || 10;
    try { navigator.vibrate(ms); } catch { /* */ }
  },
};
