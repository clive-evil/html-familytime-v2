// An egg's location is one of:
//  'store'     - in a basket/crate (container = building id)
//  'ground'    - dropped at x,z
//  'player'    - carried by the player
//  'grandma'   - carried by a hauler (container = grandma id)
//  'incubator' - in an incubator slot (container = building id, slot)
export function createEgg(state, loc, container = 0, x = 0, z = 0) {
  return { id: state.nextId++, loc, container, slot: -1, x, z, age: 0 };
}
