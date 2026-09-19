const listeners = new Map();

export const state = {
  formation: 'calma',
  scroll: 0,
  activeGroup: -1,
  stages: [],
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
