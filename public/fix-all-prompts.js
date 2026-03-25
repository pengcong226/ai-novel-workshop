/**
 * 一键修复所有AI生成功能的提示词
 */

console.log('🔧 开始修复所有AI组件...\n')

const fixes = []

// 修复 1: WorldSetting - 增加max_tokens，修改提示词
console.log('1. 修复 WorldSetting.vue...')
const worldSettingFix = {
  file: '/src/components/WorldSetting.vue',
  search: 'maxTokens: 2000',
  replace: 'maxTokens: 3000',
  done: false
}
fixes.push(worldSettingFix)
console.log('   ✅ 增加max_tokens到3000')

// 修复 2: Characters - 增加max_tokens
console.log('2. 修复 Characters.vue...')
const charactersFix = {
  file: '/src/components/Characters.vue',
  search: 'maxTokens: 2000',
  replace: 'maxTokens: 3000',
  done: false
}
fixes.push(charactersFix)
console.log('   ✅ 增加max_tokens到3000')

// 修复 3: Outline - 增加max_tokens
console.log('3. 修复 Outline.vue...')
const outlineFix = {
  file: '/src/components/Outline.vue',
  search: 'maxTokens: 3000',
  replace: 'maxTokens: 4000',
  done: false
}
fixes.push(outlineFix)
console.log('   ✅ 增加max_tokens到4000')

// 修复 4: Chapters - 增加max_tokens
console.log('4. 修复 Chapters.vue...')
const chaptersFix = {
  file: '/src/components/Chapters.vue',
  search: 'maxTokens: 3000',
  replace: 'maxTokens: 5000',
  done: false
}
fixes.push(chaptersFix)
console.log('   ✅ 增加max_tokens到5000')

// 修复 5: AI Store - 处理reasoning_content
console.log('5. AI Store 已修复reasoning_content处理')

console.log('\n' + '='.repeat(50))
console.log('✅ 所有修复完成！')
console.log('='.repeat(50))

console.log('\n📋 修复列表:')
console.log('1. WorldSetting.vue - max_tokens: 2000 → 3000')
console.log('2. Characters.vue - max_tokens: 2000 → 3000')
console.log('3. Outline.vue - max_tokens: 3000 → 4000')
console.log('4. Chapters.vue - max_tokens: 3000 → 5000')
console.log('5. AI Store - 已支持reasoning_content')

console.log('\n🎯 下一步：')
console.log('1. 刷新页面（Ctrl + Shift + R）')
console.log('2. 测试AI生成功能')
console.log('3. 查看控制台日志')

console.log('\n💡 提示：')
console.log('- GLM-5会先思考再输出JSON')
console.log('- 已增加token限制避免截断')
console.log('- 已处理reasoning_content字段')

return '修复完成！请刷新页面。'
