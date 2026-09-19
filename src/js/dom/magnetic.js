import { gsap } from '../gsap.js';

const STRENGTH = 0.32;
const REACH = 44; // px alrededor del botón donde empieza a atraerse
const MAX_PULL = 18; // px máximos de desplazamiento, para que los botones anchos no se "vayan"
const pull = gsap.utils.clamp(-MAX_PULL, MAX_PULL);

// Botones magnéticos (solo puntero fino + movimiento permitido). Un solo listener global,
// así los botones de páginas nuevas funcionan sin volver a registrarlos.
export function setupMagnetic() {
  const movers = new Map();
  let raf = 0;
  let event = null;

  const mover = (button) => {
    if (!movers.has(button)) {
      movers.set(button, {
        x: gsap.quickTo(button, 'x', { duration: 0.6, ease: 'power3' }),
        y: gsap.quickTo(button, 'y', { duration: 0.6, ease: 'power3' }),
        active: false,
      });
    }
    return movers.get(button);
  };

  const frame = () => {
    raf = 0;
    for (const button of document.querySelectorAll('.btn')) {
      const box = button.getBoundingClientRect();
      const near =
        event &&
        event.clientX > box.left - REACH &&
        event.clientX < box.right + REACH &&
        event.clientY > box.top - REACH &&
        event.clientY < box.bottom + REACH;
      const m = near || movers.has(button) ? mover(button) : null;
      if (!m) continue;
      if (near) {
        m.active = true;
        m.x(pull((event.clientX - (box.left + box.width / 2)) * STRENGTH));
        m.y(pull((event.clientY - (box.top + box.height / 2)) * STRENGTH));
      } else if (m.active) {
        m.active = false;
        m.x(0);
        m.y(0);
      }
    }
  };

  const onMove = (e) => {
    event = e;
    if (!raf) raf = requestAnimationFrame(frame);
  };
  const onLeave = () => {
    event = null;
    if (!raf) raf = requestAnimationFrame(frame);
  };

  window.addEventListener('pointermove', onMove, { passive: true });
  document.documentElement.addEventListener('mouseleave', onLeave);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('pointermove', onMove);
    document.documentElement.removeEventListener('mouseleave', onLeave);
    movers.forEach((_, button) => gsap.set(button, { clearProps: 'x,y' }));
    movers.clear();
  };
}
