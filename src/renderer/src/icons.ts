import { createLucideIcon } from 'lucide-react'

/**
 * 去水印：视频画面里右上角的小标记被划掉。和 lucide 一样画在 24×24 的格子里，
 * 能直接交给 IconButton、Button 这些接受 lucide 图标的组件
 */
export const WatermarkOff = createLucideIcon('watermark-off', [
  ['rect', { x: '2', y: '4', width: '20', height: '16', rx: '2', key: 'frame' }],
  ['rect', { x: '10', y: '7', width: '9', height: '5', rx: '1', key: 'mark' }],
  ['path', { d: 'm8.5 14 12-9', key: 'slash' }]
])
