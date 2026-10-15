// The car controls Dave uses: the same Driver as a human, configured the way
// a person actually drives — an analogue wheel he turns with his hands,
// analogue pedals, a normal gear lever (button selection), a ratchet handbrake.
// No assists. His hand speed on the wheel comes from his skill.
export function applyDaveSettings(settings, traits) {
  const skill = (traits?.skill ?? 50) / 100;
  return {
    ...settings,
    steeringMode: 'analogue',
    steeringSpeed: 170 + skill * 170, // ×2.5 in analogue mode → 425–850 °/s of wheel
    gearbox: 'button',
    handbrakeMode: 'toggle',
    keyboardClutch: 'ramp',
    selfCentring: 'weak',
    assists: { autoRestart: false, autoClutch: false, autoGear: false, steeringReturn: false },
  };
}
