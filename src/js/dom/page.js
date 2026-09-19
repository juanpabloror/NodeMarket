import { gsap } from '../gsap.js';
import { setupReveals } from './reveals.js';
import { setupNodeLine } from './nodeLine.js';

const CONDITIONS = {
  motion: '(prefers-reduced-motion: no-preference)',
  reduce: '(prefers-reduced-motion: reduce)',
};

// Cada página se define con definePage(setup): el contexto de GSAP (ScrollTriggers, SplitText,
// listeners) se crea en init(container) y se revierte por completo en destroy().
export function definePage(setup) {
  let mm = null;

  return {
    init(container) {
      mm = gsap.matchMedia();
      mm.add(CONDITIONS, (context) => {
        const { motion } = context.conditions;
        const cleanups = [
          setupReveals(container, { motion }),
          setupNodeLine(container, { motion }),
          setup?.(container, context.conditions),
        ];
        return () => cleanups.forEach((cleanup) => typeof cleanup === 'function' && cleanup());
      });
    },

    destroy() {
      mm?.revert();
      mm = null;
    },
  };
}
