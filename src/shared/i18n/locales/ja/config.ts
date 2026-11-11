import type { Messages } from '../types'

export default {
  exportTitle: '設定をエクスポート',
  importTitle: '設定をインポート',
  exported: '{path} にエクスポートしました',
  invalidJson: 'このファイルは有効な JSON ではありません',
  notOurs: 'このアプリでエクスポートした設定ファイルではありません',
  imported: '設定と {count} 件の購読をインポートしました（{app} で {date} にエクスポート）',
  namingInvalid: '命名テンプレートに誤りがあります：{reason}'
} satisfies Messages['config']
