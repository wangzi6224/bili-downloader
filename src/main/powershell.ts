import { win32 } from 'node:path'

/** 写完整路径：只给 powershell.exe 时，Windows 会先在当前目录里找同名程序 */
export const POWERSHELL = win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')

/**
 * 脚本编码成 -EncodedCommand 的参数（UTF-16LE 的 base64）：不用落盘，中文不会乱码，
 * 组策略设了 AllSigned 等执行策略时也照样能跑（执行策略只管 .ps1 文件）
 */
export const encodeCommand = (script: string): string => Buffer.from(script, 'utf16le').toString('base64')
