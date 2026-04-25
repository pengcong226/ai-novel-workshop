import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    open: false,
    watch: {
      ignored: ['**/*.db', '**/*.db-journal', '**/*.db-wal', '**/ai_novel_workshop.db*']
    },
    allowedHosts: [
      '.ai-yuanjing.com',
      '.anthropic.com',
      '.openai.com',
      '.ggchan.dev'
    ],
    proxy: {
      // Claude API代理
      '/api/claude': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/claude/, ''),
        headers: {
          'anthropic-version': '2023-06-01'
        }
      },
      // OpenAI API代理
      '/api/openai': {
        target: 'https://api.openai.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/openai/, '')
      },
      // 自定义API代理
      '/api/custom': {
        target: 'https://api.example.com', // 占位符，动态设置
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            // 从请求体中读取实际的target URL
            let body = ''
            req.on('data', chunk => {
              body += chunk.toString()
            })
            req.on('end', () => {
              try {
                const data = JSON.parse(body)
                if (data.url) {
                  const url = new URL(data.url)
                  // 动态设置目标
                  proxyReq.host = url.host
                  proxyReq.path = url.pathname + (url.search || '')
                  proxyReq.setHeader('host', url.host)
                }
              } catch {
                // ignore parse errors on proxy request body
              }
            })
          })
        }
      }
    }
  },
  build: {
    sourcemap: true,
    // 优化代码分割
    rollupOptions: {
      output: {
        manualChunks: {
          // 将大型库分离到单独的chunk
          'element-plus': ['element-plus'],
          'echarts': ['echarts', 'vue-echarts'],
          'g6': ['@antv/g6'],
          'xlsx': ['xlsx'],
          'transformers': ['@xenova/transformers'],
          // 将vue生态相关库打包在一起
          'vue-vendor': ['vue', 'vue-router', 'pinia'],
        }
      }
    },
    // 提高chunk大小警告阈值
    chunkSizeWarningLimit: 1000
  },
  // 优化依赖预构建
  optimizeDeps: {
    include: [
      'vue',
      'vue-router',
      'pinia',
      'element-plus/es',
      'element-plus/es/components/message/style/css',
      'element-plus/es/components/notification/style/css',
      'element-plus/es/components/message-box/style/css'
    ],
    exclude: ['@xenova/transformers'] // transformers太大，排除预构建
  },
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-ssr/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      '**/.claude/worktrees/**',
      '**/.worktrees/**'
    ]
  }
})
