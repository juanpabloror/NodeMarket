import { definePage } from '../dom/page.js';
import { setState } from '../../state.js';

// Hover/foco en una tarjeta ilumina su constelación en la escena.
export const { init, destroy } = definePage((container) => {
  const cleanups = [...container.querySelectorAll('.service-card')].flatMap((card, index) => {
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

  return () => {
    cleanups.forEach((cleanup) => cleanup());
    setState({ activeGroup: -1 });
  };
});
