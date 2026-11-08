const listeners = new Map();

export const state = {
  formation: 'calma',
  scroll: 0,
  activeGroup: -1,
  stages: [],
  theme: document.documentElement.dataset.theme || 'light',
  // la casa del inicio: house = escena (0..2, continuo), houseExit = px que ya salió de pantalla
  houseActive: false,
  house3d: document.documentElement.classList.contains('story-3d'),
  house: 0,
  houseExit: 0,
  doorOpen: false,
  housePanel: false, // true = páginas con panel anclado al objeto (la casa se centra y el contenido va a la derecha)
  anchorScreen: { x: 0, y: 0, on: false }, // posición en pantalla del objeto de la página (se muta sin emitir)
  hotspotHover: '',
  hotspots: [],
};

export function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
  return () => listeners.get(event).delete(handler);
}

export function emit(event, payload) {
  listeners.get(event)?.forEach((handler) => handler(payload));
}

export function setState(patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (state[key] === value) continue;
    state[key] = value;
    emit(key, value);
  }
}
