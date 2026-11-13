import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const shared = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: {
    resolve: { alias: shared },
    build: {
      rollupOptions: {
        // AI 去水印的推理子进程单独一个入口：由 utilityProcess 启动，和主进程不在一个进程里；
        // bridge 是 AI agent 按 stdio MCP 启动的桥接进程（ELECTRON_RUN_AS_NODE），只用 Node 自带模块
        input: {
          index: resolve('src/main/index.ts'),
          refineHost: resolve('src/main/watermark/ai/hostEntry.ts'),
          bridge: resolve('src/bridge/index.ts')
        }
      }
    }
  },
  preload: {
    resolve: { alias: shared }
  },
  renderer: {
    resolve: { alias: { ...shared, '@renderer': resolve('src/renderer/src') } },
    plugins: [react(), tailwindcss()]
  }
})
