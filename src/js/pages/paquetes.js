import { setState } from '../../state.js';

export function init() {
  const stages = [...document.querySelectorAll('.pricing-stage')].map((el) => ({
    id: el.dataset.stage,
    estado: el.dataset.estado,
    total: Number(el.dataset.cupoTotal) || 0,
    disponible: Number(el.dataset.cupoDisponible) || 0,
  }));
  setState({ stages });
}

export function destroy() {
  setState({ stages: [] });
}
