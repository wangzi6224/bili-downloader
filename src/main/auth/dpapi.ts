import { spawn } from 'node:child_process'
import { encodeCommand, POWERSHELL } from '../powershell'

/** 从 stdin 读每行一个 base64 密文，按同样的顺序每行输出一个 base64 明文 */
const SCRIPT = [
  'Add-Type -AssemblyName System.Security',
  "$lines = [Console]::In.ReadToEnd() -split '\\s+' | Where-Object { $_ }",
  'foreach ($line in $lines) {',
  '  $plain = [System.Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($line), $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)',
  '  [Console]::Out.WriteLine([Convert]::ToBase64String($plain))',
  '}'
].join('\n')
const COMMAND = encodeCommand(SCRIPT)
/** 解密本身很快，主要是 PowerShell 启动要时间（杀毒软件扫描时会更慢） */
const TIMEOUT_MS = 30_000

/**
 * 用当前 Windows 用户的 DPAPI 解密：Local State 里的 Chromium 主密钥，或旧版 Chromium 逐条加密的 Cookie。
 * 多条一起交给同一个 PowerShell，免得每条都启动一个进程
 */
export function unprotect(encrypted: Buffer[]): Promise<Buffer[]> {
  if (!encrypted.length) return Promise.resolve([])
  return new Promise((resolve, reject) => {
    const child = spawn(POWERSHELL, ['-NoProfile', '-NonInteractive', '-EncodedCommand', COMMAND], {
      windowsHide: true,
      timeout: TIMEOUT_MS,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk))
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk))
    child.once('error', reject)
    child.once('close', (code, signal) => {
      if (signal) return reject(new Error('DPAPI 解密超时，请改用应用内登录或手动粘贴 Cookie'))
      if (code !== 0) return reject(new Error(`DPAPI 解密失败：${stderr.trim() || `PowerShell 退出码 ${code}`}`))
      const lines = stdout.split(/\s+/).filter(Boolean)
      if (lines.length !== encrypted.length) return reject(new Error('PowerShell 没有返回完整的解密结果'))
      resolve(lines.map((line) => Buffer.from(line, 'base64')))
    })
    child.stdin.once('error', reject)
    child.stdin.end(encrypted.map((e) => e.toString('base64')).join('\n'))
  })
}
