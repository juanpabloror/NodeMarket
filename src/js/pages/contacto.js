import { definePage } from '../dom/page.js';

// El formulario arma el mensaje de WhatsApp con los datos capturados.
export const { init, destroy } = definePage((container) => {
  const form = container.querySelector('#contact-form');
  if (!form) return;

  const onSubmit = (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const texto = `Hola, soy ${form.nombre.value.trim()} de ${form.negocio.value.trim()}. ${form.mensaje.value.trim()}`;
    window.open(`https://wa.me/${form.dataset.whatsapp}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
  };

  form.addEventListener('submit', onSubmit);
  return () => form.removeEventListener('submit', onSubmit);
});
