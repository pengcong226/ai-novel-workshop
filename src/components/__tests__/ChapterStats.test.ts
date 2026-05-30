import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ChapterStats from '@/components/ChapterStats.vue'
import type { Chapter } from '@/types'
import { createMockChapter } from '@/test/mocks'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/utils/formatters', () => ({
  formatDate: (ts: number | Date | string) => {
    const d = ts instanceof Date ? ts : new Date(ts)
    if (Number.isNaN(d.getTime())) return '未记录'
    const pad = (n: number) => n.toString().padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mountStats(chapterOverrides: Partial<Chapter> = {}) {
  const chapter = createMockChapter(chapterOverrides)
  return mount(ChapterStats, {
    props: { chapter },
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChapterStats', () => {
  it('renders the chapter-stats container', () => {
    const wrapper = mountStats()
    expect(wrapper.find('.chapter-stats').exists()).toBe(true)
  })

  it('displays word count with the 字 suffix', () => {
    const wrapper = mountStats({ wordCount: 3200 })
    const stat = wrapper.findAll('.stat')
    expect(stat[0].text()).toBe('3200字')
  })

  it('displays zero word count', () => {
    const wrapper = mountStats({ wordCount: 0 })
    const stat = wrapper.findAll('.stat')
    expect(stat[0].text()).toBe('0字')
  })

  it('displays large word count correctly', () => {
    const wrapper = mountStats({ wordCount: 120000 })
    const stat = wrapper.findAll('.stat')
    expect(stat[0].text()).toBe('120000字')
  })

  it('formats a valid generationTime as a date string', () => {
    const time = new Date('2025-06-15T10:30:00')
    const wrapper = mountStats({ generationTime: time })
    const stat = wrapper.findAll('.stat')
    expect(stat[1].text()).toBe('2025-06-15')
  })

  it('shows 未记录 when generationTime is an invalid date', () => {
    const wrapper = mountStats({ generationTime: new Date('invalid') })
    const stat = wrapper.findAll('.stat')
    expect(stat[1].text()).toBe('未记录')
  })

  it('renders exactly two stat spans', () => {
    const wrapper = mountStats()
    expect(wrapper.findAll('.stat')).toHaveLength(2)
  })

  it('updates display when chapter prop changes', async () => {
    const wrapper = mountStats({ wordCount: 100 })
    expect(wrapper.findAll('.stat')[0].text()).toBe('100字')

    const newChapter = createMockChapter({ wordCount: 5000 })
    await wrapper.setProps({ chapter: newChapter })
    expect(wrapper.findAll('.stat')[0].text()).toBe('5000字')
  })

  it('formats generationTime given as a numeric timestamp', () => {
    // 2024-01-20 00:00:00 UTC
    const ts = new Date('2024-01-20T00:00:00Z').getTime()
    const wrapper = mountStats({ generationTime: new Date(ts) })
    const stat = wrapper.findAll('.stat')
    // result depends on timezone; just check it contains the date parts
    expect(stat[1].text()).toMatch(/2024-01-20/)
  })
})
