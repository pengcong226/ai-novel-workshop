/**
 * Search Engine Benchmarks
 *
 * Measures indexing and query performance of the in-memory SearchEngine
 * across varying document-set sizes with mixed Chinese/English content.
 *
 * Run:  npx vitest bench src/utils/__benchmarks__/searchEngine.bench.ts
 */

import { bench, describe } from 'vitest'
import { SearchEngine, tokenize, type SearchableDocument } from '@/utils/searchEngine'

// ---------------------------------------------------------------------------
// Fixture generators
// ---------------------------------------------------------------------------

const NAMES_CN = [
  '林照', '白榆', '玄烬', '苏晴', '顾长风', '沈明月', '赵无极', '萧夜',
  '楚瑶', '李天行', '王铁柱', '陈小雨', '张逸飞', '慕容婉儿', '上官云',
]
const LOCATIONS = ['古堡', '天台', '地下城', '沙漠', '森林', '王宫', '战场', '集市']
const ITEMS = ['星辰剑', '龙鳞甲', '凤凰羽', '九转丹', '雷神锤', '冰霜杖']
const LORE = ['天道法则', '五行之力', '时间轮回', '空间裂隙', '灵魂契约']

const EN_DESCRIPTIONS = [
  'A powerful warrior with exceptional swordsmanship and unwavering loyalty.',
  'Master of ancient arcane arts, capable of manipulating elemental forces.',
  'Leader of the Shadow Guild, operating from the underground city depths.',
  'Renowned healer who discovered the secret of life-force restoration.',
  'Former royal guard turned rebel, seeking justice for the fallen kingdom.',
  'Scholar of forbidden knowledge, keeper of the Great Library archives.',
]

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function makeDoc(id: number): SearchableDocument {
  const isCharacter = id % 3 === 0
  const isLore = id % 5 === 0
  const type = isCharacter ? 'CHARACTER' : isLore ? 'LORE' : 'ITEM'

  if (type === 'CHARACTER') {
    const name = pick(NAMES_CN)
    const desc = pick(EN_DESCRIPTIONS)
    return {
      id: `doc-${id}`,
      type,
      fields: {
        name,
        description: `${name}是一位强大的${pick(['战士', '法师', '刺客', '牧师'])}。${desc}`,
        location: `位于${pick(LOCATIONS)}的${pick(['大厅', '密室', '广场'])}`,
        relations: `${pick(NAMES_CN)}(${pick(['盟友', '敌人', '师徒'])})、${pick(NAMES_CN)}(${pick(['朋友', '宿敌'])})`,
      },
    }
  }

  if (type === 'LORE') {
    const name = pick(LORE)
    return {
      id: `doc-${id}`,
      type,
      fields: {
        name,
        description: `${name}是这个世界最古老的法则之一，掌控着${pick(['生', '死', '时', '空'])}的力量。${pick(EN_DESCRIPTIONS)}`,
        category: pick(['world-rule', 'power-system', 'history', 'artifact']),
      },
    }
  }

  const name = pick(ITEMS)
  return {
    id: `doc-${id}`,
    type,
    fields: {
      name,
      description: `${name}——传说中的神器，蕴含着${pick(['星辰', '龙血', '凤凰'])}之力。${pick(EN_DESCRIPTIONS)}`,
      owner: pick(NAMES_CN),
      location: pick(LOCATIONS),
    },
  }
}

function makeDocs(count: number): SearchableDocument[] {
  // Use deterministic seed via sequential IDs — pick() randomness is fine
  // for benchmarks since we only care about cost, not exact result counts.
  return Array.from({ length: count }, (_, i) => makeDoc(i))
}

// ---------------------------------------------------------------------------
// Tokenize benchmarks (baseline)
// ---------------------------------------------------------------------------

describe('tokenize', () => {
  const shortCJK = '林照是一位强大的战士'
  const longCJK =
    '夜色笼罩了整座城市，林照站在天台边缘，风吹动他的衣角。' +
    '远处传来阵阵钟声，仿佛在诉说着什么古老的故事。' +
    '白榆从身后走来，轻声说道："我们该出发了。"'
  const english =
    'A powerful warrior with exceptional swordsmanship and unwavering loyalty to the kingdom.'
  const mixed = `${shortCJK} ${english} 位于古堡大厅。`

  bench('short CJK text', () => {
    tokenize(shortCJK)
  })

  bench('long CJK text (~80 chars)', () => {
    tokenize(longCJK)
  })

  bench('English text', () => {
    tokenize(english)
  })

  bench('mixed CJK + English', () => {
    tokenize(mixed)
  })
})

// ---------------------------------------------------------------------------
// SearchEngine.addDocuments (indexing) benchmarks
// ---------------------------------------------------------------------------

function buildEngine(count: number): SearchEngine {
  const engine = new SearchEngine()
  engine.addDocuments(makeDocs(count))
  return engine
}

describe('SearchEngine.addDocuments', () => {
  bench('index 100 documents', () => {
    buildEngine(100)
  })

  bench('index 500 documents', () => {
    buildEngine(500)
  })

  bench('index 1_000 documents', () => {
    buildEngine(1_000)
  })

  bench('index 5_000 documents', () => {
    buildEngine(5_000)
  })
})

// ---------------------------------------------------------------------------
// SearchEngine.search benchmarks
// ---------------------------------------------------------------------------

describe('SearchEngine.search — CJK query', () => {
  const engine100 = buildEngine(100)
  const engine500 = buildEngine(500)
  const engine1k = buildEngine(1_000)
  const engine5k = buildEngine(5_000)

  bench('100 docs — CJK query "林照"', () => {
    engine100.search('林照')
  })

  bench('500 docs — CJK query "林照"', () => {
    engine500.search('林照')
  })

  bench('1_000 docs — CJK query "林照"', () => {
    engine1k.search('林照')
  })

  bench('5_000 docs — CJK query "林照"', () => {
    engine5k.search('林照')
  })
})

describe('SearchEngine.search — multi-token CJK query', () => {
  const engine500 = buildEngine(500)
  const engine5k = buildEngine(5_000)

  bench('500 docs — multi-token "古堡 大厅"', () => {
    engine500.search('古堡 大厅')
  })

  bench('5_000 docs — multi-token "古堡 大厅"', () => {
    engine5k.search('古堡 大厅')
  })
})

describe('SearchEngine.search — English query', () => {
  const engine500 = buildEngine(500)
  const engine5k = buildEngine(5_000)

  bench('500 docs — English "powerful warrior"', () => {
    engine500.search('powerful warrior')
  })

  bench('5_000 docs — English "powerful warrior"', () => {
    engine5k.search('powerful warrior')
  })
})

describe('SearchEngine.search — fuzzy query', () => {
  const engine1k = buildEngine(1_000)

  // "林赵" is a typo for "林照" — exercises fuzzy path
  bench('1_000 docs — fuzzy typo "林赵"', () => {
    engine1k.search('林赵')
  })
})

describe('SearchEngine.search — filtered by type', () => {
  const engine5k = buildEngine(5_000)

  bench('5_000 docs — filtered CHARACTERS only', () => {
    engine5k.search('林照', 'CHARACTER')
  })

  bench('5_000 docs — filtered LORE only', () => {
    engine5k.search('力量', 'LORE')
  })
})
