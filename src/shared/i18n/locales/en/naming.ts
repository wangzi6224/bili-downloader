import type { Messages } from '../types'

export default {
  varTitle: 'Title (part / episode title)',
  varSeries: 'Overall title of the collection, series or multi-part video; empty for a single video',
  varIndex: 'Number',
  varOwner: 'Uploader',
  varOwnerMid: 'Uploader UID',
  varPubdate: 'Publish time',
  varDate: 'Task creation time',
  varQuality: 'Quality',
  varCodec: 'Codec',
  varBvid: 'BV ID',
  varAid: 'av ID',
  varCid: 'cid',
  varEpId: 'Anime episode ID',
  varType: 'Type (Video / Anime & TV)',
  empty: 'The template can’t be empty',
  nested: 'Optional sections <…> can’t be nested',
  extraClose: 'Extra >',
  unclosed: 'Optional section <…> isn’t closed',
  /** variable 是带花括号的变量，例如 {foo} */
  unknownVar: 'Unknown variable {variable}',
  unfinishedBrace: 'A variable’s braces aren’t complete'
} satisfies Messages['naming']
