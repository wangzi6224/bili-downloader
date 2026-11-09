// AI 精修用到的单例：模型（下载、缓存）和对话框里的预览会话
import { spawnHost } from './hostSpawn'
import { AiModel } from './model'
import { AiSessions } from './session'

let model: AiModel | undefined
let sessions: AiSessions | undefined

export const aiModel = (): AiModel => (model ??= new AiModel())
export const aiSessions = (): AiSessions => (sessions ??= new AiSessions(aiModel(), spawnHost))
export { spawnHost }
