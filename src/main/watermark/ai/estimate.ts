// 预计处理时间：推理和“解码 + 换算 + 编码”同时进行，取慢的那个，再加上开始前的准备
import type { Backend } from './hostCore'
import { cpuEfficiency } from './backend'

/** 解码、切长条、写回、编码这条流水线在 1080p 下大约每秒能走这么多帧（不含推理） */
const PIPE_FPS_1080P = 150
/** 开始前的准备：抽帧算掩码、加载模型、试跑 */
const PREPARE_SEC = 15

export interface EstimateInput {
  frames: number
  /** 能沿用上一次结果、不用推理的帧的比例 */
  reuse: number
  msPerFrame: number
  backend: Backend
  hosts: number
  width: number
  height: number
}

/** 推理每秒能处理的帧数 */
export function inferFps(backend: Backend, msPerFrame: number, hosts: number): number {
  const one = 1000 / Math.max(1, msPerFrame)
  return backend === 'cpu' ? one * hosts * cpuEfficiency(hosts) : one
}

/** 返回 [乐观, 保守] 的秒数 */
export function estimateSeconds(o: EstimateInput): [number, number] {
  const fps = inferFps(o.backend, o.msPerFrame, o.hosts)
  const pipeFps = PIPE_FPS_1080P * ((1920 * 1080) / Math.max(1, o.width * o.height))
  const pipe = o.frames / pipeFps
  const at = (reuse: number): number => PREPARE_SEC + Math.max(pipe, (o.frames * (1 - reuse)) / fps)
  // 沿用比例是抽样估的，保守的那头按一半算
  return [Math.round(at(o.reuse) * 0.9), Math.round(at(o.reuse / 2) * 1.15)]
}
