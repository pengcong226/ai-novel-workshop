import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createTestPinia } from '@/test/helpers'
import { resetMockIdCounter, createMockChapter } from '@/test/mocks'
import type { Chapter } from '@/types'
import ChapterReadingPreview from '@/components/ChapterReadingPreview.vue'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/utils/readingPreview', () => ({
  buildReadingPreview: vi.fn((chapter: any) => {
    return chapter?.summaryData?.summary
      || chapter?.summary
      || chapter?.content
      || ''
  }),
  splitReadingParagraphs: vi.fn((content: string | null | undefined) => {
    return (content ?? '')
      .split(/\n\s*\n/g)
      .map((p: string) => p.trim())
      .filter(Boolean)
  }),
}))

// ---------------------------------------------------------------------------
// Stub Element Plus el-empty so we can detect empty state rendering
// ---------------------------------------------------------------------------
const ElEmptyStub = {
  name: 'ElEmpty',
  props: ['description'],
  template: '<div class="stub-empty"><span>{{ description }}</span></div>',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mountPreview(chapterOverrides: Partial<Chapter> = {}) {
  const chapter = createMockChapter(chapterOverrides)
  return mount(ChapterReadingPreview, {
    props: { chapter },
    global: {
      stubs: {
        ElEmpty: ElEmptyStub,
      },
    },
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChapterReadingPreview', () => {
  beforeEach(() => {
    resetMockIdCounter()
    createTestPinia()
  })

  // --- Header rendering ---

  it('renders the chapter number prefixed with "第" and suffixed with "章"', () => {
    const wrapper = mountPreview({ number: 5 })

    const numberEl = wrapper.find('.chapter-number')
    expect(numberEl.exists()).toBe(true)
    expect(numberEl.text()).toBe('第5章')
  })

  it('renders the chapter title in an h1 heading', () => {
    const wrapper = mountPreview({ title: '黎明之前' })

    const h1 = wrapper.find('h1')
    expect(h1.exists()).toBe(true)
    expect(h1.text()).toBe('黎明之前')
  })

  it('falls back to "未命名章节" when title is empty', () => {
    const wrapper = mountPreview({ title: '' })

    const h1 = wrapper.find('h1')
    expect(h1.text()).toBe('未命名章节')
  })

  // --- Metadata rendering ---

  it('displays the word count in the metadata area', () => {
    const wrapper = mountPreview({ wordCount: 3200 })

    const meta = wrapper.find('.reader-meta')
    expect(meta.exists()).toBe(true)
    expect(meta.text()).toContain('3200 字')
  })

  it('displays 0 字 when wordCount is falsy (0)', () => {
    const wrapper = mountPreview({ wordCount: 0 })

    const meta = wrapper.find('.reader-meta')
    expect(meta.text()).toContain('0 字')
  })

  it('renders the generation time formatted as a Chinese locale date', () => {
    const genTime = new Date('2026-03-15T10:00:00Z')
    const wrapper = mountPreview({ generationTime: genTime })

    const meta = wrapper.find('.reader-meta')
    // toLocaleDateString('zh-CN') produces something like 2026/3/15
    expect(meta.text()).toContain('/')
  })

  it('hides the generation time span when generationTime is not provided', () => {
    const wrapper = mountPreview({ generationTime: undefined as unknown as Date })

    // The template uses v-if="chapter.generationTime"
    const spans = wrapper.findAll('.reader-meta span')
    // Only the word-count span should render
    expect(spans).toHaveLength(1)
    expect(spans[0].text()).toContain('字')
  })

  // --- Content rendering ---

  it('renders paragraphs from chapter content', () => {
    const content = '第一段正文内容。\n\n第二段正文内容。\n\n第三段正文内容。'
    const wrapper = mountPreview({ content })

    const contentSection = wrapper.find('.reader-content')
    expect(contentSection.exists()).toBe(true)

    const paragraphs = contentSection.findAll('p')
    expect(paragraphs).toHaveLength(3)
    expect(paragraphs[0].text()).toBe('第一段正文内容。')
    expect(paragraphs[1].text()).toBe('第二段正文内容。')
    expect(paragraphs[2].text()).toBe('第三段正文内容。')
  })

  it('shows ElEmpty when content is empty and no fallback text is available', async () => {
    const { splitReadingParagraphs } = await import('@/utils/readingPreview')
    vi.mocked(splitReadingParagraphs).mockReturnValueOnce([])

    const wrapper = mountPreview({ content: '', summary: '', summaryData: undefined })

    expect(wrapper.find('.stub-empty').exists()).toBe(true)
    expect(wrapper.find('.reader-content').exists()).toBe(false)
  })

  it('does not render the reader-content section when paragraphs are empty', async () => {
    const { splitReadingParagraphs } = await import('@/utils/readingPreview')
    vi.mocked(splitReadingParagraphs).mockReturnValueOnce([])

    const wrapper = mountPreview({ content: '' })

    expect(wrapper.find('.reader-content').exists()).toBe(false)
  })

  it('filters out blank paragraphs produced by splitReadingParagraphs', () => {
    // Content with multiple consecutive newlines produces blank segments
    const content = '段落一。\n\n\n\n段落二。'
    const wrapper = mountPreview({ content })

    const paragraphs = wrapper.find('.reader-content').findAll('p')
    // Blank segments are filtered by splitReadingParagraphs
    expect(paragraphs.length).toBeGreaterThanOrEqual(2)
    expect(paragraphs[0].text()).toBe('段落一。')
  })

  // --- formatDate edge cases ---

  it('displays "未记录时间" for an invalid generationTime value', () => {
    const wrapper = mountPreview({ generationTime: 'not-a-date' as unknown as Date })

    const meta = wrapper.find('.reader-meta')
    expect(meta.text()).toContain('未记录时间')
  })

  // --- Overall structure ---

  it('wraps everything in an article element with the correct class', () => {
    const wrapper = mountPreview()

    const article = wrapper.find('article.chapter-reading-preview')
    expect(article.exists()).toBe(true)
  })
})
