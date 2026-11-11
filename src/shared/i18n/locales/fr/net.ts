import type { Messages } from '../types'

export default {
  cdnAliyun: 'Alibaba Cloud',
  cdnTencent: 'Tencent Cloud',
  cdnHuawei: 'Huawei Cloud',
  cdnAliyunOverseas: 'Alibaba Cloud (hors Chine)',
  cdnTencentOverseas: 'Tencent Cloud (hors Chine)',
  cdnAkamaiOverseas: 'Akamai (hors Chine)',
  direct: 'Connexion directe',
  via: 'Connexion via {url}',
  systemNoProxy: 'Proxy du système (aucun proxy configuré, connexion directe)',
  proxyInvalid: 'Réglage du proxy incorrect, connexion directe utilisée : {reason}',
  proxyRequired: 'Saisissez l’adresse du proxy, par exemple http://127.0.0.1:7890',
  proxyBadFormat: 'Adresse de proxy mal formée : {url}',
  socksUnsupported: 'Les proxys SOCKS ne sont pas encore pris en charge, utilisez un port de proxy HTTP',
  protocolUnsupported: 'Protocole de proxy non pris en charge : {protocol}',
  portRequired: 'L’adresse du proxy doit inclure un port, par exemple http://127.0.0.1:7890',
  systemSocks: 'Le proxy du système est de type SOCKS, non pris en charge pour l’instant ; saisissez manuellement un port de proxy HTTP'
} satisfies Messages['net']
