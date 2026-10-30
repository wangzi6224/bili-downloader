/** 将 PNG 载荷封装成 Windows ICO 文件。 */
export function encodeIco(icons) {
  if (!icons.length) throw new Error('ICO 至少需要一个尺寸')
  const headerSize = 6 + icons.length * 16
  const header = Buffer.alloc(headerSize)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(icons.length, 4)
  let offset = headerSize
  const payload = []
  icons.forEach(({ size, data }, index) => {
    if (!Number.isInteger(size) || size < 1 || size > 256) throw new Error(`ICO 尺寸无效：${size}`)
    const entry = 6 + index * 16
    header[entry] = size === 256 ? 0 : size
    header[entry + 1] = size === 256 ? 0 : size
    header[entry + 2] = 0
    header[entry + 3] = 0
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(data.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    payload.push(data)
    offset += data.length
  })
  return Buffer.concat([header, ...payload])
}
