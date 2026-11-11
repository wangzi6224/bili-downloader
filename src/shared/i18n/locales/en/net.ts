import type { Messages } from '../types'

export default {
  cdnAliyun: 'Alibaba Cloud',
  cdnTencent: 'Tencent Cloud',
  cdnHuawei: 'Huawei Cloud',
  cdnAliyunOverseas: 'Alibaba Cloud (overseas)',
  cdnTencentOverseas: 'Tencent Cloud (overseas)',
  cdnAkamaiOverseas: 'Akamai (overseas)',
  direct: 'Direct',
  via: 'Via {url}',
  systemNoProxy: 'Use system proxy (none set, connecting directly)',
  proxyInvalid: 'Invalid proxy settings, switched to a direct connection: {reason}',
  proxyRequired: 'Enter a proxy address, e.g. http://127.0.0.1:7890',
  proxyBadFormat: 'Invalid proxy address format: {url}',
  socksUnsupported: 'SOCKS proxies aren’t supported yet. Use an HTTP proxy port instead',
  protocolUnsupported: 'Unsupported proxy protocol: {protocol}',
  portRequired: 'The proxy address needs a port, e.g. http://127.0.0.1:7890',
  systemSocks: 'The system proxy is a SOCKS proxy, which isn’t supported yet. Enter an HTTP proxy port manually instead'
} satisfies Messages['net']
