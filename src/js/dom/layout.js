// Las páginas internas con la oficina en 3D muestran su contenido en un panel anclado al objeto
// (solo en pantallas anchas; en angostas el contenido baja con el scroll de siempre).
export const PANEL_QUERY = '(min-width: 62rem)';

export const isPanelMode = () =>
  document.documentElement.classList.contains('story-3d') && window.matchMedia(PANEL_QUERY).matches;
