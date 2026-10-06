'use strict';
// ============================================================================
// SPRITES — articulated procedural crew. Small, readable, hand-made feel.
// Local units: feet at (0,0), ~31 units tall, drawn ×1.3. Forward = +x
// (the context is mirrored for left-facing crew).
// ============================================================================

const OUTFIT = {
  Engineer: { torso: '#5f5d48', legs: '#45443a', accent: '#a8902e', belt: '#2a2620' },
  Technician: { torso: '#4f5c46', legs: '#3f4a38', accent: '#8a7a3e', belt: '#2a2a22' },
  Medic: { torso: '#6d6e69', legs: '#3a3b3a', accent: '#b2ae9f', belt: '#4a4237' },
  Security: { torso: '#2a3036', legs: '#262b30', accent: '#46525c', belt: '#1a1e21' },
  Scientist: { torso: '#3d4044', legs: '#34363a', accent: '#b3ae9f', belt: '#2a2a2a' },
  Officer: { torso: '#262d37', legs: '#20252c', accent: '#8e897c', belt: '#15181c' },
};

function seg(ctx, x, y, a, len, w, col) { // a: 0 = straight down, + = forward
  const ex = x + Math.sin(a) * len, ey = y + Math.cos(a) * len;
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
  return [ex, ey];
}

// ---------------------------------------------------------------------------
// Pose selection from simulation state
// ---------------------------------------------------------------------------
function crewPose(c) {
  const t = G.t, ph = c.phase, task = c.task ? c.task.type : null, r = G.roomById[c.room];
  const P = { lean: 0, bob: 0, crouch: 0, hipL: 0, kneeL: 0.1, hipR: 0, kneeR: 0.1, shF: 0.08, elF: 0.15, shB: -0.05, elB: 0.15, look: 0, prop: null, kneel: false, seated: false, bubble: false };
  const monster = G.creatures.some((m) => m.alive && m.room === c.room && m.state === 'room');
  const working = c.atWork && !c.moving;
  if (c.moving && !c.climb) {
    const run = speedOf(c) > 70; const limp = c.hp < 40;
    const A = run ? 0.8 : 0.5;
    P.hipL = Math.sin(ph) * A; P.hipR = Math.sin(ph + Math.PI) * A * (limp ? 0.55 : 1);
    P.kneeL = 0.12 + Math.max(0, -Math.sin(ph - 0.7)) * (run ? 1.1 : 0.7);
    P.kneeR = 0.12 + Math.max(0, -Math.sin(ph + Math.PI - 0.7)) * (run ? 1.1 : 0.7) * (limp ? 0.5 : 1);
    P.bob = Math.abs(Math.cos(ph)) * (run ? 1.1 : 0.6) + (limp && Math.sin(ph) > 0 ? 0.8 : 0);
    P.lean = run ? 0.22 : 0.05;
    P.shF = -Math.sin(ph) * (run ? 0.9 : 0.45); P.elF = run ? 1.4 : 0.3;
    P.shB = Math.sin(ph) * (run ? 0.9 : 0.45); P.elB = run ? 1.4 : 0.3;
    if (limp) { P.shF = 0.5; P.elF = 1.9; } // hand pressed to the wound
    if (c.panicT > 0 || task === 'panic') { P.shF = 2.6 + Math.sin(t * 9) * 0.3; P.elF = 0.6; P.shB = 2.3 + Math.cos(t * 8) * 0.3; P.elB = 0.8; P.lean = 0.3; }
    if (c.armed && (task === 'fight' || G.alertLevel === 2)) { P.shF = 0.9; P.elF = 1.2; P.shB = 0.6; P.elB = 1.5; P.prop = 'rifle_port'; }
    return P;
  }
  // idle breathing + glances
  P.bob = Math.sin(t * 1.8 + c.id) * 0.25;
  P.look = Math.sin(t * 0.23 + c.id * 3.1) > 0.92 ? -1 : 0;
  if (c.react && c.react.t > 0) { P.look = c.react.dir === 1 ? 0 : -1; P.lean = -0.12; P.shF = 0.5; P.elF = 1.3; }
  // fear: crouch and cover when the thing is in the room and they cannot fight
  if ((monster && !c.armed) || (c.trapped && roomDanger(r) >= 2) || (c.stress > 80 && !r.powered)) {
    P.crouch = 4.5; P.lean = -0.15; P.hipL = 0.9; P.kneeL = -1.6; P.hipR = 0.6; P.kneeR = -1.2;
    P.shF = 2.4 + Math.sin(t * 20) * 0.05; P.elF = 2.0; P.shB = 2.2; P.elB = 2.1; P.look = 0;
    return P;
  }
  if (task === 'fight' && c.armed) {
    const recoil = c.fireT > 0.3 ? 0.25 : 0;
    P.shF = 1.55 - recoil; P.elF = 0.1; P.shB = 1.2; P.elB = 0.7; P.prop = 'rifle_aim'; P.lean = 0.05 - recoil * 0.3; P.hipL = 0.25; P.hipR = -0.2;
    return P;
  }
  if (c.armed && (task === 'security' || G.alertLevel === 2)) { P.shF = 0.9; P.elF = 1.2; P.shB = 0.6; P.elB = 1.5; P.prop = 'rifle_port'; }
  if (!working || !task) {
    if (c.social && c.social.t > 0) { P.bubble = c.social.speaking; if (c.social.speaking) { P.shF = 0.6 + Math.sin(t * 4 + c.id) * 0.35; P.elF = 1.2 + Math.sin(t * 3) * 0.3; } }
    return P;
  }
  const w = c.workAnim || 0;
  switch (task) {
    case 'repair': case 'power': case 'duty':
      if (task === 'duty' && !['Engineer', 'Technician'].includes(c.prof)) { // console work
        if (['bridge', 'security', 'reactor', 'quarantine', 'medbay', 'o2'].includes(c.room)) { P.shF = 1.15; P.elF = 0.9 + Math.sin(w * 7) * 0.12; P.shB = 1.0; P.elB = 1.0 + Math.cos(w * 6) * 0.12; P.lean = 0.08; }
        else if (c.social && c.social.t > 0) { P.bubble = c.social.speaking; P.shF = 0.6 + Math.sin(t * 4) * 0.3; P.elF = 1.2; }
        break;
      }
      P.shF = 1.35 + Math.sin(w * 8) * 0.15; P.elF = 0.5; P.shB = 1.1; P.elB = 0.8; P.lean = 0.12; P.prop = task === 'power' ? 'probe' : 'wrench';
      if (task === 'duty' && Math.sin(w * 0.4 + c.id) < 0) { P.crouch = 3; P.hipL = 1.0; P.kneeL = -1.4; P.hipR = 0.2; P.kneeR = -0.4; P.shF = 1.6; }
      break;
    case 'seal':
      P.kneel = true; P.crouch = 4; P.hipL = 1.3; P.kneeL = -1.5; P.hipR = -0.1; P.kneeR = -1.6; P.shF = 1.9; P.elF = 0.4; P.shB = 1.6; P.elB = 0.6; P.prop = 'torch'; P.lean = 0.15; break;
    case 'extinguish': case 'decon':
      P.shF = 1.3; P.elF = 0.3; P.shB = 1.0; P.elB = 0.9; P.lean = 0.1; P.hipL = 0.35; P.hipR = -0.25; P.prop = task === 'decon' ? 'sprayer' : 'extinguisher'; break;
    case 'treat': case 'scan': case 'bloodtest':
      if (task === 'treat') { P.kneel = true; P.crouch = 4; P.hipL = 1.3; P.kneeL = -1.5; P.hipR = -0.1; P.kneeR = -1.6; P.shF = 1.3 + Math.sin(w * 3) * 0.1; P.elF = 0.6; P.shB = 1.1; P.elB = 0.8; P.prop = 'medkit'; }
      else { P.shF = 1.2; P.elF = 1.0 + Math.sin(w * 6) * 0.1; P.shB = 1.0; P.elB = 1.0; }
      break;
    case 'reactor': case 'restart': case 'security': case 'investigate':
      if (task === 'investigate') { P.shF = 1.2; P.elF = 0.4; P.look = Math.sin(w * 0.8) > 0 ? 0 : -1; P.prop = 'torch_hand'; }
      else { P.shF = 1.15; P.elF = 0.9 + Math.sin(w * 7) * 0.12; P.shB = 1.0; P.elB = 1.0 + Math.cos(w * 6) * 0.12; P.lean = 0.08; }
      break;
    case 'eat':
      P.seated = true; P.crouch = 5; P.hipL = 1.5; P.kneeL = -1.5; P.hipR = 1.4; P.kneeR = -1.45;
      { const bite = (Math.sin(w * 1.3 + c.id) + 1) / 2; P.shF = 0.6 + bite * 1.3; P.elF = 0.5 + bite * 1.8; P.shB = 1.0; P.elB = 1.1; }
      if (c.social && c.social.cards) { P.shF = 1.2; P.elF = 1.1 + Math.sin(w * 2) * 0.2; }
      P.bubble = c.social && c.social.speaking;
      break;
    case 'rest': P.seated = true; P.crouch = 5; P.hipL = 1.5; P.kneeL = -1.5; P.hipR = 1.4; P.kneeR = -1.45; P.lean = -0.15; P.shF = 0.3; P.elF = 1.4; break;
    case 'door': P.shF = 1.3 + Math.sin(w * 5) * 0.4; P.elF = 0.6 + Math.cos(w * 5) * 0.4; P.shB = 1.1 + Math.cos(w * 5) * 0.4; P.elB = 0.8; P.lean = 0.15; P.hipL = 0.35; P.hipR = -0.3; break;
    case 'hold': if (c.quarantined) { P.seated = true; P.crouch = 5; P.hipL = 1.5; P.kneeL = -1.5; P.hipR = 1.4; P.kneeR = -1.45; P.lean = 0.2; P.shF = 0.9; P.elF = 1.6; } break;
  }
  return P;
}

// ---------------------------------------------------------------------------
function drawHair(ctx, c, hx, hy) {
  const col = HAIR[c.look.hairC]; ctx.fillStyle = col;
  switch (c.look.hair) {
    case 0: ctx.beginPath(); ctx.arc(hx - 0.3, hy - 0.4, 3.75, Math.PI * 1.02, Math.PI * 1.98); ctx.fill(); break;
    case 1: ctx.beginPath(); ctx.arc(hx - 0.5, hy - 0.6, 4, Math.PI * 0.95, Math.PI * 2.0); ctx.fill(); ctx.fillRect(hx - 4.2, hy - 1, 1.6, 2.4); break;
    case 2: ctx.beginPath(); ctx.arc(hx - 0.5, hy - 0.5, 4.1, Math.PI * 0.85, Math.PI * 2.0); ctx.fill(); ctx.fillRect(hx - 4.5, hy - 1, 2.4, 4.6); break;
    case 3: ctx.beginPath(); ctx.arc(hx - 0.4, hy - 0.6, 4, Math.PI * 0.95, Math.PI * 2.0); ctx.fill(); ctx.beginPath(); ctx.arc(hx - 3.8, hy - 2.6, 1.9, 0, 6.3); ctx.fill(); break;
    default: ctx.beginPath(); ctx.arc(hx - 0.6, hy - 0.8, 4.8, Math.PI * 0.8, Math.PI * 2.1); ctx.fill(); ctx.beginPath(); ctx.arc(hx - 3.6, hy + 0.6, 2.2, 0, 6.3); ctx.fill(); break;
  }
}
function drawHeadgear(ctx, c, hx, hy) {
  switch (c.prof) {
    case 'Engineer':
      ctx.fillStyle = '#b8962e'; ctx.beginPath(); ctx.arc(hx - 0.2, hy - 0.9, 4.4, Math.PI, 0); ctx.fill(); ctx.fillRect(hx - 4.8, hy - 1.1, 10.4, 1.3);
      ctx.fillStyle = '#7a6420'; ctx.fillRect(hx - 0.5, hy - 5.3, 1, 4.2);
      ctx.fillStyle = '#e8e2c8'; ctx.fillRect(hx + 3.2, hy - 3.2, 1.4, 1.4); break;
    case 'Technician':
      ctx.fillStyle = '#3c4636'; ctx.beginPath(); ctx.arc(hx - 0.3, hy - 1, 4, Math.PI, 0); ctx.fill(); ctx.fillRect(hx, hy - 1.6, 5.5, 1.1);
      ctx.fillStyle = '#121212'; ctx.fillRect(hx - 2.5, hy - 2.6, 6, 1.3); ctx.fillStyle = '#5b6a6a'; ctx.fillRect(hx + 1.2, hy - 2.5, 1.6, 1.1); break;
    case 'Security':
      ctx.fillStyle = '#3a454e'; ctx.beginPath(); ctx.arc(hx - 0.2, hy - 0.4, 4.9, Math.PI * 0.85, Math.PI * 2.15); ctx.fill();
      ctx.fillStyle = '#4c5963'; ctx.fillRect(hx - 4.4, hy - 4, 7, 1.1);
      ctx.fillStyle = '#0c0e10'; ctx.fillRect(hx + 0.6, hy - 1.8, 4, 2.5); ctx.fillStyle = 'rgba(160,180,190,0.35)'; ctx.fillRect(hx + 1.3, hy - 1.5, 1.6, 0.6); break;
    case 'Medic':
      drawHair(ctx, c, hx, hy); ctx.fillStyle = '#c3bfb2'; ctx.beginPath(); ctx.arc(hx - 0.2, hy - 1.4, 3.9, Math.PI, 0); ctx.fill(); break;
    case 'Officer':
      drawHair(ctx, c, hx, hy); ctx.fillStyle = '#20262d'; ctx.fillRect(hx - 4.2, hy - 5, 8.6, 2.6); ctx.fillRect(hx, hy - 2.7, 5.6, 1.1); ctx.fillStyle = '#8e897c'; ctx.fillRect(hx - 1, hy - 4.4, 1.6, 1); break;
    default: drawHair(ctx, c, hx, hy);
  }
}
function drawProp(ctx, prop, hx, hy, t, c) {
  ctx.save(); ctx.translate(hx, hy);
  switch (prop) {
    case 'wrench': ctx.rotate(-0.6 + Math.sin(t * 8) * 0.3); ctx.fillStyle = '#7a7c78'; ctx.fillRect(-0.5, -4, 1.2, 5); ctx.fillRect(-1.3, -5, 2.8, 1.4); break;
    case 'probe': ctx.fillStyle = '#b8962e'; ctx.fillRect(0, -1, 3.5, 2); ctx.fillStyle = '#111'; ctx.fillRect(3.4, -0.4, 2, 0.8); break;
    case 'torch': ctx.fillStyle = '#3a3a36'; ctx.fillRect(0, -1, 4, 2); ctx.fillStyle = '#fff3d0'; ctx.fillRect(4, -0.6, 1.4, 1.2); break;
    case 'torch_hand': ctx.fillStyle = '#2c2c2a'; ctx.fillRect(-0.5, -1, 4.5, 2); ctx.fillStyle = '#f2ead0'; ctx.fillRect(3.8, -0.8, 0.9, 1.6); break;
    case 'extinguisher': case 'sprayer':
      ctx.fillStyle = prop === 'sprayer' ? '#6a6c58' : PAL.red; ctx.fillRect(-2.2, -1, 4.2, 8); ctx.fillStyle = '#1a1a1a'; ctx.fillRect(-1, -2.3, 2, 1.4); ctx.fillRect(1.5, -2, 4, 1); break;
    case 'medkit': ctx.fillStyle = '#b2ae9f'; ctx.fillRect(-1, 0, 4, 3); ctx.fillStyle = PAL.green; ctx.fillRect(0.4, 1.1, 1.4, 0.8); break;
    case 'rifle_aim': ctx.fillStyle = '#141617'; ctx.fillRect(-4, -1.2, 15, 2.2); ctx.fillRect(-2, 0.6, 2, 2.6); ctx.fillRect(4, 0.6, 1.5, 2.2); ctx.fillStyle = '#2b3136'; ctx.fillRect(1, -2.2, 4, 1); break;
    case 'rifle_port': ctx.rotate(-0.75); ctx.fillStyle = '#141617'; ctx.fillRect(-6, -1, 14, 2); ctx.fillRect(-2, 0.8, 2, 2.3); break;
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
function drawCrew(ctx, c) {
  const skin = SKIN[c.look.skin]; const O = OUTFIT[c.prof];
  const x = c.x, y = c.y; const t = G.t;
  const sel = UI.sel && UI.sel.type === 'crew' && UI.sel.id === c.id;
  const r = G.roomById[c.room];
  if (!c.alive || c.down) return drawLying(ctx, c, sel);
  if (c.sleeping && c.atWork && c.room === 'quarters') {
    const b = ART.rooms.quarters.bunks[c.id % ART.rooms.quarters.bunks.length];
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(b.x - 27, b.y - 3.4, 3.2, 0, 6.3); ctx.fill();
    ctx.fillStyle = HAIR[c.look.hairC]; ctx.beginPath(); ctx.arc(b.x - 28.4, b.y - 4, 3, Math.PI * 0.6, Math.PI * 1.7); ctx.fill();
    ctx.fillStyle = '#4e5148'; ctx.beginPath(); ctx.moveTo(b.x - 24, b.y - 1); ctx.quadraticCurveTo(b.x - 10, b.y - 7.5 - Math.sin(t * 1.4 + c.id) * 0.4, b.x + 12, b.y - 1); ctx.fill(); // blanket rises with breath
    ctx.fillStyle = '#3e4139'; ctx.fillRect(b.x - 18, b.y - 3.5, 1, 3);
    if (sel) selBracket(ctx, b.x - 8, b.y - 8, 12);
    return;
  }
  ctx.save(); ctx.translate(x, y + 0.5);
  // contact shadow
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(0, 0, 8, 1.6, 0, 0, 6.3); ctx.fill();
  ctx.scale(1.3 * c.face, 1.3);
  if (c.hitFlash > 0) ctx.translate(rnd(-0.8, 0.8), 0);
  if (c.climb) { drawClimbing(ctx, c, O, skin); ctx.restore(); if (sel) selBracket(ctx, x, y - 20, 23); return; }
  const P = crewPose(c);
  const hipY = -12 + P.crouch - P.bob * 0.4;
  // legs (far then near)
  const leg = (hip, knee, col, near) => {
    const [kx, ky] = seg(ctx, near ? 0.4 : -0.4, hipY, hip, 6.2, 3.1, col);
    const [fx, fy] = seg(ctx, kx, ky, hip + knee * (P.seated || P.kneel || P.crouch > 2 ? 1 : -1), 6.2, 2.7, col);
    ctx.fillStyle = '#151515'; ctx.fillRect(fx - 1.4, Math.min(fy, 0) - 1.6, 4.2, 2); // boot
  };
  ctx.save(); ctx.translate(0, 0);
  leg(P.hipR, P.kneeR, shade(O.legs, -0.25), false);
  // torso frame (rotates with lean around the hip)
  ctx.save(); ctx.translate(0, hipY); ctx.rotate(P.lean);
  const T = -11; // shoulder height relative to hip
  const shoulder = [0.6, T + 1];
  // back arm
  const arm = (sh, el, col, front) => {
    const [ex, ey] = seg(ctx, shoulder[0] + (front ? 0.6 : -0.8), shoulder[1], sh, 5, 2.6, col);
    const [hx2, hy2] = seg(ctx, ex, ey, sh + el, 4.6, 2.2, col);
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(hx2, hy2, 1.15, 0, 6.3); ctx.fill();
    return [hx2, hy2];
  };
  const sleeve = c.prof === 'Scientist' ? '#a8a394' : c.prof === 'Medic' ? '#5e5f5a' : O.torso;
  arm(P.shB, P.elB, shade(sleeve, -0.28), false);
  // torso
  ctx.fillStyle = O.torso;
  ctx.beginPath(); ctx.moveTo(-3.6, 0.5); ctx.lineTo(-4.4, T + 1.5); ctx.quadraticCurveTo(-4.2, T - 0.4, -2, T - 0.5); ctx.lineTo(3.2, T - 0.5); ctx.quadraticCurveTo(4.8, T, 4.6, T + 2); ctx.lineTo(3.8, 0.5); ctx.closePath(); ctx.fill();
  // profession detailing
  switch (c.prof) {
    case 'Engineer': ctx.fillStyle = O.accent; ctx.fillRect(-4.2, T + 4, 8.7, 1.1); ctx.fillStyle = O.belt; ctx.fillRect(-3.8, -1.6, 7.8, 1.8); ctx.fillStyle = '#3e3a2c'; ctx.fillRect(1.6, -1.8, 2.4, 2.8); ctx.fillRect(-3.4, -1.8, 2, 2.4); ctx.fillStyle = '#6c6e6a'; ctx.fillRect(2.5, -3.6, 0.7, 2.2); break;
    case 'Technician': ctx.fillStyle = shade(O.torso, -0.2); ctx.fillRect(-0.3, T, 0.7, 11); ctx.fillStyle = O.belt; ctx.fillRect(-3.8, -1.6, 7.8, 1.6); ctx.fillStyle = O.accent; ctx.fillRect(2, -1.5, 2, 1.3); ctx.fillStyle = '#2f3a2a'; ctx.fillRect(1.6, T + 3, 2.2, 2); break;
    case 'Medic': ctx.fillStyle = O.accent; ctx.beginPath(); ctx.moveTo(-3.8, -0.5); ctx.lineTo(-4.2, T + 1.5); ctx.lineTo(4.2, T + 1.5); ctx.lineTo(3.6, -0.5); ctx.fill(); ctx.strokeStyle = '#4a4237'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(3.2, T); ctx.lineTo(-3.6, -1); ctx.stroke(); ctx.fillStyle = '#4a4237'; ctx.fillRect(-5, -2.5, 3, 3); ctx.fillStyle = PAL.green; ctx.fillRect(-0.6, T + 2.6, 2.6, 0.9); break;
    case 'Security': ctx.fillStyle = O.accent; ctx.fillRect(-3.4, T + 1, 7.6, 6.4); ctx.fillStyle = shade(O.accent, 0.18); ctx.fillRect(-3.4, T + 1, 7.6, 0.8); ctx.fillStyle = '#1a1e21'; ctx.fillRect(-3.6, -2, 7.8, 1.6); ctx.fillRect(-0.4, T + 7.4, 1, 3.6); ctx.fillStyle = '#3a444c'; ctx.beginPath(); ctx.arc(-1.8, T + 0.6, 2.4, Math.PI, 0); ctx.fill();
      if (!P.prop && c.armed) { ctx.save(); ctx.translate(-3, T + 4); ctx.rotate(0.9); ctx.fillStyle = '#141617'; ctx.fillRect(-7, -0.9, 13, 1.8); ctx.restore(); } break;
    case 'Scientist': ctx.fillStyle = O.accent; ctx.beginPath(); ctx.moveTo(-4.4, T + 1.5); ctx.lineTo(-4.6, 4.2); ctx.lineTo(0.2, 4.2); ctx.lineTo(0.6, T + 1); ctx.lineTo(-2, T - 0.4); ctx.fill(); ctx.beginPath(); ctx.moveTo(2.6, T - 0.4); ctx.lineTo(4.6, T + 1.8); ctx.lineTo(4.4, 3); ctx.lineTo(2.6, 3); ctx.fill(); ctx.fillStyle = '#c8c3b4'; ctx.fillRect(2.8, T + 3.2, 1.4, 1.8); break;
    case 'Officer': ctx.fillStyle = shade(O.torso, 0.15); ctx.beginPath(); ctx.moveTo(1.5, T - 0.5); ctx.lineTo(3.4, T + 3); ctx.lineTo(2.2, T + 3); ctx.fill(); ctx.fillStyle = O.accent; ctx.fillRect(-3, T - 0.6, 2.6, 0.8); ctx.fillStyle = O.belt; ctx.fillRect(-3.6, -1.4, 7.6, 1.2); ctx.fillStyle = '#6b6650'; ctx.fillRect(2.6, T + 4, 1.2, 0.8); break;
  }
  // rim light on the back edge
  ctx.fillStyle = 'rgba(225,218,198,0.22)'; ctx.fillRect(-4.3, T + 1.2, 0.6, 10);
  // head
  const hx = 0.8, hy = T - 4.2 + (P.look ? 0 : 0);
  ctx.fillStyle = shade(skin, -0.2); ctx.fillRect(-0.4, T - 1.6, 2.2, 2);
  ctx.save(); if (P.look === -1) { ctx.translate(hx, 0); ctx.scale(-1, 1); ctx.translate(-hx, 0); }
  ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(hx, hy, 3.5, 3.8, 0, 0, 6.3); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(hx - 1.2, hy + 0.3, 2.2, 3.4, 0, 0, 6.3); ctx.fill(); // jaw shade
  ctx.fillStyle = '#16120f'; ctx.fillRect(hx + 2, hy - 0.6, 0.9, 0.9); // eye
  ctx.fillStyle = shade(skin, -0.25); ctx.fillRect(hx + 3.2, hy + 0.4, 0.6, 0.9); // nose
  drawHeadgear(ctx, c, hx, hy);
  ctx.restore();
  // front arm (+ prop)
  const [fx, fy] = arm(P.shF, P.elF, shade(sleeve, -0.08), true);
  if (P.prop) drawProp(ctx, P.prop, fx, fy, c.workAnim || t, c);
  ctx.restore(); // torso
  leg(P.hipL, P.kneeL, O.legs, true);
  ctx.restore();
  // helmet / hand lamp in dark rooms
  ctx.restore();
  if (!r.powered || !r.observed) { const [lx, ly] = [x + c.face * 4.5, y - (P.seated ? 28 : 34) + P.crouch * 1.3]; ctx.fillStyle = '#f2ead0'; ctx.fillRect(lx - 0.8, ly - 0.8, 1.6, 1.6); }
  if (c.hitFlash > 0) { ctx.fillStyle = 'rgba(160,30,20,0.35)'; ctx.fillRect(x - 8, y - 40, 16, 40); }
  if (P.bubble && R.cam.z > 1.05) { ctx.fillStyle = 'rgba(201,195,178,0.55)'; for (let i = 0; i < 3; i++) if ((t * 2 + i) % 3 < 2) ctx.fillRect(x + c.face * 6 + i * 2.2, y - 46, 1.2, 1.2); }
  if (sel) selBracket(ctx, x, y - 20, 23);
}

function drawClimbing(ctx, c, O, skin) {
  const k = Math.sin(c.climb.t * 8);
  ctx.strokeStyle = O.legs; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-1.5, -12); ctx.lineTo(-2, -5 + k * 2); ctx.lineTo(-2, 0 + k * 2); ctx.moveTo(1.5, -12); ctx.lineTo(2, -5 - k * 2); ctx.lineTo(2, 0 - k * 2); ctx.stroke();
  ctx.fillStyle = O.torso; ctx.fillRect(-4, -23, 8, 11.5);
  if (c.prof === 'Engineer' || c.prof === 'Technician') { ctx.fillStyle = O.belt; ctx.fillRect(-4, -13.5, 8, 1.6); }
  ctx.strokeStyle = shade(O.torso, -0.1); ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.moveTo(-3.5, -22); ctx.lineTo(-5, -27 - k * 2); ctx.moveTo(3.5, -22); ctx.lineTo(5, -27 + k * 2); ctx.stroke();
  ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(-5, -28 - k * 2, 1.1, 0, 6.3); ctx.arc(5, -28 + k * 2, 1.1, 0, 6.3); ctx.fill();
  ctx.fillStyle = HAIR[c.look.hairC]; ctx.beginPath(); ctx.arc(0, -26.5, 3.7, 0, 6.3); ctx.fill();
  if (c.prof === 'Engineer') { ctx.fillStyle = '#b8962e'; ctx.beginPath(); ctx.arc(0, -27.3, 4.2, Math.PI, 0); ctx.fill(); }
  if (c.prof === 'Security') { ctx.fillStyle = '#3a454e'; ctx.beginPath(); ctx.arc(0, -26.8, 4.6, 0, 6.3); ctx.fill(); }
}

function drawLying(ctx, c, sel) {
  const O = OUTFIT[c.prof]; const skin = SKIN[c.look.skin];
  const x = c.x, y = c.y; const tw = c.down ? Math.sin(G.t * 5 + c.id) * 0.4 : 0;
  ctx.save(); ctx.translate(x, y); ctx.scale(1.3 * (c.id % 2 ? 1 : -1), 1.3);
  if (!c.alive) { ctx.fillStyle = 'rgba(96,20,14,0.85)'; ctx.beginPath(); ctx.ellipse(1, 0.2, 12, 1.6, 0, 0, 6.3); ctx.fill(); }
  ctx.strokeStyle = O.legs; ctx.lineWidth = 2.8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-3, -2.2); ctx.lineTo(-9, -1.6); ctx.lineTo(-14, -1.4); ctx.moveTo(-3, -2.6); ctx.lineTo(-8.5, -4.2); ctx.lineTo(-13, -2); ctx.stroke();
  ctx.fillStyle = '#151515'; ctx.fillRect(-15.5, -3, 2, 2.6);
  ctx.fillStyle = O.torso; ctx.fillRect(-3.5, -5, 11, 4.6);
  if (c.prof === 'Scientist' || c.prof === 'Medic') { ctx.fillStyle = O.accent; ctx.fillRect(-3.5, -5, 9, 2.2); }
  ctx.strokeStyle = shade(O.torso, -0.1); ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(5, -4.5); ctx.lineTo(9, -7 + tw); ctx.lineTo(13, -6 + tw * 2); ctx.stroke(); // reaching arm
  ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(13.3, -6 + tw * 2, 1.1, 0, 6.3); ctx.fill();
  ctx.beginPath(); ctx.arc(10, -2.6, 3.2, 0, 6.3); ctx.fill();
  if (c.prof === 'Engineer') { ctx.fillStyle = '#b8962e'; ctx.beginPath(); ctx.arc(14.5, -1.8, 2.8, 0, 6.3); ctx.fill(); } // helmet knocked off
  if (c.prof === 'Security') { ctx.fillStyle = '#3a454e'; ctx.beginPath(); ctx.arc(10.5, -3, 3.6, Math.PI * 0.5, Math.PI * 1.6); ctx.fill(); }
  ctx.restore();
  if (sel) selBracket(ctx, x, y - 8, 12);
}
