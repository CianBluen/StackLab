import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    // G: 盘上的原生文件事件常常丢失，轮询能保证编辑后立刻 HMR。
    watch: {
      usePolling: true,
      interval: 400,
    },
  },
})
