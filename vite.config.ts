import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

const devServerHost = process.env.VITE_DEV_SERVER_HOST ?? '127.0.0.1'
const devAllowedHosts = (process.env.VITE_DEV_ALLOWED_HOSTS ?? '')
  .split(',')
  .map(host => host.trim())
  .filter(Boolean)

function getCustomProxyTarget(): string | undefined {
  const rawTarget = process.env.VITE_CUSTOM_PROXY_TARGET?.trim()
  if (!rawTarget) return undefined

  const target = new URL(rawTarget)
  if (target.protocol !== 'https:') {
    throw new Error('VITE_CUSTOM_PROXY_TARGET must use https://')
  }

  return target.origin
}

const customProxyTarget = getCustomProxyTarget()

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  server: {
    host: devServerHost,
    port: 3000,
    open: false,
    watch: {
      ignored: ['**/*.db', '**/*.db-journal', '**/*.db-wal', '**/ai_novel_workshop.db*']
    },
    allowedHosts: devAllowedHosts,
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
      ...(customProxyTarget
        ? {
          '/api/custom': {
            target: customProxyTarget,
            changeOrigin: true,
            secure: true,
            rewrite: (path: string) => path.replace(/^\/api\/custom/, '')
          }
        }
        : {})
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
