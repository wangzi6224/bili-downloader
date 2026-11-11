import type { Messages } from '../types'

export default {
  cdnAliyun: 'Alibaba Cloud',
  cdnTencent: 'Tencent Cloud',
  cdnHuawei: 'Huawei Cloud',
  cdnAliyunOverseas: 'Alibaba Cloud (estero)',
  cdnTencentOverseas: 'Tencent Cloud (estero)',
  cdnAkamaiOverseas: 'Akamai (estero)',
  direct: 'Connessione diretta',
  via: 'Connessione tramite {url}',
  systemNoProxy: 'Come il sistema (nessun proxy impostato nel sistema, connessione diretta)',
  proxyInvalid: 'Impostazioni proxy non valide, si usa la connessione diretta: {reason}',
  proxyRequired: 'Inserisci l’indirizzo del proxy, ad esempio http://127.0.0.1:7890',
  proxyBadFormat: 'Formato dell’indirizzo proxy non valido: {url}',
  socksUnsupported: 'I proxy SOCKS non sono ancora supportati: usa una porta proxy HTTP',
  protocolUnsupported: 'Protocollo proxy non supportato: {protocol}',
  portRequired: 'L’indirizzo del proxy deve includere la porta, ad esempio http://127.0.0.1:7890',
  systemSocks: 'Il proxy di sistema è di tipo SOCKS, non ancora supportato: imposta manualmente una porta proxy HTTP'
} satisfies Messages['net']
