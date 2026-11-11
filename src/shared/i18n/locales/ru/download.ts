import type { Messages } from '../types'

// 下载、合并、附加内容（封面、字幕、弹幕）相关的报错和提示
export default {
  // errors.ts：文件系统错误
  diskFull: 'Недостаточно места на диске',
  /** 拼在下面几条报错后面，指出出错的路径 */
  atPath: ': {path}',
  noWritePermission: 'Нет прав на запись{where}',
  readOnlyDisk: 'Целевой диск доступен только для чтения{where}',
  dirMissing: 'Папка загрузок не существует или внешний диск отключён{where}',
  writeFailed: 'Не удалось записать файл ({code}){where}',

  // extras.ts
  coverFailed: 'Не удалось скачать обложку: {error}',
  noCcSubtitle: 'Нет CC-субтитров',
  subtitleFailed: 'Не удалось получить субтитры/главы: {error}',
  danmakuFailed: 'Не удалось скачать данмаку: {error}',
  coverSaveFailed: 'Не удалось сохранить обложку: {error}',
  subtitleSaveFailed: 'Не удалось сохранить субтитры: {error}',
  danmakuSaveFailed: 'Не удалось сохранить данмаку: {error}',
  nfoSaveFailed: 'Не удалось сохранить NFO: {error}',
  embedFallback: 'Не удалось встроить обложку/субтитры/главы в видео, они сохранены отдельными файлами',

  // fetchFile.ts
  sizeFailed: 'Не удалось получить размер файла (HTTP {status})',
  connectFailed: 'Не удалось подключиться к серверу загрузки: {error}',
  timeout: 'Время ожидания соединения истекло',
  httpFailed: 'Ошибка загрузки (HTTP {status})',
  badRange: 'Сервер вернул неверный диапазон данных',
  interrupted: 'Соединение прервано',
  incomplete: 'Файл неполный ({done}/{total})',

  // manager.ts
  deleteFailed: {
    one: 'Не удалось удалить {count} файл: {files}',
    few: 'Не удалось удалить {count} файла: {files}',
    many: 'Не удалось удалить {count} файлов: {files}',
    other: 'Не удалось удалить {count} файла: {files}'
  },
  busy: 'Это видео сейчас обрабатывается, дождитесь окончания',
  badRegion: 'Недопустимая область водяного знака',
  fileLocked: 'Исходное видео занято другой программой, заменить его не удалось',

  // mux.ts：ffmpeg 报错，action 是下面三个之一（俄语里放在“Не удалось выполнить {action}”中，用宾格）
  actionMux: 'объединение',
  actionWatermark: 'удаление водяного знака',
  actionRead: 'чтение видео',
  ffNoSpace: 'Не удалось выполнить {action}: недостаточно места на диске',
  ffNoPermission: 'Не удалось выполнить {action}: нет прав на запись в целевую папку',
  ffLogoOutside: 'Не удалось выполнить {action}: водяной знак выходит за пределы кадра',
  ffEncoder: 'Не удалось выполнить {action}: кодировщик недоступен',
  ffCorrupt: 'Не удалось выполнить {action}: скачанный файл повреждён, нажмите «Скачать заново»',
  ffContainer: 'Не удалось выполнить объединение: этот кодек не поддерживается текущим контейнером, выберите MKV в настройках',
  ffExit: 'Не удалось выполнить {action} (код выхода ffmpeg {code}): {detail}',
  ffSpawn: 'Не удалось запустить ffmpeg: {error}',
  muxTimeout: 'Время объединения истекло, ffmpeg не отвечает'
} satisfies Messages['download']
