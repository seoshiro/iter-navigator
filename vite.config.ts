import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { REPORT_PUBLIC_META_VALUE, REPORT_SERVICE_META_NAME } from './shared/report-contract.ts';

export default defineConfig({
  plugins: [react(), {
    name: 'iter-public-report-marker',
    transformIndexHtml(html) {
      if (process.env.NAVIGATOR_HOSTED_BUILD !== 'public-demo') return html;
      return { html, tags: [{ tag: 'meta', attrs: { name: REPORT_SERVICE_META_NAME, content: REPORT_PUBLIC_META_VALUE }, injectTo: 'head' }] };
    },
  }],
  server: { host: '127.0.0.1', port: 5260, strictPort: true },
  preview: { host: '127.0.0.1', port: 4273, strictPort: true },
  test: { include: ['src/**/*.test.ts', 'tests/*.test.ts'], environment: 'node' },
});
