import type { Messages } from '../types'

// 解析 B站链接、取流时的报错和界面上的分组标题、音质标签
export default {
  // http.ts
  authExpired: 'Сеанс истёк, войдите снова',
  riskControl: 'Запрос заблокирован защитой Bilibili от ботов (HTTP 412), попробуйте позже',
  serverError: 'Ошибка сервера Bilibili (HTTP {status})',
  networkFailed: 'Ошибка сетевого запроса: {error}',
  wbiKeyFailed: 'Не удалось получить ключ подписи WBI',
  badResponse: 'API вернул данные, которые не удалось разобрать (HTTP {status})',
  apiError: 'Ошибка API ({code})',

  // 解析结果里的分组标题
  groupAudioMenu: 'Плейлист',
  groupCourse: 'Курс',
  groupFav: 'Папка избранного',
  groupSpace: 'Видео автора',
  groupSeason: 'Коллекция',
  groupSeries: 'Серия видео',
  groupWatchLater: 'Смотреть позже',
  groupRank: 'Рейтинг: {label}',
  groupMain: 'Основные серии',
  groupStein: 'Фрагменты интерактивного видео',
  groupPages: 'Части',
  /** 收藏夹里已失效的视频 */
  unavailable: 'Недоступно',

  // lists.ts、lookup.ts、resolve.ts
  spaceRejected:
    'Bilibili временно отклонила запрос списка видео автора ({error}). Попробуйте позже или вставьте ссылку на коллекцию или папку избранного автора',
  weeklyNoNumber: 'Не удалось получить номер выпуска еженедельной подборки',
  captcha: 'Bilibili требует пройти проверку «я не робот», поиск не дал результатов',
  unrecognized: 'Не удалось распознать ссылку на видео, аниме, курс, папку избранного или автора Bilibili',
  batchAllFailed: {
    one: 'Не удалось проанализировать {count} ссылку: {error}',
    few: 'Не удалось проанализировать ни одну из {count} ссылок: {error}',
    many: 'Не удалось проанализировать ни одну из {count} ссылок: {error}',
    other: 'Не удалось проанализировать ни одну из {count} ссылки: {error}'
  },
  batchTitle: {
    one: 'Пакетный анализ ({count} источник)',
    few: 'Пакетный анализ ({count} источника)',
    many: 'Пакетный анализ ({count} источников)',
    other: 'Пакетный анализ ({count} источника)'
  },

  // 排行榜分区（界面显示用）
  rankAll: 'Все разделы',
  rankDouga: 'Анимация',
  rankMusic: 'Музыка',
  rankDance: 'Танцы',
  rankGame: 'Игры',
  rankKnowledge: 'Знания',
  rankTech: 'Технологии',
  rankSports: 'Спорт',
  rankCar: 'Авто',
  rankLife: 'Жизнь',
  rankFood: 'Еда',
  rankAnimal: 'Животные',
  rankKichiku: 'Kichiku (ремиксы)',
  rankFashion: 'Мода',
  rankEnt: 'Развлечения',
  rankCinephile: 'Кино и сериалы',
  rankOrigin: 'Оригинальное',
  rankRookie: 'Новички',

  // 音质
  audioBest: 'Лучшее',
  audioFlac: 'Hi-Res без потерь',
  audioDolby: 'Dolby Atmos',
  audioLossless: 'без потерь',
  /** 任务上显示的音频画质，label 例如“320K”“无损” */
  audioQuality: 'Аудио {label}',
  audioNoUrl: 'Не удалось получить адрес загрузки этого трека',
  audioNoUrlReason: 'Не удалось получить адрес загрузки этого трека: {reason}',

  // danmaku.ts
  danmakuHttpFailed: 'Не удалось скачать данмаку (HTTP {status})',

  // playurl.ts
  courseNoAccess: 'Нет доступа к просмотру этого урока (возможно, его нужно купить): {reason}',
  courseDrm: 'Этот урок защищён DRM, скачать его нельзя',
  coursePreview: 'Текущему аккаунту доступен только пробный просмотр этого урока (нужна покупка)',
  audioNotVideo: 'Аудио не получают через API видеопотоков',
  regionLocked: 'Региональное ограничение: {reason}',
  needVip: 'Нужен Bilibili Premium: {reason}',
  drm: 'Этот контент защищён DRM, скачать его нельзя',
  previewOnly: 'Текущему аккаунту доступен только пробный просмотр этого контента (нужен Bilibili Premium или покупка)',
  flvOnly: 'Это видео доступно только в старом формате FLV, который пока не поддерживается',
  noAudioTrack: 'У этого видео нет отдельной звуковой дорожки',
  noVideoStream: 'Нет доступных видеопотоков',
  codecFallback: 'Для этого качества нет {wanted}, вместо него используется {actual}',
  flacToMkv: 'Звук Hi-Res без потерь плохо совместим с MP4, поэтому используется MKV',
  /** 画质标签里“只下画面”的标记 */
  mute: 'без звука'
} satisfies Messages['bili']
