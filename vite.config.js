import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import htmlDataPartials from './vite-plugins/html-data-partials.js';
import seoFiles from './vite-plugins/seo-files.js';

const page = (dir) => resolve(__dirname, dir, 'index.html');

export default defineConfig({
  plugins: [htmlDataPartials(), seoFiles()],
  build: {
    // El chunk de la escena (three.js) se carga en diferido, tras el primer render.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      input: {
        inicio: page('.'),
        servicios: page('servicios'),
        paquetes: page('paquetes'),
        portafolio: page('portafolio'),
        nosotros: page('nosotros'),
        faq: page('preguntas-frecuentes'),
        contacto: page('contacto'),
        notfound: resolve(__dirname, '404.html'),
      },
    },
  },
});
