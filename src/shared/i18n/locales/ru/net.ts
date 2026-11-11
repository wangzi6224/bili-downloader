import type { Messages } from '../types'

export default {
  cdnAliyun: 'Alibaba Cloud',
  cdnTencent: 'Tencent Cloud',
  cdnHuawei: 'Huawei Cloud',
  cdnAliyunOverseas: 'Alibaba Cloud (за рубежом)',
  cdnTencentOverseas: 'Tencent Cloud (за рубежом)',
  cdnAkamaiOverseas: 'Akamai (за рубежом)',
  direct: 'Напрямую',
  via: 'Через {url}',
  systemNoProxy: 'Как в системе (в системе прокси не задан, подключение напрямую)',
  proxyInvalid: 'Ошибка в настройках прокси, используется прямое подключение: {reason}',
  proxyRequired: 'Укажите адрес прокси, например http://127.0.0.1:7890',
  proxyBadFormat: 'Неверный формат адреса прокси: {url}',
  socksUnsupported: 'SOCKS-прокси пока не поддерживаются, используйте порт HTTP-прокси',
  protocolUnsupported: 'Неподдерживаемый протокол прокси: {protocol}',
  portRequired: 'В адресе прокси нужно указать порт, например http://127.0.0.1:7890',
  systemSocks: 'Системный прокси — SOCKS, такой тип пока не поддерживается; укажите порт HTTP-прокси вручную'
} satisfies Messages['net']
