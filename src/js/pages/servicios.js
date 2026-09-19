import { setState } from '../../state.js';

let cards = [];
let cleanups = [];

export function init() {
  cards = [...document.querySelectorAll('.service-card')];
  cleanups = cards.flatMap((card, index) => {
    const enter = () => setState({ activeGroup: index });
    const leave = () => setState({ activeGroup: -1 });
    card.addEventListener('pointerenter', enter);
    card.addEventListener('pointerleave', leave);
    card.addEventListener('focusin', enter);
    card.addEventListener('focusout', leave);
    return [
      () => card.removeEventListener('pointerenter', enter),
      () => card.removeEventListener('pointerleave', leave),
      () => card.removeEventListener('focusin', enter),
      () => card.removeEventListener('focusout', leave),
    ];
  });
}

export function destroy() {
  cleanups.forEach((fn) => fn());
  cleanups = [];
  setState({ activeGroup: -1 });
}
