import type { Messages } from '../types'

export default {
  cdnAliyun: 'Alibaba Cloud',
  cdnTencent: 'Tencent Cloud',
  cdnHuawei: 'Huawei Cloud',
  cdnAliyunOverseas: 'Alibaba Cloud（海外）',
  cdnTencentOverseas: 'Tencent Cloud（海外）',
  cdnAkamaiOverseas: 'Akamai（海外）',
  direct: '直接接続',
  via: '{url} 経由で接続',
  systemNoProxy: 'システムに従う（システムにプロキシが設定されていないため直接接続）',
  proxyInvalid: 'プロキシの設定に誤りがあるため、直接接続に切り替えました：{reason}',
  proxyRequired: 'プロキシのアドレスを入力してください。例：http://127.0.0.1:7890',
  proxyBadFormat: 'プロキシのアドレスの形式が正しくありません：{url}',
  socksUnsupported: 'SOCKS プロキシにはまだ対応していません。HTTP プロキシのポートを使ってください',
  protocolUnsupported: '対応していないプロキシのプロトコルです：{protocol}',
  portRequired: 'プロキシのアドレスにはポートが必要です。例：http://127.0.0.1:7890',
  systemSocks: 'システムのプロキシは SOCKS 形式のため、まだ対応していません。HTTP プロキシのポートを手動で入力してください'
} satisfies Messages['net']
