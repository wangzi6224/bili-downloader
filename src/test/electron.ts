// 测试里用它代替 electron 包：真正的包一导入就会检查、缺失时还会下载 Electron 可执行文件。
// 用到 Electron API 的测试自己 vi.mock('electron', …) 提供需要的部分
export {}
