import type { Messages } from '../types'

export default {
  varTitle: '제목(파트 / 회차 제목)',
  varSeries: '컬렉션, 시리즈 또는 여러 파트로 된 영상의 전체 제목. 단일 영상이면 비어 있음',
  varIndex: '번호',
  varOwner: '업로더',
  varOwnerMid: '업로더 UID',
  varPubdate: '게시 시간',
  varDate: '작업을 만든 시간',
  varQuality: '화질',
  varCodec: '코덱',
  varBvid: 'BV 번호',
  varAid: 'av 번호',
  varCid: 'cid',
  varEpId: '애니메이션 회차 ID',
  varType: '유형(영상 / 애니메이션·영화·드라마)',
  empty: '템플릿은 비워 둘 수 없습니다',
  nested: '선택 구간 <…>은 중첩할 수 없습니다',
  extraClose: '> 가 하나 더 있습니다',
  unclosed: '선택 구간 <…>이 닫히지 않았습니다',
  unknownVar: '알 수 없는 변수 {variable}',
  unfinishedBrace: '변수의 중괄호가 제대로 닫히지 않았습니다'
} satisfies Messages['naming']
