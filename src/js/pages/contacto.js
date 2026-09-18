let form;

function handleSubmit(event) {
  event.preventDefault();
  const numero = form.dataset.whatsapp;
  const nombre = form.nombre.value.trim();
  const negocio = form.negocio.value.trim();
  const mensaje = form.mensaje.value.trim();

  const texto = `Hola, soy ${nombre} de ${negocio}. ${mensaje}`;
  const url = `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;

  window.open(url, '_blank', 'noopener');
}

export function init() {
  form = document.getElementById('contact-form');
  form?.addEventListener('submit', handleSubmit);
}

export function destroy() {
  form?.removeEventListener('submit', handleSubmit);
}
