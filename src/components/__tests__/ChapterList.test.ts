import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createTestPinia } from '@/test/helpers'
import { resetMockIdCounter, createMockChapter, createMockChapters } from '@/test/mocks'
import type { Chapter } from '@/types'
import ChapterList from '@/components/ChapterList.vue'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Stub virtualizer so it renders all items without scroll math.
// The component passes a `computed()` ref, so we must read `.value`.
vi.mock('@tanstack/vue-virtual', () => ({
  useVirtualizer: vi.fn((optionsOrRef: any) => {
    const opts = optionsOrRef?.value ?? optionsOrRef
    const count = opts?.count ?? 0
    return {
      getTotalSize: () => count * 200,
      getVirtualItems: () =>
        Array.from({ length: count }, (_, i) => ({
          index: i,
          start: i * 200,
          size: 200,
          end: (i + 1) * 200,
        })),
    }
  }),
}))

vi.mock('@/utils/readingPreview', () => ({
  buildReadingPreview: (chapter: any, maxLength?: number) => {
    const text = chapter?.content ?? ''
    return text.length > (maxLength ?? 500) ? `${text.slice(0, maxLength ?? 500)}...` : text
  },
}))

vi.mock('@/utils/formatters', () => ({
  getChapterStatusType: (status: string) => {
    const types: Record<string, string> = {
      draft: 'info',
      writing: 'warning',
      revised: 'warning',
      final: 'success',
    }
    return types[status] || 'info'
  },
  getChapterStatusText: (status: string) => {
    const texts: Record<string, string> = {
      draft: '草稿',
      writing: '写作中',
      revised: '已修订',
      final: '定稿',
    }
    return texts[status] || status
  },
}))

vi.mock('@/utils/errorHandler', () => ({
  getFriendlyMessage: (err: unknown) => String(err),
}))

// Stub child ChapterStats
const ChapterStatsStub = {
  name: 'ChapterStats',
  props: ['chapter'],
  template: '<div class="stub-chapter-stats" />',
}

// Stub Element Plus components that the template uses
const ElEmptyStub = {
  name: 'ElEmpty',
  props: ['description'],
  template: '<div class="stub-empty"><p>{{ description }}</p><slot /></div>',
}
const ElButtonStub = {
  name: 'ElButton',
  props: ['type', 'size', 'loading'],
  emits: ['click'],
  template: '<button class="stub-button" @click="$emit(\'click\')"><slot /></button>',
}
const ElCardStub = {
  name: 'ElCard',
  props: [],
  template: '<div class="stub-card"><slot /></div>',
}
const ElTagStub = {
  name: 'ElTag',
  props: ['type', 'size'],
  template: '<span class="stub-tag"><slot /></span>',
}
const ElDividerStub = {
  name: 'ElDivider',
  template: '<hr class="stub-divider" />',
}
const ElDropdownStub = {
  name: 'ElDropdown',
  props: ['size', 'command'],
  emits: ['command'],
  template: '<div class="stub-dropdown"><slot /><slot name="dropdown" /></div>',
}
const ElDropdownMenuStub = {
  name: 'ElDropdownMenu',
  template: '<div class="stub-dropdown-menu"><slot /></div>',
}
const ElDropdownItemStub = {
  name: 'ElDropdownItem',
  props: ['command', 'divided', 'style'],
  template: '<div class="stub-dropdown-item" :data-command="command"><slot /></div>',
}
const ElIconStub = {
  name: 'ElIcon',
  template: '<span class="stub-icon"><slot /></span>',
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function mountChapterList(chapters: Chapter[] = [], pluginToolbarButtons: any[] = []) {
  return mount(ChapterList, {
    props: {
      chapters,
      pluginToolbarButtons,
    },
    global: {
      stubs: {
        ChapterStats: ChapterStatsStub,
        ElEmpty: ElEmptyStub,
        ElButton: ElButtonStub,
        ElCard: ElCardStub,
        ElTag: ElTagStub,
        ElDivider: ElDividerStub,
        ElDropdown: ElDropdownStub,
        ElDropdownMenu: ElDropdownMenuStub,
        ElDropdownItem: ElDropdownItemStub,
        ElIcon: ElIconStub,
      },
    },
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChapterList', () => {
  beforeEach(() => {
    createTestPinia()
    resetMockIdCounter()
    vi.clearAllMocks()
  })

  // ---- Empty state ----

  it('renders empty state with "还没有章节" when no chapters provided', () => {
    const wrapper = mountChapterList([])

    expect(wrapper.find('.stub-empty').exists()).toBe(true)
    expect(wrapper.text()).toContain('还没有章节')
  })

  it('renders "创建第一章" button in empty state and emits addChapter on click', async () => {
    const wrapper = mountChapterList([])

    const button = wrapper.find('.stub-empty .stub-button')
    expect(button.exists()).toBe(true)
    expect(button.text()).toContain('创建第一章')

    await button.trigger('click')
    expect(wrapper.emitted('addChapter')).toHaveLength(1)
  })

  // ---- Chapter rendering ----

  it('renders chapter cards when chapters are provided', () => {
    const chapters = createMockChapters(3)
    const wrapper = mountChapterList(chapters)

    expect(wrapper.findAll('.stub-card')).toHaveLength(3)
  })

  it('does not render empty state when chapters are present', () => {
    const chapters = createMockChapters(1)
    const wrapper = mountChapterList(chapters)

    expect(wrapper.find('.stub-empty').exists()).toBe(false)
  })

  it('displays chapter number in Chinese format', () => {
    const chapter = createMockChapter({ number: 5 })
    const wrapper = mountChapterList([chapter])

    expect(wrapper.text()).toContain('第5章')
  })

  it('displays chapter title', () => {
    const chapter = createMockChapter({ title: '开端之章' })
    const wrapper = mountChapterList([chapter])

    expect(wrapper.text()).toContain('开端之章')
  })

  // ---- Status tags ----

  it('displays draft status tag for draft chapters', () => {
    const chapter = createMockChapter({ status: 'draft' })
    const wrapper = mountChapterList([chapter])

    const tags = wrapper.findAll('.stub-tag')
    const statusTag = tags.find((t) => t.text().includes('草稿'))
    expect(statusTag).toBeDefined()
  })

  it('displays revised status tag for revised chapters', () => {
    const chapter = createMockChapter({ status: 'revised' })
    const wrapper = mountChapterList([chapter])

    const tags = wrapper.findAll('.stub-tag')
    const statusTag = tags.find((t) => t.text().includes('已修订'))
    expect(statusTag).toBeDefined()
  })

  it('displays final status tag for final chapters', () => {
    const chapter = createMockChapter({ status: 'final' })
    const wrapper = mountChapterList([chapter])

    const tags = wrapper.findAll('.stub-tag')
    const statusTag = tags.find((t) => t.text().includes('定稿'))
    expect(statusTag).toBeDefined()
  })

  // ---- AI generated tag ----

  it('shows AI generated tag when generatedBy is ai', () => {
    const chapter = createMockChapter({ generatedBy: 'ai' })
    const wrapper = mountChapterList([chapter])

    const tags = wrapper.findAll('.stub-tag')
    const aiTag = tags.find((t) => t.text().includes('AI生成'))
    expect(aiTag).toBeDefined()
  })

  it('does not show AI generated tag when generatedBy is manual', () => {
    const chapter = createMockChapter({ generatedBy: 'manual' })
    const wrapper = mountChapterList([chapter])

    const tags = wrapper.findAll('.stub-tag')
    const aiTag = tags.find((t) => t.text().includes('AI生成'))
    expect(aiTag).toBeUndefined()
  })

  // ---- Content preview ----

  it('displays content preview for each chapter', () => {
    const chapter = createMockChapter({ content: '这是测试内容预览' })
    const wrapper = mountChapterList([chapter])

    expect(wrapper.find('.content-preview').exists()).toBe(true)
    expect(wrapper.find('.content-preview').text()).toContain('这是测试内容预览')
  })

  it('renders ChapterStats child for each chapter', () => {
    const chapters = createMockChapters(2)
    const wrapper = mountChapterList(chapters)

    expect(wrapper.findAllComponents(ChapterStatsStub)).toHaveLength(2)
  })

  // ---- Quality score ----

  it('shows quality score when chapter has qualityScore', () => {
    const chapter = createMockChapter({ qualityScore: 8.5 })
    const wrapper = mountChapterList([chapter])

    const scoreEl = wrapper.find('.quality-score')
    expect(scoreEl.exists()).toBe(true)
    expect(scoreEl.text()).toContain('8.5')
  })

  it('does not show quality score when chapter has no qualityScore', () => {
    const chapter = createMockChapter()
    const wrapper = mountChapterList([chapter])

    expect(wrapper.find('.quality-score').exists()).toBe(false)
  })

  // ---- Edit / Preview buttons ----

  it('emits editChapter with chapter data when edit button is clicked', async () => {
    const chapter = createMockChapter({ title: '编辑测试章' })
    const wrapper = mountChapterList([chapter])

    const buttons = wrapper.findAll('.stub-button')
    const editBtn = buttons.find((b) => b.text().includes('编辑'))
    expect(editBtn).toBeDefined()

    await editBtn!.trigger('click')
    expect(wrapper.emitted('editChapter')).toHaveLength(1)
    expect(wrapper.emitted('editChapter')![0][0]).toMatchObject({
      title: '编辑测试章',
    })
  })

  it('emits previewChapter with chapter data when preview button is clicked', async () => {
    const chapter = createMockChapter({ title: '预览测试章' })
    const wrapper = mountChapterList([chapter])

    const buttons = wrapper.findAll('.stub-button')
    const previewBtn = buttons.find((b) => b.text().includes('预览'))
    expect(previewBtn).toBeDefined()

    await previewBtn!.trigger('click')
    expect(wrapper.emitted('previewChapter')).toHaveLength(1)
    expect(wrapper.emitted('previewChapter')![0][0]).toMatchObject({
      title: '预览测试章',
    })
  })

  // ---- Dropdown menu commands ----

  it('renders export markdown dropdown item', () => {
    const chapter = createMockChapter()
    const wrapper = mountChapterList([chapter])

    const menuItems = wrapper.findAll('.stub-dropdown-item')
    const exportMd = menuItems.find((i) => i.attributes('data-command') === 'export-md')
    expect(exportMd).toBeDefined()
  })

  it('renders delete dropdown item', () => {
    const chapter = createMockChapter()
    const wrapper = mountChapterList([chapter])

    const menuItems = wrapper.findAll('.stub-dropdown-item')
    const deleteItem = menuItems.find((i) => i.attributes('data-command') === 'delete')
    expect(deleteItem).toBeDefined()
  })

  it('renders all standard export options (md, pdf, docx, txt)', () => {
    const chapter = createMockChapter()
    const wrapper = mountChapterList([chapter])

    const commands = wrapper.findAll('.stub-dropdown-item').map((i) => i.attributes('data-command'))
    expect(commands).toContain('export-md')
    expect(commands).toContain('export-pdf')
    expect(commands).toContain('export-docx')
    expect(commands).toContain('export-txt')
  })

  it('renders plugin toolbar buttons in dropdown', () => {
    const chapter = createMockChapter()
    const pluginToolbarButtons = [
      { id: 'custom-plugin', label: 'Custom Action' },
    ]
    const wrapper = mountChapterList([chapter], pluginToolbarButtons)

    const commands = wrapper.findAll('.stub-dropdown-item').map((i) => i.attributes('data-command'))
    expect(commands).toContain('plugin:custom-plugin')
  })

  // ---- Drag-and-drop ----

  it('has drag handles for each chapter', () => {
    const chapters = createMockChapters(3)
    const wrapper = mountChapterList(chapters)

    const dragHandles = wrapper.findAll('.drag-handle')
    expect(dragHandles).toHaveLength(3)
  })

  it('drag handles have correct aria-label', () => {
    const chapter = createMockChapter()
    const wrapper = mountChapterList([chapter])

    const handle = wrapper.find('.drag-handle')
    expect(handle.attributes('aria-label')).toBe('拖拽排序')
  })

  // ---- Multiple chapters ----

  it('renders chapters with different statuses independently', () => {
    const chapters = [
      createMockChapter({ number: 1, status: 'draft' }),
      createMockChapter({ number: 2, status: 'revised' }),
      createMockChapter({ number: 3, status: 'final' }),
    ]
    const wrapper = mountChapterList(chapters)

    expect(wrapper.findAll('.stub-card')).toHaveLength(3)
    const tags = wrapper.findAll('.stub-tag')
    const statusTexts = tags.map((t) => t.text())
    expect(statusTexts).toContain('草稿')
    expect(statusTexts).toContain('已修订')
    expect(statusTexts).toContain('定稿')
  })

  it('renders many chapters efficiently with virtualization', () => {
    const chapters = createMockChapters(50)
    const wrapper = mountChapterList(chapters)

    // Virtualizer mock returns all items, component renders them all
    expect(wrapper.findAll('.stub-card')).toHaveLength(50)
  })
})
