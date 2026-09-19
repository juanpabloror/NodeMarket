import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadData, professionalServiceJsonLd } from './site-data.js';

const PARTIALS_DIR = resolve(process.cwd(), 'src/partials');

const INCLUDE_RE = /<!--\s*@include\s+([\w-]+)\s*-->/g;
const EACH_RE = /<!--\s*@each\s+([\w.]+)\s+as\s+(\w+)\s*-->([\s\S]*?)<!--\s*@endeach\s*-->/;
const IF_RE = /<!--\s*@if\s+([\w.]+)\s*-->([\s\S]*?)<!--\s*@endif\s*-->/g;
const JSONLD_RE = /<!--\s*@jsonld\s*-->/g;
const VAR_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

const filters = {
  mxn(value, fallback) {
    if (fallback) return fallback;
    if (value === null || value === undefined || value === '') return '';
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      maximumFractionDigits: 0,
    }).format(Number(value));
  },
  enc(value) {
    return encodeURIComponent(value ?? '');
  },
};

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getPath(scope, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), scope);
}

function resolveArg(raw, scope) {
  const trimmed = raw.trim();
  if (/^".*"$/.test(trimmed)) return trimmed.slice(1, -1);
  return getPath(scope, trimmed);
}

function resolveVars(html, scope) {
  return html.replace(VAR_RE, (_, expr) => {
    const [pathExpr, filterExpr] = expr.split('|').map((s) => s.trim());
    let value = getPath(scope, pathExpr);
    if (filterExpr) {
      const [filterName, argRaw] = filterExpr.split(':').map((s) => s.trim());
      const filterFn = filters[filterName];
      const arg = argRaw !== undefined ? resolveArg(argRaw, scope) : undefined;
      if (filterFn) value = filterFn(value, arg);
    }
    return escapeHtml(value);
  });
}

function resolveEach(html, scope) {
  let output = html;
  let match;
  let guard = 0;
  while ((match = EACH_RE.exec(output)) && guard < 50) {
    const [full, arrayPath, itemName, template] = match;
    const array = getPath(scope, arrayPath) ?? [];
    const rendered = array
      .map((item, index) =>
        resolveVars(template, { ...scope, [itemName]: item, [`${itemName}Index`]: index + 1 })
      )
      .join('');
    output = output.slice(0, match.index) + rendered + output.slice(match.index + full.length);
    guard += 1;
  }
  return output;
}

// <!--@if ruta.al.dato-->...<!--@endif--> deja el bloque solo si el dato existe y no está vacío.
function resolveIf(html, scope) {
  return html.replace(IF_RE, (_, path, body) => (getPath(scope, path) ? body : ''));
}

function resolveIncludes(html) {
  let output = html;
  let guard = 0;
  while (INCLUDE_RE.test(output) && guard < 10) {
    INCLUDE_RE.lastIndex = 0;
    output = output.replace(INCLUDE_RE, (_, name) => {
      try {
        return readFileSync(resolve(PARTIALS_DIR, `${name}.html`), 'utf-8');
      } catch {
        return `<!-- partial "${name}" no encontrado -->`;
      }
    });
    guard += 1;
  }
  return output;
}

export default function htmlDataPartials() {
  return {
    name: 'html-data-partials',
    transformIndexHtml: {
      // Debe correr antes de que Vite escanee el HTML en busca de <link>/<script>
      // a empaquetar: los parciales inyectan esas etiquetas y deben existir ya
      // en el HTML cuando Vite hace ese escaneo.
      order: 'pre',
      handler(html) {
        const scope = loadData();

        let output = resolveIncludes(html);
        output = output.replace(JSONLD_RE, () => professionalServiceJsonLd(scope.site));
        output = resolveEach(output, scope);
        output = resolveIf(output, scope);
        output = resolveVars(output, scope);
        return output;
      },
    },
  };
}
