export function serializeDeploymentMarker({ sha, version }) {
  if (typeof sha !== 'string' || !/^[a-f0-9]{40}$/i.test(sha)) {
    throw new Error('GITHUB_SHA 缺失或格式无效')
  }
  if (typeof version !== 'string' || !version) throw new Error('官网版本号缺失')
  return `${JSON.stringify({ sha, version }, null, 2)}\n`
}
