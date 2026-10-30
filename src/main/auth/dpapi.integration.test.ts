import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { unprotect } from './dpapi'

describe.runIf(process.platform === 'win32')('Windows DPAPI integration', () => {
  it('decrypts a synthetic value protected for the current Windows user', async () => {
    const plain = Buffer.from('synthetic Chromium master key')
    const script = [
      '$value = [Console]::In.ReadToEnd().Trim()',
      '$data = [Convert]::FromBase64String($value)',
      '$wrapped = [Security.Cryptography.ProtectedData]::Protect($data, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)',
      '[Console]::Out.Write([Convert]::ToBase64String($wrapped))'
    ].join('; ')
    const command = Buffer.from(script, 'utf16le').toString('base64')
    const encrypted = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', command],
      { input: plain.toString('base64'), encoding: 'utf8' }
    ).trim()

    await expect(unprotect(Buffer.from(encrypted, 'base64'))).resolves.toEqual(plain)
  })
})
