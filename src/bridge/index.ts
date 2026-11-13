// AI agent 按 stdio MCP 启动的入口：ELECTRON_RUN_AS_NODE=1 <应用> <本文件> --user-data <dir> --app <path>
// 只做接线，逻辑在 bridge.ts
import { Bridge, parseArgs } from './bridge'

const args = parseArgs(process.argv.slice(2))
if (!args) {
  process.stderr.write('usage: bridge --user-data <dir> --app <path>\n')
  process.exit(2)
}
// agent 先关掉了读的一端：没人收回复了，直接退出，不要抛出 EPIPE
process.stdout.on('error', () => process.exit(0))
// 等最后的回复写进管道再退出（管道写入是异步的，直接 exit 会丢掉还在缓冲里的内容）
void new Bridge({ ...args, input: process.stdin, output: process.stdout })
  .run()
  .then(() => process.stdout.write('', () => process.exit(0)))
