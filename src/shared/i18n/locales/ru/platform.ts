import type { Messages } from '../types'

// fileManager 只用在“Показать в {fileManager}”里，所以用前置格：в Проводнике / в файловом менеджере
export default {
  macFileManager: 'Finder',
  macReopenFrom: 'Dock или значок в строке меню',
  macAv1Hint: 'Самый компактный, нужен Mac на M1 или новее',
  macChromiumAuthHint: 'При импорте из браузеров на базе Chrome macOS запросит доступ к связке ключей — нажмите «Разрешить».',
  linuxFileManager: 'файловом менеджере',
  linuxChromiumAuthHint:
    'Данные входа браузеров на базе Chrome хранятся в системной связке ключей (keyring). Если при импорте появится запрос на её разблокировку, введите пароль для входа в систему.',
  winFileManager: 'Проводнике',
  winChromiumAuthHint: 'Ключ браузера расшифровывается от имени текущего пользователя Windows, окно запроса доступа не появится.',
  trayIcon: 'значок в трее',
  av1Hint: 'Самый компактный, на старых компьютерах воспроизведение может подтормаживать'
} satisfies Messages['platform']
