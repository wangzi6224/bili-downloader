// 推理子进程的入口（electron-vite 单独打包成 out/main/refineHost.js），只做接线，逻辑在 hostCore.ts。
// 在 Electron 里由 utilityProcess 启动，消息走 process.parentPort；脚本里用 child_process.fork 启动时走 process.send
import { createHost, type HostReply, type HostRequest, type OrtLike } from './hostCore'

/** onnxruntime-node 1.24 起不再提供 macOS Intel 版，Intel Mac 用 1.23（以别名装在 onnxruntime-node-legacy） */
const loadOrt = async (): Promise<OrtLike> => {
  const mod: { default?: unknown } =
    process.platform === 'darwin' && process.arch === 'x64' ? await import('onnxruntime-node-legacy') : await import('onnxruntime-node')
  return (mod.default ?? mod) as OrtLike
}

interface ParentPort {
  on(event: 'message', cb: (e: { data: HostRequest }) => void): void
  postMessage(m: HostReply): void
}

const parentPort = (process as unknown as { parentPort?: ParentPort }).parentPort

if (parentPort) {
  const handle = createHost(loadOrt, (r) => parentPort.postMessage(r))
  parentPort.on('message', (e) => void handle(e.data))
} else if (process.send) {
  const handle = createHost(loadOrt, (r) => process.send!(r))
  process.on('message', (m) => void handle(m as HostRequest))
  // 主进程没了就退出，不留下占着显存的孤儿进程
  process.on('disconnect', () => process.exit(0))
}
