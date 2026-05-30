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

const isTest = process.env.VITEST === 'true'

export default defineConfig({
  plugins: [
    vue(),
    ...(!isTest ? [
      AutoImport({
        resolvers: [ElementPlusResolver()],
      }),
      Components({
        resolvers: [ElementPlusResolver()],
      }),
    ] : []),
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
          // vendor-vue: vue, vue-router, pinia
          if (
            id.includes('/node_modules/vue/') ||
            id.includes('/node_modules/vue-router/') ||
            id.includes('/node_modules/pinia/')
          ) return 'vendor-vue'
          // vendor-element: element-plus + icons
          if (id.includes('/node_modules/element-plus/')) return 'vendor-element'
          // vendor-echarts: echarts, vue-echarts, zrender
          if (
            id.includes('/node_modules/echarts/') ||
            id.includes('/node_modules/vue-echarts/') ||
            id.includes('/node_modules/zrender/')
          ) return 'vendor-echarts'
          // vendor-tiptap: tiptap + prosemirror ecosystem
          if (
            id.includes('/node_modules/@tiptap/') ||
            id.includes('/node_modules/prosemirror-')
          ) return 'vendor-tiptap'
          // vendor-g6: AntV G6
          if (id.includes('/node_modules/@antv/')) return 'vendor-g6'
          // vendor-vis: vis-timeline, vis-data
          if (id.includes('/node_modules/vis-')) return 'vendor-vis'
          // vendor-misc: xlsx, transformers, konva, utils
          if (
            id.includes('/node_modules/xlsx/') ||
            id.includes('/node_modules/@xenova/') ||
            id.includes('/node_modules/konva/') ||
            id.includes('/node_modules/vue-konva/') ||
            id.includes('/node_modules/lodash-es/') ||
            id.includes('/node_modules/marked/') ||
            id.includes('/node_modules/js-yaml/') ||
            id.includes('/node_modules/jszip/') ||
            id.includes('/node_modules/ajv/') ||
            id.includes('/node_modules/dompurify/') ||
            id.includes('/node_modules/gpt-tokenizer/')
          ) return 'vendor-misc'
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
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    alias: {
      mammoth: resolve(__dirname, 'src/test/__mocks__/mammoth.ts'),
    },
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-ssr/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      '**/.claude/worktrees/**',
      '**/.worktrees/**'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: [
        'src/stores/**/*.ts',
        'src/utils/**/*.ts',
        'src/services/**/*.ts',
        'src/composables/**/*.ts',
      ],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/**/__tests__/**',
        'src/test/**',
        'src/types/**',
        'src/**/*.d.ts',
        'src/main.ts',
      ],
      thresholds: {
        statements: 10,
        branches: 10,
        functions: 10,
        lines: 10,
      },
    },
  }
})
