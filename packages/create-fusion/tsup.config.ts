import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18',
  platform: 'node',
  outDir: 'build/esm',
  sourcemap: true,
  clean: true,
  dts: false,
  minify: false,
  // CLI 入口需要 shebang 才能作为可执行文件运行
  banner: {
    js: '#!/usr/bin/env node',
  },
})
