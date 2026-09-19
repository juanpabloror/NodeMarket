import { loadData } from './site-data.js';

const PRELOAD_FONTS = [/bricolage-grotesque-latin-wght-normal-[\w-]+\.woff2$/, /inter-latin-wght-normal-[\w-]+\.woff2$/];

// Emite robots.txt y sitemap.xml al construir, y precarga las fuentes críticas.
// Con el dominio aún en TODO no hay origen absoluto: robots.txt sale sin Sitemap y se omite el sitemap.
export default function seoFiles() {
  return {
    name: 'seo-files',

    generateBundle() {
      const { site } = loadData();
      const origin = site.marca.origin;
      const lines = ['User-agent: *', 'Allow: /'];

      if (origin) {
        lines.push('', `Sitemap: ${origin}/sitemap.xml`);
        const today = new Date().toISOString().slice(0, 10);
        const urls = site.nav
          .map((item) => `  <url>\n    <loc>${origin}${item.href}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`)
          .join('\n');
        this.emitFile({
          type: 'asset',
          fileName: 'sitemap.xml',
          source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
        });
      } else {
        this.warn('site.json → marca.dominio sigue en TODO: se omite sitemap.xml y las URLs canónicas / Open Graph absolutas.');
      }

      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `${lines.join('\n')}\n` });
    },

    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle) return html;
        const tags = Object.keys(ctx.bundle)
          .filter((file) => PRELOAD_FONTS.some((re) => re.test(file)))
          .map((file) => ({
            tag: 'link',
            attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `/${file}`, crossorigin: '' },
            injectTo: 'head-prepend',
          }));
        return { html, tags };
      },
    },
  };
}
