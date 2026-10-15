import { World } from '../src/world/layout.js';
import { CarSim } from '../src/sim/car.js';
import { Driver, emptyIntents } from '../src/sim/driver.js';
import { DEFAULT_SETTINGS, applyPreset } from '../src/sim/params.js';

export const DT = 1 / 240;

export function rig(presetKey = 'B', over = {}) {
  let settings = applyPreset({ ...DEFAULT_SETTINGS, assists: { ...DEFAULT_SETTINGS.assists } }, presetKey);
  settings = { ...settings, ...over };
  const world = new World({ hillSteepness: settings.hillSteepness });
  const car = new CarSim(world, settings);
  const driver = new Driver(settings);
  const I = emptyIntents();
  const r = {
    world, car, driver, I, settings, t: 0, events: [],
    // run with raw control values straight into the car (bypassing driver)
    raw(sec, c, fn) {
      const n = Math.round(sec / DT);
      for (let i = 0; i < n; i++) { if (fn) fn(i * DT, c); car.step(DT, c); r.events.push(...car.events); car.events.length = 0; r.t += DT; }
    },
    // run through the driver layer with intents
    drive(sec, fn) {
      const n = Math.round(sec / DT);
      for (let i = 0; i < n; i++) {
        if (fn) fn(i * DT, I);
        const c = driver.update(DT, I, car);
        car.step(DT, c);
        r.events.push(...car.events); car.events.length = 0; r.t += DT;
        I.gearUp = I.gearDown = false; I.gearDirect = null; I.handbrake.pressed = false;
        I.steer.keyLeftEdge = I.steer.keyRightEdge = false;
      }
    },
    count(type) { return r.events.filter((e) => e.type === type).length; },
    clear() { r.events.length = 0; },
    place(x, z, psi) { car.reset({ x, z, psi }, true); },
  };
  return r;
}

export function ctl(over = {}) {
  return { throttle: 0, brake: 0, clutch: 1, handbrake: 0, steerDeg: 0, ignition: false, ...over };
}

// start the engine the textbook way (clutch down, neutral)
export function startEngine(r, over = {}) {
  const c = ctl({ ignition: true, ...over });
  r.raw(1.2, c);
  c.ignition = false;
  r.raw(1.0, c);
  return c;
}
