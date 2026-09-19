import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DATA_DIR = resolve(process.cwd(), 'src/data');

// Un valor "TODO: ..." (o vacío) significa que el cliente aún no lo ha llenado.
export const isTodo = (value) => typeof value !== 'string' || value.trim() === '' || /^TODO\b/i.test(value.trim());

// Devuelve https://dominio.com (sin barra final) o '' mientras el dominio siga en TODO o no sea válido.
export function normalizeOrigin(value) {
  if (isTodo(value)) return '';
  const raw = value.trim().replace(/\/+$/, '');
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(url.hostname) ? url.origin : '';
  } catch {
    return '';
  }
}

const ESTADOS = ['abierta', 'proximamente', 'cerrada'];

// Valida el estado de cada etapa y calcula el texto de cupos ("Quedan X de N lugares") a partir de los números.
function prepareStages(pricing) {
  for (const stage of pricing.stages) {
    if (!ESTADOS.includes(stage.estado)) {
      throw new Error(
        `pricing.json → etapa "${stage.id}": estado "${stage.estado}" no es válido (usa: ${ESTADOS.join(', ')}).`
      );
    }
    const total = Number(stage.cupoTotal);
    const libres = Number(stage.cupoDisponible);
    if (!Number.isFinite(total) || total <= 0) {
      stage.cupoTexto = null;
    } else if (libres <= 0) {
      stage.cupoTexto = 'Cupo lleno';
    } else {
      stage.cupoTexto = `${libres === 1 ? 'Queda' : 'Quedan'} ${libres} de ${total} lugares`;
    }
  }
}

export function loadData() {
  const site = JSON.parse(readFileSync(resolve(DATA_DIR, 'site.json'), 'utf-8'));
  const pricing = JSON.parse(readFileSync(resolve(DATA_DIR, 'pricing.json'), 'utf-8'));
  site.marca.origin = normalizeOrigin(site.marca.dominio);
  prepareStages(pricing);
  return { site, pricing };
}

// JSON-LD ProfessionalService: solo incluye campos con datos reales (nunca los TODO).
export function professionalServiceJsonLd(site) {
  const { marca, contacto } = site;
  const data = {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    name: marca.nombre,
    description: marca.descripcionCorta,
  };
  if (marca.origin) {
    data.url = marca.origin;
    data.image = `${marca.origin}/og-image.jpg`;
  }
  if (!isTodo(contacto.email)) data.email = contacto.email;
  if (!isTodo(contacto.ciudad)) data.areaServed = contacto.ciudad;
  const digits = String(contacto.whatsappNumero ?? '').replace(/\D/g, '');
  if (!isTodo(contacto.whatsappNumero) && digits.length >= 10) data.telephone = `+${digits}`;
  const sameAs = Object.values(contacto.redes ?? {}).filter((url) => /^https?:\/\//i.test(url));
  if (sameAs.length) data.sameAs = sameAs;

  const json = JSON.stringify(data, null, 2).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">\n${json}\n</script>`;
}
