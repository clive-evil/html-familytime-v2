import RAPIER from '@dimforge/rapier3d-compat';

let ready = null;
/** Initialise Rapier's WASM once (works in browser and Node). */
export function initPhysics() {
  if (!ready) ready = RAPIER.init();
  return ready;
}
export { RAPIER };
