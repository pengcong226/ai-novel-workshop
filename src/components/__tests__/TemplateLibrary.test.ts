import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createTestPinia } from '@/test/helpers'
import TemplateLibrary from '@/components/TemplateLibrary.vue'
import type { NovelTemplate, TemplateCategory } from '@/types'

// ---------------------------------------------------------------------------
// Mocks (vi.hoisted ensures these are available before vi.mock hoisting)
// ---------------------------------------------------------------------------

const { mockGetAllTemplates, mockDeleteTemplate, mockSaveTemplate, mockImportTemplate } = vi.hoisted(() => ({
  mockGetAllTemplates: vi.fn(),
  mockDeleteTemplate: vi.fn(),
  mockSaveTemplate: vi.fn(),
  mockImportTemplate: vi.fn(),
}))

const { mockElMessage, mockElMessageBoxConfirm } = vi.hoisted(() => ({
  mockElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
  mockElMessageBoxConfirm: vi.fn(),
}))

vi.mock('@/utils/templateManager', () => ({
  templateManager: {
    getAllTemplates: mockGetAllTemplates,
    deleteTemplate: mockDeleteTemplate,
    saveTemplate: mockSaveTemplate,
    importTemplate: mockImportTemplate,
  },
}))

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('uuid', () => ({
  v4: () => 'test-uuid-123',
}))

vi.mock('element-plus', async () => {
  const actual = await vi.importActual<typeof import('element-plus')>('element-plus')
  return {
    ...actual,
    ElMessage: mockElMessage,
    ElMessageBox: {
      confirm: mockElMessageBoxConfirm,
    },
  }
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTemplate(overrides: Partial<NovelTemplate> = {}): NovelTemplate {
  return {
    meta: {
      id: 'tpl-1',
      name: '玄幻仙侠模板',
      version: '1.0.0',
      author: 'System',
      description: '适用于玄幻仙侠题材小说的模板',
      tags: ['玄幻', '仙侠', '修真'],
      category: 'fantasy' as TemplateCategory,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
    },
    worldTemplate: {
      name: '仙侠世界',
      era: { time: '远古时期', techLevel: '仙侠', socialForm: '宗门制' },
      powerSystem: {
        name: '修仙等级',
        levels: [
          { name: '练气', description: '初入修仙' },
          { name: '筑基', description: '奠定根基' },
        ],
      },
    },
    characterTemplates: [
      {
        role: 'protagonist',
        description: '主角人设',
        template: {
          name: '男主',
          personality: ['坚韧', '聪慧'],
          motivation: '追求长生',
        },
      },
      {
        role: 'antagonist',
        description: '反派人设',
        template: {
          name: '魔尊',
          personality: ['残忍', '狡猾'],
          motivation: '毁灭世界',
        },
      },
    ],
    plotTemplate: {
      structure: '经典三幕式',
      totalChapters: 200,
      description: '主角从凡人修炼至仙人的成长史',
      volumes: [
        {
          number: 1,
          title: '初入仙途',
          theme: '主角觉醒',
          chapterRange: { start: 1, end: 50 },
          mainEvents: ['觉醒灵根', '进入宗门', '初次战斗'],
          plotPoints: ['获得机缘'],
        },
      ],
    },
    styleTemplate: {
      tone: '热血',
      narrativePerspective: '第三人称',
      dialogueStyle: '古风',
      descriptionLevel: '详尽',
    },
    promptTemplates: {
      worldGeneration: '',
      characterGeneration: '',
      chapterGeneration: '',
    },
    ...overrides,
  }
}

const fantasyTemplate = makeTemplate({ meta: { ...makeTemplate().meta, id: 'tpl-1', name: '玄幻仙侠模板', category: 'fantasy' } })
const urbanTemplate = makeTemplate({ meta: { ...makeTemplate().meta, id: 'tpl-2', name: '都市模板', category: 'urban', author: 'User1', description: '都市题材小说模板', tags: ['都市', '职场'] } })
const scifiTemplate = makeTemplate({ meta: { ...makeTemplate().meta, id: 'tpl-3', name: '科幻模板', category: 'scifi', author: 'System', description: '科幻题材小说模板', tags: ['科幻', '未来'] } })

const allTemplates = [fantasyTemplate, urbanTemplate, scifiTemplate]

// ---------------------------------------------------------------------------
// Helper: mount component
// ---------------------------------------------------------------------------

function mountComponent() {
  const pinia = createTestPinia()
  const wrapper = mount(TemplateLibrary, {
    global: {
      plugins: [pinia],
      stubs: {
        'el-header': { template: '<div class="el-header"><slot /></div>' },
        'el-main': { template: '<div class="el-main"><slot /></div>' },
        'el-input': {
          template: '<input v-bind="$attrs" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
          props: ['modelValue', 'placeholder', 'clearable'],
          emits: ['update:modelValue'],
        },
        'el-button': { template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>', props: ['type', 'text', 'loading', 'disabled'] },
        'el-card': { template: '<div class="el-card"><div class="el-card__header"><slot name="header" /></div><div class="el-card__body"><slot /></div><div class="el-card__footer"><slot name="footer" /></div></div>', props: ['shadow'] },
        'el-tag': { template: '<span class="el-tag"><slot /></span>', props: ['type', 'size', 'effect'] },
        'el-radio-group': {
          template: '<div class="el-radio-group" @update:modelValue="$emit(\'update:modelValue\', $event)"><slot /></div>',
          props: ['modelValue', 'size'],
          emits: ['update:modelValue'],
        },
        'el-radio-button': {
          template: '<button class="el-radio-button" :value="value" @click="$parent?.$emit(\'update:modelValue\', value)"><slot /></button>',
          props: ['value'],
          emits: ['update:modelValue'],
        },
        'el-empty': { template: '<div class="el-empty"><slot /></div>', props: ['description'] },
        'el-dialog': { template: '<div v-if="modelValue" class="el-dialog"><slot /><slot name="footer" /></div>', props: ['modelValue', 'title', 'width', 'top', 'closeOnClickModal'], emits: ['update:modelValue'] },
        'el-tabs': { template: '<div class="el-tabs"><slot /></div>', props: ['modelValue'], emits: ['update:modelValue'] },
        'el-tab-pane': { template: '<div class="el-tab-pane"><slot /></div>', props: ['label', 'name'] },
        'el-descriptions': { template: '<div class="el-descriptions"><slot /></div>', props: ['column', 'border'] },
        'el-descriptions-item': { template: '<div class="el-descriptions-item"><slot /></div>', props: ['label', 'span'] },
        'el-timeline': { template: '<div class="el-timeline"><slot /></div>' },
        'el-timeline-item': { template: '<div class="el-timeline-item"><slot /></div>', props: ['timestamp', 'placement'] },
        'el-collapse': { template: '<div class="el-collapse"><slot /></div>' },
        'el-collapse-item': { template: '<div class="el-collapse-item"><slot /></div>', props: ['title'] },
        'el-form': { template: '<div class="el-form"><slot /></div>', props: ['model', 'labelWidth'] },
        'el-form-item': { template: '<div class="el-form-item"><slot /></div>', props: ['label', 'required'] },
        'el-input-number': { template: '<input type="number" />', props: ['modelValue', 'min', 'max', 'step'] },
        'el-icon': { template: '<span class="el-icon"><slot /></span>' },
        MagicStick: { template: '<span />' },
        Upload: { template: '<span />' },
        Download: { template: '<span />' },
        Notebook: { template: '<span />' },
        User: { template: '<span />' },
        Collection: { template: '<span />' },
        View: { template: '<span />' },
        Check: { template: '<span />' },
        Loading: { template: '<span />' },
      },
    },
  })
  return wrapper
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TemplateLibrary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAllTemplates.mockReturnValue(allTemplates)
    mockDeleteTemplate.mockResolvedValue(true)
    mockElMessageBoxConfirm.mockResolvedValue('confirm')
  })

  // ---- Rendering ----

  it('renders all templates on mount', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    const cards = wrapper.findAll('.template-card')
    expect(cards).toHaveLength(3)

    const titles = wrapper.findAll('.title')
    expect(titles.map(t => t.text())).toEqual([
      '玄幻仙侠模板',
      '都市模板',
      '科幻模板',
    ])
  })

  it('renders template description and tags', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    const descriptions = wrapper.findAll('.description')
    expect(descriptions[0].text()).toContain('玄幻仙侠题材')

    const firstCardTags = wrapper.findAll('.template-card')[0].findAll('.el-tag')
    const tagTexts = firstCardTags.map(t => t.text())
    // category tags (内置 + category + up to 3 tags)
    expect(tagTexts).toContain('内置')
    expect(tagTexts).toContain('玄幻')
  })

  it('shows system and custom template badges correctly', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    const cards = wrapper.findAll('.template-card')
    // fantasyTemplate has author 'System' -> 内置
    const firstCardTags = cards[0].findAll('.el-tag')
    expect(firstCardTags.some(t => t.text() === '内置')).toBe(true)

    // urbanTemplate has author 'User1' -> 自定义
    const secondCardTags = cards[1].findAll('.el-tag')
    expect(secondCardTags.some(t => t.text() === '自定义')).toBe(true)
  })

  // ---- Category Filtering ----

  it('filters templates by category', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    // Initially all 3 templates
    expect(wrapper.findAll('.template-card')).toHaveLength(3)

    // Find the radio buttons and click 'fantasy'
    const fantasyButton = wrapper.findAll('.el-radio-button').find(b => b.text() === '玄幻')
    expect(fantasyButton).toBeTruthy()
    await fantasyButton!.trigger('click')
    await nextTick()

    // After filtering by fantasy, only the fantasy template should show
    const filteredCards = wrapper.findAll('.template-card')
    expect(filteredCards).toHaveLength(1)
    expect(filteredCards[0].find('.title').text()).toBe('玄幻仙侠模板')
  })

  it('shows empty state when no templates match filter', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    // Filter by a category that has no templates (assuming 'wuxia' not in fixtures)
    const wuxiaButton = wrapper.findAll('.el-radio-button').find(b => b.text() === '武侠')
    expect(wuxiaButton).toBeTruthy()
    await wuxiaButton!.trigger('click')
    await nextTick()

    expect(wrapper.findAll('.template-card')).toHaveLength(0)
    expect(wrapper.find('.el-empty').exists()).toBe(true)
  })

  // ---- Search Filtering ----

  it('filters templates by search query', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    // Simulate typing a search query
    const searchInput = wrapper.find('input')
    await searchInput.setValue('都市')
    await nextTick()

    const filteredCards = wrapper.findAll('.template-card')
    expect(filteredCards).toHaveLength(1)
    expect(filteredCards[0].find('.title').text()).toBe('都市模板')
  })

  // ---- Template Preview ----

  it('opens preview dialog when clicking preview button', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    // Find the first preview button
    const previewButtons = wrapper.findAll('.card-footer button')
    // Each card has 预览, 使用模板, and optionally 删除
    const firstPreviewButton = previewButtons.find(b => b.text().includes('预览'))
    expect(firstPreviewButton).toBeTruthy()

    await firstPreviewButton!.trigger('click')
    await nextTick()

    // The preview dialog should be visible
    const dialog = wrapper.find('.el-dialog')
    expect(dialog.exists()).toBe(true)
    expect(dialog.find('.el-descriptions').exists()).toBe(true)
  })

  // ---- Use Template ----

  it('emits useTemplate when clicking use button', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    // Find the "使用模板" button in the first card
    const useButtons = wrapper.findAll('.card-footer button')
    const firstUseButton = useButtons.find(b => b.text().includes('使用模板'))
    expect(firstUseButton).toBeTruthy()

    await firstUseButton!.trigger('click')
    await flushPromises()

    expect(wrapper.emitted('useTemplate')).toBeTruthy()
    expect(wrapper.emitted('useTemplate')![0][0]).toEqual(fantasyTemplate)
  })

  it('emits useTemplate from preview dialog "use this template" button', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    // Open preview first
    const previewButtons = wrapper.findAll('.card-footer button')
    const firstPreviewButton = previewButtons.find(b => b.text().includes('预览'))
    await firstPreviewButton!.trigger('click')
    await nextTick()

    // Find the "使用此模板" button in the dialog footer
    const dialogFooterButtons = wrapper.findAll('.el-dialog button')
    const useThisTemplateButton = dialogFooterButtons.find(b => b.text().includes('使用此模板'))
    expect(useThisTemplateButton).toBeTruthy()

    await useThisTemplateButton!.trigger('click')
    await flushPromises()

    expect(wrapper.emitted('useTemplate')).toBeTruthy()
  })

  // ---- Delete ----

  it('hides delete button for System templates', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    const cards = wrapper.findAll('.template-card')
    // First card is System template
    const firstCardFooterButtons = cards[0].findAll('.card-footer button')
    const deleteButton = firstCardFooterButtons.find(b => b.text().includes('删除'))
    expect(deleteButton).toBeUndefined()
  })

  it('shows delete button for custom templates and calls deleteTemplate on confirm', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    const cards = wrapper.findAll('.template-card')
    // Second card is User1 template
    const secondCardFooterButtons = cards[1].findAll('.card-footer button')
    const deleteButton = secondCardFooterButtons.find(b => b.text().includes('删除'))
    expect(deleteButton).toBeTruthy()

    await deleteButton!.trigger('click')
    await flushPromises()

    expect(mockElMessageBoxConfirm).toHaveBeenCalled()
    expect(mockDeleteTemplate).toHaveBeenCalledWith('tpl-2')
  })

  // ---- Stats rendering ----

  it('renders chapter count, character count, and volume count in template cards', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    const firstCard = wrapper.findAll('.template-card')[0]
    const statItems = firstCard.findAll('.stat-item')
    const statTexts = statItems.map(s => s.text())

    expect(statTexts).toContain('200 章')
    expect(statTexts).toContain('2 人物')
    expect(statTexts).toContain('1 卷')
  })

  // ---- No templates at all ----

  it('shows empty state when no templates exist', async () => {
    mockGetAllTemplates.mockReturnValue([])
    const wrapper = mountComponent()
    await flushPromises()

    expect(wrapper.findAll('.template-card')).toHaveLength(0)
    expect(wrapper.find('.el-empty').exists()).toBe(true)
  })

  // ---- Search by tags and description ----

  it('filters templates by tag text', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    // Search for a tag that only appears on urbanTemplate
    const searchInput = wrapper.find('input')
    await searchInput.setValue('职场')
    await nextTick()

    const filteredCards = wrapper.findAll('.template-card')
    expect(filteredCards).toHaveLength(1)
    expect(filteredCards[0].find('.title').text()).toBe('都市模板')
  })

  it('filters templates by description text', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    const searchInput = wrapper.find('input')
    await searchInput.setValue('科幻题材')
    await nextTick()

    const filteredCards = wrapper.findAll('.template-card')
    expect(filteredCards).toHaveLength(1)
    expect(filteredCards[0].find('.title').text()).toBe('科幻模板')
  })

  it('performs case-insensitive search', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    const searchInput = wrapper.find('input')
    await searchInput.setValue('科幻')
    await nextTick()

    // Should still match even though tags contain Chinese chars
    const filteredCards = wrapper.findAll('.template-card')
    expect(filteredCards).toHaveLength(1)
  })

  // ---- Combined category + search filter ----

  it('applies both category and search filters simultaneously', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    // First filter by category "urban"
    const urbanButton = wrapper.findAll('.el-radio-button').find(b => b.text() === '都市')
    expect(urbanButton).toBeTruthy()
    await urbanButton!.trigger('click')
    await nextTick()

    expect(wrapper.findAll('.template-card')).toHaveLength(1)

    // Now add a search that does not match the urban template
    const searchInput = wrapper.find('input')
    await searchInput.setValue('仙侠')
    await nextTick()

    // Urban template does not match "仙侠" -> empty
    expect(wrapper.findAll('.template-card')).toHaveLength(0)
    expect(wrapper.find('.el-empty').exists()).toBe(true)
  })

  // ---- Style info rendering ----

  it('renders style info (tone and narrative perspective) in template cards', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    const firstCard = wrapper.findAll('.template-card')[0]
    const styleInfo = firstCard.find('.style-info')
    expect(styleInfo.exists()).toBe(true)
    // The styleTemplate fixture has tone '热血' and narrativePerspective '第三人称'
    expect(styleInfo.text()).toContain('热血')
    expect(styleInfo.text()).toContain('第三人称')
  })

  // ---- Delete failure and cancel ----

  it('shows warning when deleteTemplate returns false', async () => {
    mockDeleteTemplate.mockResolvedValue(false)
    const wrapper = mountComponent()
    await flushPromises()

    const cards = wrapper.findAll('.template-card')
    const secondCardFooterButtons = cards[1].findAll('.card-footer button')
    const deleteButton = secondCardFooterButtons.find(b => b.text().includes('删除'))
    expect(deleteButton).toBeTruthy()

    await deleteButton!.trigger('click')
    await flushPromises()

    expect(mockElMessageBoxConfirm).toHaveBeenCalled()
    expect(mockDeleteTemplate).toHaveBeenCalledWith('tpl-2')
    expect(mockElMessage.warning).toHaveBeenCalledWith('内置模板无法删除')
    expect(mockElMessage.success).not.toHaveBeenCalled()
  })

  it('silently handles user cancelling the delete confirmation', async () => {
    mockElMessageBoxConfirm.mockRejectedValue(new Error('cancel'))
    const wrapper = mountComponent()
    await flushPromises()

    const cards = wrapper.findAll('.template-card')
    const secondCardFooterButtons = cards[1].findAll('.card-footer button')
    const deleteButton = secondCardFooterButtons.find(b => b.text().includes('删除'))
    expect(deleteButton).toBeTruthy()

    await deleteButton!.trigger('click')
    await flushPromises()

    expect(mockElMessageBoxConfirm).toHaveBeenCalled()
    // deleteTemplate should not be called when user cancels
    expect(mockDeleteTemplate).not.toHaveBeenCalled()
  })

  // ---- Export all ----

  it('shows warning when exporting with no custom templates', async () => {
    // All templates are System-authored
    const systemOnlyTemplates = [
      makeTemplate({ meta: { ...makeTemplate().meta, id: 'tpl-1', name: '内置模板1', author: 'System' } }),
      makeTemplate({ meta: { ...makeTemplate().meta, id: 'tpl-2', name: '内置模板2', author: 'System' } }),
    ]
    mockGetAllTemplates.mockReturnValue(systemOnlyTemplates)
    const wrapper = mountComponent()
    await flushPromises()

    // Find the export button
    const exportButton = wrapper.findAll('button').find(b => b.text().includes('导出全部'))
    expect(exportButton).toBeTruthy()

    await exportButton!.trigger('click')
    await flushPromises()

    expect(mockElMessage.warning).toHaveBeenCalledWith('没有可导出的自定义模板')
  })

  it('creates blob and triggers download when exporting with custom templates', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    // Spy on URL.createObjectURL and document.createElement
    const mockClick = vi.fn()
    const mockRevokeObjectURL = vi.fn()
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(mockRevokeObjectURL)
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        return { href: '', download: '', click: mockClick } as unknown as HTMLAnchorElement
      }
      return originalCreateElement(tag)
    })

    const exportButton = wrapper.findAll('button').find(b => b.text().includes('导出全部'))
    await exportButton!.trigger('click')
    await flushPromises()

    expect(URL.createObjectURL).toHaveBeenCalled()
    expect(mockClick).toHaveBeenCalled()
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock')
    expect(mockElMessage.success).toHaveBeenCalledWith('导出成功')

    vi.restoreAllMocks()
  })

  // ---- Preview dialog close ----

  it('closes preview dialog when close button is clicked', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    // Open preview
    const previewButtons = wrapper.findAll('.card-footer button')
    const firstPreviewButton = previewButtons.find(b => b.text().includes('预览'))
    await firstPreviewButton!.trigger('click')
    await nextTick()

    expect(wrapper.find('.el-dialog').exists()).toBe(true)

    // Find close button in the dialog footer
    const dialogButtons = wrapper.findAll('.el-dialog button')
    const closeButton = dialogButtons.find(b => b.text().includes('关闭'))
    expect(closeButton).toBeTruthy()

    await closeButton!.trigger('click')
    await nextTick()

    // Dialog should be closed (modelValue is false)
    expect(wrapper.find('.el-dialog').exists()).toBe(false)
  })
})
