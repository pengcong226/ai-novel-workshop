import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

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
const isAnalyze = process.env.ANALYZE === 'true'

// Conditionally load bundle visualizer for build:analyze
const analyzePlugin = isAnalyze
  ? (await import('rollup-plugin-visualizer')).visualizer({
      open: true,
      filename: 'dist/stats.html',
      gzipSize: true,
      brotliSize: true,
    })
  : null

export default defineConfig({
  plugins: [
    vue(),
    AutoImport({
      resolvers: [ElementPlusResolver()],
    }),
    Components({
      resolvers: [ElementPlusResolver()],
    }),
    ...(analyzePlugin ? [analyzePlugin] : []),
  ],
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `@use "@/styles/responsive.scss" as *;\n`,
      },
    },
  },
  define: {
    __APP_IS_TAURI__: Boolean(process.env.TAURI_ENV_PLATFORM)
  },
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
      '/api/claude': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/claude/, ''),
        headers: {
          'anthropic-version': '2023-06-01'
        }
      },
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
    cssCodeSplit: true,
    cssMinify: 'esbuild',
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        manualChunks(id: string) {
          const normalizedId = id.split('\\').join('/')
          if (
            normalizedId.includes('/node_modules/vue/') ||
            normalizedId.includes('/node_modules/vue-router/') ||
            normalizedId.includes('/node_modules/pinia/')
          ) return 'vue-vendor'
          if (normalizedId.includes('/node_modules/element-plus/')) return 'element-plus'
          if (
            normalizedId.includes('/node_modules/echarts/') ||
            normalizedId.includes('/node_modules/vue-echarts/') ||
            normalizedId.includes('/node_modules/zrender/')
          ) return 'echarts'
          if (
            normalizedId.includes('/node_modules/@tiptap/') ||
            normalizedId.includes('/node_modules/prosemirror-')
          ) return 'tiptap'
          if (normalizedId.includes('/node_modules/@antv/')) return 'g6'
          if (normalizedId.includes('/node_modules/vis-')) return 'vis-timeline'
          if (normalizedId.includes('/node_modules/xlsx/')) return 'xlsx'
          if (normalizedId.includes('/node_modules/@xenova/')) return 'transformers'
          if (
            normalizedId.includes('/node_modules/konva/') ||
            normalizedId.includes('/node_modules/vue-konva/')
          ) return 'konva'
          if (
            normalizedId.includes('/node_modules/lodash-es/') ||
            normalizedId.includes('/node_modules/marked/') ||
            normalizedId.includes('/node_modules/js-yaml/') ||
            normalizedId.includes('/node_modules/jszip/') ||
            normalizedId.includes('/node_modules/ajv/') ||
            normalizedId.includes('/node_modules/dompurify/') ||
            normalizedId.includes('/node_modules/gpt-tokenizer/')
          ) return 'vendor-utils'
        }
      }
    },
    chunkSizeWarningLimit: 800,
  },
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
    exclude: ['@xenova/transformers']
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
