import type { Messages } from '../types'

export default {
  varTitle: 'Название (части / серии)',
  varSeries: 'Общее название коллекции, сериала или видео из нескольких частей; у одиночного видео пусто',
  varIndex: 'Номер',
  varOwner: 'Автор',
  varOwnerMid: 'UID автора',
  varPubdate: 'Дата публикации',
  varDate: 'Время создания задачи',
  varQuality: 'Качество',
  varCodec: 'Кодек',
  varBvid: 'BV-номер',
  varAid: 'av-номер',
  varCid: 'cid',
  varEpId: 'ID серии аниме',
  varType: 'Тип (видео / аниме и кино)',
  empty: 'Шаблон не может быть пустым',
  nested: 'Необязательные фрагменты <…> нельзя вкладывать друг в друга',
  extraClose: 'Лишний символ >',
  unclosed: 'Необязательный фрагмент <…> не закрыт',
  /** variable 是带花括号的变量，例如 {foo} */
  unknownVar: 'Неизвестная переменная {variable}',
  unfinishedBrace: 'Фигурная скобка переменной не закрыта'
} satisfies Messages['naming']
