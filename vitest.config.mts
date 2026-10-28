import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@shared': resolve('src/shared'), electron: resolve('src/test/electron.ts') }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'scripts/lib/**/*.mjs'],
      exclude: [
        '**/*.test.*',
        'src/test/**',
        // 入口只做组装，可测的逻辑已经拆到 windowState.ts
        'src/main/index.ts',
        // 纯展示的 JSX，逻辑在 src/renderer/src/*.ts 里测
        'src/renderer/src/main.tsx',
        'src/renderer/src/App.tsx',
        'src/renderer/src/components/**',
        // 只有类型
        'src/shared/types.ts',
        'src/renderer/src/env.d.ts'
      ],
      // 逐文件的明细看 coverage/index.html
      reporter: ['text-summary', 'html'],
      // 低于门槛 npm run build 会失败。门槛按实测值留了 1～2 个点的余量，补了测试、覆盖率上去后可以跟着调高
      thresholds: { statements: 98, branches: 96, functions: 98, lines: 98 }
    }
  }
})
