import { spawn } from 'node:child_process'

const SCRIPT = [
  '$value = [Console]::In.ReadToEnd().Trim()',
  '$data = [Convert]::FromBase64String($value)',
  '$plain = [Security.Cryptography.ProtectedData]::Unprotect($data, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)',
  '[Console]::Out.Write([Convert]::ToBase64String($plain))'
].join('; ')
const COMMAND = Buffer.from(SCRIPT, 'utf16le').toString('base64')

/** 用当前 Windows 用户的 DPAPI 解密浏览器 Local State 中的 Chromium 主密钥。 */
export function unprotect(encrypted: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', COMMAND], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk))
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk))
    child.once('error', reject)
    child.once('close', (code) => {
      if (code !== 0) {
        reject(new Error(`DPAPI 解密失败：${stderr.trim() || `PowerShell 退出码 ${code}`}`))
        return
      }
      try {
        const value = stdout.trim()
        if (!value) throw new Error('PowerShell 没有返回解密结果')
        resolve(Buffer.from(value, 'base64'))
      } catch (error) {
        reject(error)
      }
    })
    child.stdin.once('error', reject)
    child.stdin.end(encrypted.toString('base64'))
  })
}
