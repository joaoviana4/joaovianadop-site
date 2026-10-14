import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Publica em joaovianadop.com/bygrain/ (pasta bygrain/ na raiz do repositório).
// Para migrar para studio.bygrain.com basta mudar `base` para '/'.
export default defineConfig({
  base: '/bygrain/',
  build: {
    outDir: resolve(__dirname, '../../bygrain'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        studio: resolve(__dirname, 'index.html'),
        tasks: resolve(__dirname, 'tasks/index.html'),
      },
    },
  },
});
