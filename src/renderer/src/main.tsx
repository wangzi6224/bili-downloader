import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// 样式里按系统区分（macOS 有毛玻璃和红绿灯，Windows / Linux 用系统标题栏）
document.documentElement.dataset.platform = window.api.platform

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
