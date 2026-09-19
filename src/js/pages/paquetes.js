import { definePage } from '../dom/page.js';
import { setState } from '../../state.js';

// Las etapas (estado y cupos) salen del HTML generado desde pricing.json y alimentan la ruta 3D.
export const { init, destroy } = definePage((container) => {
  const stages = [...container.querySelectorAll('.pricing-stage')].map((stage) => ({
    id: stage.dataset.stage,
    estado: stage.dataset.estado,
    total: Number(stage.dataset.cupoTotal) || 0,
    disponible: Number(stage.dataset.cupoDisponible) || 0,
  }));
  setState({ stages });
});
