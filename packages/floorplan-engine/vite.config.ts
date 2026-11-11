import { defineConfig } from 'vitest/config'

export default defineConfig({
  build: {
    // Type definitions are written to dist by tsc, so Vite must not clear the folder.
    emptyOutDir: false,
    sourcemap: true,
    lib: {
      entry: {
        index: 'src/index.ts',
        schema: 'src/schema/index.ts',
        model: 'src/model/index.ts',
      },
      formats: ['es'],
    },
    rollupOptions: {
      // three is a peer dependency and zod a normal dependency; neither is bundled.
      external: [/^three($|\/)/, /^zod($|\/)/],
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
