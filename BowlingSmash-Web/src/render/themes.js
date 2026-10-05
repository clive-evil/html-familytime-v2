// Visual environments. Palette + floor texture recipe + decoration style.
export const THEMES = {
  arena: {
    name: 'Toy Arena',
    sky: ['#7fd3ff', '#d9f3ff'], fog: '#cdeeff', fogNear: 30, fogFar: 70,
    floor: 'lane', floorColor: '#e8b77a', edge: '#5b3a8c', void: '#3b2a63',
    hemi: ['#ffffff', '#8a7bb5', 1.2], sun: ['#fff4e0', 2.6], accent: '#ff4f7b',
    wall: '#6c4bd1', block: '#7d5cff', ramp: '#ffb347', rail: '#5b3a8c', backstop: '#2d1f4f',
  },
  market: {
    name: 'Supermarket',
    sky: ['#ffe7b8', '#fff8ea'], fog: '#fff1d6', fogNear: 28, fogFar: 65,
    floor: 'tiles', floorColor: '#e4ddd0', edge: '#2f8f6f', void: '#24524a',
    hemi: ['#ffffff', '#c9b28a', 0.95], sun: ['#fff6e8', 2.1], accent: '#2fbf8f',
    wall: '#e8e2d4', block: '#35a37c', ramp: '#ffcf4d', rail: '#2f8f6f', backstop: '#2f8f6f',
  },
  office: {
    name: 'Office',
    sky: ['#a9c7e8', '#e9f1fa'], fog: '#dde9f5', fogNear: 28, fogFar: 65,
    floor: 'carpet', floorColor: '#7d8aa3', edge: '#33415c', void: '#1f2a40',
    hemi: ['#ffffff', '#6f7c99', 1.2], sun: ['#fffaf0', 2.3], accent: '#3fa9f5',
    wall: '#d9dde6', block: '#8fa1c4', ramp: '#d9dde6', rail: '#33415c', backstop: '#33415c', desk: '#c79a6b',
  },
  site: {
    name: 'Construction Site',
    sky: ['#ffc58a', '#ffeccd'], fog: '#ffe2bd', fogNear: 30, fogFar: 70,
    floor: 'concrete', floorColor: '#b9b3a8', edge: '#e0a419', void: '#4a3b2a',
    hemi: ['#ffffff', '#a08b6b', 1.2], sun: ['#fff0d8', 2.6], accent: '#ffb300',
    wall: '#9c9890', block: '#f2b01e', ramp: '#d08b3e', rail: '#e0a419', backstop: '#5d5348',
  },
  plaza: {
    name: 'City Plaza',
    sky: ['#9ad8ff', '#f2fbff'], fog: '#dff3ff', fogNear: 32, fogFar: 75,
    floor: 'paving', floorColor: '#d8cfc4', edge: '#7b6aa8', void: '#2f3a52',
    hemi: ['#ffffff', '#8c94a8', 1.2], sun: ['#fff6e6', 2.6], accent: '#ff7a45',
    wall: '#c9bfb2', block: '#ff7a45', ramp: '#cdbfae', rail: '#7b6aa8', backstop: '#7b6aa8',
  },
};
