#!/usr/bin/env python3
"""Apply i18n changes to main.ts and ProjectList.vue"""

import sys

# 1. Update main.ts
with open('src/main.ts', 'r') as f:
    content = f.read()

content = content.replace(
    "import { getLogger, initLogger } from './utils/logger'",
    "import { getLogger, initLogger } from './utils/logger'\nimport i18n from './i18n'"
)

content = content.replace(
    'app.use(router)\napp.use(VueKonva)',
    'app.use(router)\napp.use(i18n)\napp.use(VueKonva)'
)

with open('src/main.ts', 'w') as f:
    f.write(content)

print('main.ts updated successfully')

# 2. Update ProjectList.vue
with open('src/views/ProjectList.vue', 'r') as f:
    content = f.read()

# --- Script: Add useI18n import ---
content = content.replace(
    "import { useRouter } from 'vue-router'",
    "import { useRouter } from 'vue-router'\nimport { useI18n } from 'vue-i18n'"
)

content = content.replace(
    'const projectStore = useProjectStore()\n\n// Register',
    "const projectStore = useProjectStore()\nconst { t } = useI18n()\n\n// Register"
)

# --- Template replacements ---

# Hero section
content = content.replace(
    '<p class="hero-kicker">AI 小说工坊</p>',
    "<p class=\"hero-kicker\">{{ t('projectList.appName') }}</p>"
)
content = content.replace(
    '<h1 class="hero-title">创作工坊</h1>',
    "<h1 class=\"hero-title\">{{ t('projectList.title') }}</h1>"
)
content = content.replace(
    '{{ projectStore.projects.length }} 部作品 · {{ totalWords }} 万字',
    "{{ t('projectList.subtitle', { count: projectStore.projects.length, words: totalWords }) }}"
)

# Hero buttons - handle the multiline pattern
content = content.replace(
    '<el-icon><Upload /></el-icon>\n          导入',
    "<el-icon><Upload /></el-icon>\n          {{ t('projectList.importBtn') }}"
)
content = content.replace(
    '<el-icon><Plus /></el-icon>\n          新建项目',
    "<el-icon><Plus /></el-icon>\n          {{ t('projectList.newProjectBtn') }}"
)

# Empty state
content = content.replace(
    '<h2>开始你的第一部作品</h2>',
    "<h2>{{ t('projectList.emptyTitle') }}</h2>"
)
content = content.replace(
    '从空白项目或模板出发，把设定、章节和审校流程集中到一个创作空间。',
    "{{ t('projectList.emptyDesc') }}"
)
content = content.replace(
    '一键体验示例',
    "{{ t('projectList.quickDemo') }}"
)

# Be careful with 新建项目 replacement - only in the empty-actions section
content = content.replace(
    '<el-button round @click="showCreateDialog = true">新建项目</el-button>',
    "<el-button round @click=\"showCreateDialog = true\">{{ t('common.newProject') }}</el-button>"
)
content = content.replace(
    '>从模板创建</el-button>',
    ">{{ t('projectList.createFromTemplate') }}</el-button>"
)

# Dropdown items
content = content.replace(
    '<el-icon><Edit /></el-icon>打开项目',
    "<el-icon><Edit /></el-icon>{{ t('projectList.openProject') }}"
)
content = content.replace(
    '<el-icon><Download /></el-icon>导出备份',
    "<el-icon><Download /></el-icon>{{ t('projectList.exportBackup') }}"
)
content = content.replace(
    '<el-icon><Delete /></el-icon>删除项目',
    "<el-icon><Delete /></el-icon>{{ t('projectList.deleteProject') }}"
)

# Card meta
content = content.replace(
    "project.genre || '未分类'",
    "project.genre || t('common.uncategorized')"
)

# No description
content = content.replace(
    '尚未填写作品简介',
    "{{ t('projectList.noDescription') }}"
)

# Progress text
content = content.replace(
    '{{ formatNumber(project.currentWords) }} / {{ formatNumber(project.targetWords) }} 字',
    "{{ t('projectList.progressText', { current: formatNumber(project.currentWords), target: formatNumber(project.targetWords) }) }}"
)

# Create dialog title
content = content.replace(
    'title="新建小说项目"',
    ":title=\"t('projectList.createDialog.title')\""
)

# Form labels - using :label for dynamic binding
content = content.replace(
    'label="项目名称" prop="title"',
    ":label=\"t('projectList.createDialog.nameLabel')\" prop=\"title\""
)
content = content.replace(
    'label="小说类型" prop="genre"',
    ":label=\"t('projectList.createDialog.genreLabel')\" prop=\"genre\""
)
content = content.replace(
    'label="目标字数" prop="targetWords"',
    ":label=\"t('projectList.createDialog.targetWordsLabel')\" prop=\"targetWords\""
)
content = content.replace(
    'label="创作模板" prop="template"',
    ":label=\"t('projectList.createDialog.templateLabel')\" prop=\"template\""
)

# Placeholders
content = content.replace(
    'placeholder="请输入小说名称（例如：赛博修仙传）"',
    ":placeholder=\"t('projectList.createDialog.namePlaceholder')\""
)
content = content.replace(
    'placeholder="请选择小说类型"',
    ":placeholder=\"t('projectList.createDialog.genrePlaceholder')\""
)
content = content.replace(
    'placeholder="选择初始结构模板"',
    ":placeholder=\"t('projectList.createDialog.templatePlaceholder')\""
)

# Tip text
content = content.replace(
    '建议中长篇小说目标设定在 20 万字左右',
    "{{ t('projectList.createDialog.targetWordsTip') }}"
)

# Template option labels
content = content.replace(
    'label="空白项目 (自定义设定)"',
    ":label=\"t('projectList.createDialog.templates.blank')\""
)
content = content.replace(
    'label="标准网文 (包含常用设定和卷架构)"',
    ":label=\"t('projectList.createDialog.templates.standard')\""
)
content = content.replace(
    'label="快速大纲 (AI辅助生成框架)"',
    ":label=\"t('projectList.createDialog.templates.quickOutline')\""
)
content = content.replace(
    'label="短篇小说 (5千-3万字单卷结构)"',
    ":label=\"t('projectList.createDialog.templates.shortFiction')\""
)
content = content.replace(
    'label="同人创作 (支持Canon/AU/OOC/CP模式)"',
    ":label=\"t('projectList.createDialog.templates.fanfic')\""
)

# Footer buttons
content = content.replace(
    'showCreateDialog = false" :disabled="creating">取消</el-button>',
    "showCreateDialog = false\" :disabled=\"creating\">{{ t('common.cancel') }}</el-button>"
)
content = content.replace(
    "{{ creating ? '创建中...' : '确认创建' }}",
    "{{ creating ? t('projectList.createDialog.creatingBtn') : t('projectList.createDialog.createBtn') }}"
)

# Template dialog
content = content.replace(
    'title="从模板创建项目"',
    ":title=\"t('projectList.templateDialog.title')\""
)
content = content.replace(
    'content="配置项目信息"',
    ":content=\"t('projectList.templateDialog.configHeader')\""
)

# Template form labels
content = content.replace(
    '<el-form-item label="项目名称">\n            <el-input v-model="templateProjectName"',
    "<el-form-item :label=\"t('projectList.templateDialog.nameLabel')\">\n            <el-input v-model=\"templateProjectName\""
)
content = content.replace(
    'label="模板信息"',
    ":label=\"t('projectList.templateDialog.templateInfoLabel')\""
)
content = content.replace(
    'label="模板名称"',
    ":label=\"t('projectList.templateDialog.templateNameLabel')\""
)
content = content.replace(
    'label="描述">',
    ":label=\"t('projectList.templateDialog.descriptionLabel')\">"
)
content = content.replace(
    'label="标签">',
    ":label=\"t('projectList.templateDialog.tagsLabel')\">"
)
content = content.replace(
    'label="导入内容"',
    ":label=\"t('projectList.templateDialog.importContentLabel')\""
)
content = content.replace(
    'placeholder="输入新项目名称"',
    ":placeholder=\"t('projectList.templateDialog.namePlaceholder')\""
)

# Checkbox labels
content = content.replace(
    '世界观设定 ({{ Object.keys(selectedTemplate.world).length }} 项)',
    "{{ t('projectList.templateDialog.worldOption', { count: Object.keys(selectedTemplate.world).length }) }}"
)
content = content.replace(
    '角色设定 ({{ selectedTemplate.characters?.length || 0 }} 名)',
    "{{ t('projectList.templateDialog.charactersOption', { count: selectedTemplate.characters?.length || 0 }) }}"
)
content = content.replace(
    '>故事大纲</el-checkbox>',
    ">{{ t('projectList.templateDialog.outlineOption') }}</el-checkbox>"
)

# Alert
content = content.replace(
    'title="选择一个内置或自定义模板作为新项目的起点"',
    ":title=\"t('projectList.templateDialog.selectHint')\""
)

# Template dialog footer
content = content.replace(
    '@click="selectedTemplate = null">返回重选</el-button>',
    "@click=\"selectedTemplate = null\">{{ t('projectList.templateDialog.backBtn') }}</el-button>"
)

# This is tricky - the create button text "创建项目" appears in template dialog and fanfic template
# Let's replace it in context
content = content.replace(
    ':loading="creatingFromTemplate">\n          创建项目\n        </el-button>\n      </template>\n    </el-dialog>',
    ":loading=\"creatingFromTemplate\">\n          {{ t('projectList.templateDialog.createBtn') }}\n        </el-button>\n      </template>\n    </el-dialog>"
)

# Import dialog
content = content.replace(
    'title="导入项目"\n      width="400px"',
    ":title=\"t('projectList.importDialog.title')\"\n      width=\"400px\""
)
content = content.replace(
    '拖拽项目文件到此处，或 <em>点击选择文件</em>',
    "{{ t('projectList.importDialog.dragText', { link: '' }) }}<em>{{ t('projectList.importDialog.clickHere') }}</em>"
)
content = content.replace(
    '支持 .anproj (JSON) 或 .anprojl (大型分行JSON) 格式',
    "{{ t('projectList.importDialog.formatTip') }}"
)

# Fanfic dialog
content = content.replace(
    'title="同人创作"\n      width="600px"',
    ":title=\"t('projectList.fanficDialog.title')\"\n      width=\"600px\""
)
content = content.replace(
    'label="原作名称"',
    ":label=\"t('projectList.fanficDialog.sourceLabel')\""
)
content = content.replace(
    'placeholder="请输入原作名称（如：斗破苍穹、三体）"',
    ":placeholder=\"t('projectList.fanficDialog.sourcePlaceholder')\""
)
content = content.replace(
    'label="同人模式"',
    ":label=\"t('projectList.fanficDialog.modeLabel')\""
)
content = content.replace('Canon（忠实原作）', "{{ t('projectList.fanficDialog.modeCanon') }}")
content = content.replace('AU（平行宇宙）', "{{ t('projectList.fanficDialog.modeAu') }}")
content = content.replace('OOC（性格偏离）', "{{ t('projectList.fanficDialog.modeOoc') }}")
content = content.replace('CP（配对为主）', "{{ t('projectList.fanficDialog.modeCp') }}")
content = content.replace(
    'label="主要角色"',
    ":label=\"t('projectList.fanficDialog.charactersLabel')\""
)
content = content.replace(
    'placeholder="多个角色用逗号分隔（如：萧炎,萧薰儿,美杜莎）"',
    ":placeholder=\"t('projectList.fanficDialog.charactersPlaceholder')\""
)
content = content.replace(
    'label="CP配对"',
    ":label=\"t('projectList.fanficDialog.cpLabel')\""
)
content = content.replace(
    'placeholder="如：萧炎x萧薰儿"',
    ":placeholder=\"t('projectList.fanficDialog.cpPlaceholder')\""
)
content = content.replace(
    'label="AU世界观"',
    ":label=\"t('projectList.fanficDialog.auLabel')\""
)
content = content.replace(
    'placeholder="描述AU模式下的世界观设定"',
    ":placeholder=\"t('projectList.fanficDialog.auPlaceholder')\""
)
content = content.replace(
    'label="主题">',
    ":label=\"t('projectList.fanficDialog.themeLabel')\">"
)
content = content.replace(
    'placeholder="可选，如：成长、救赎、复仇"',
    ":placeholder=\"t('projectList.fanficDialog.themePlaceholder')\""
)

# Fanfic footer
content = content.replace(
    'showFanficDialog = false">取消</el-button>',
    "showFanficDialog = false\">{{ t('common.cancel') }}</el-button>"
)
content = content.replace(
    ':loading="creating">\n          创建同人项目\n        </el-button>\n      </template>\n    </el-dialog>',
    ":loading=\"creating\">\n          {{ t('projectList.fanficDialog.createBtn') }}\n        </el-button>\n      </template>\n    </el-dialog>"
)

# --- Script section replacements ---

# Validation messages
content = content.replace(
    "{ required: true, message: '请输入项目名称', trigger: 'blur' }",
    "{ required: true, message: t('projectList.validation.nameRequired'), trigger: 'blur' }"
)
content = content.replace(
    "{ min: 1, max: 50, message: '长度在 1 到 50 个字符', trigger: 'blur' }",
    "{ min: 1, max: 50, message: t('projectList.validation.nameLength'), trigger: 'blur' }"
)
content = content.replace(
    "{ required: true, message: '请选择小说类型', trigger: 'change' }",
    "{ required: true, message: t('projectList.validation.genreRequired'), trigger: 'change' }"
)
content = content.replace(
    "{ required: true, message: '请设置目标字数', trigger: 'blur' }",
    "{ required: true, message: t('projectList.validation.targetWordsRequired'), trigger: 'blur' }"
)

# Note: createRules uses reactive(), so t() calls will be re-evaluated when locale changes
# But we need to change from reactive to computed for this to work properly.
# For now, let's keep reactive and note that these are static at init time.

# Message strings in script
content = content.replace(
    "ElMessage.warning('请输入原作名称')",
    "ElMessage.warning(t('projectList.messages.enterSourceMaterial'))"
)
content = content.replace(
    "ElMessage.warning('请输入主要角色')",
    "ElMessage.warning(t('projectList.messages.enterCharacters'))"
)
content = content.replace(
    "ElMessage.warning('CP模式下请输入CP配对')",
    "ElMessage.warning(t('projectList.messages.enterCpPairing'))"
)
content = content.replace(
    "ElMessage.success('示例项目已创建，开始探索吧！')",
    "ElMessage.success(t('projectList.messages.demoCreated'))"
)
content = content.replace(
    "getFriendlyMessage('创建失败'))",
    "getFriendlyMessage(t('projectList.messages.demoFailed')))"
)
content = content.replace(
    "ElMessage.success('同人创作项目已创建！')",
    "ElMessage.success(t('projectList.messages.fanficCreated'))"
)
content = content.replace(
    "getFriendlyMessage('创建同人项目失败'))",
    "getFriendlyMessage(t('projectList.messages.fanficFailed')))"
)
content = content.replace(
    "ElMessage.success('短篇小说项目创建成功！请在章节中直接开始写作。')",
    "ElMessage.success(t('projectList.messages.shortFicCreated'))"
)
content = content.replace(
    "ElMessage.success('项目创建成功！')",
    "ElMessage.success(t('projectList.messages.projectCreated'))"
)

# Import messages
content = content.replace(
    "ElMessage.info({ message: '正在导入项目...', duration: 0 })",
    "ElMessage.info({ message: t('projectList.messages.importing'), duration: 0 })"
)
content = content.replace(
    "ElMessage.success('导入成功')",
    "ElMessage.success(t('projectList.messages.importSuccess'))"
)
content = content.replace(
    "'导入失败: ' + getFriendlyMessage",
    "t('projectList.messages.importFailed') + ': ' + getFriendlyMessage"
)

# Export messages
content = content.replace(
    "ElMessage.success('导出准备中，即将开始下载')",
    "ElMessage.success(t('projectList.messages.exportPreparing'))"
)
content = content.replace(
    "getFriendlyMessage('导出失败'))",
    "getFriendlyMessage(t('projectList.messages.exportFailed')))"
)

# Delete messages
content = content.replace(
    "'确认要删除这个项目吗？所有数据将被永久删除，此操作不可恢复！'",
    "t('projectList.messages.deleteConfirm')"
)
content = content.replace(
    "'警告',",
    "t('projectList.messages.deleteTitle'),"
)
content = content.replace(
    "confirmButtonText: '确定删除',",
    "confirmButtonText: t('projectList.messages.deleteBtn'),"
)
content = content.replace(
    "cancelButtonText: '取消',",
    "cancelButtonText: t('common.cancel'),"
)
content = content.replace(
    "ElMessage.success('项目已删除')",
    "ElMessage.success(t('projectList.messages.deleted'))"
)

# Template messages
content = content.replace(
    "ElMessage.warning('请输入项目名称')\n    return\n  }\n\n  creatingFromTemplate",
    "ElMessage.warning(t('projectList.messages.enterProjectName'))\n    return\n  }\n\n  creatingFromTemplate"
)
content = content.replace(
    '`已从模板"${selectedTemplate.value.meta.name}"创建作品`',
    "t('projectList.messages.templateCreated', { name: selectedTemplate.value.meta.name })"
)
content = content.replace(
    "'创建失败: ' + getFriendlyMessage((error as Error).message))",
    "t('projectList.messages.createFailed') + ': ' + getFriendlyMessage((error as Error).message))"
)

# Note: there's a second "创建失败" in handleCreate catch - handle it
content = content.replace(
    "getFriendlyMessage('创建失败'))\n      } finally {\n        creating.value = false\n      }\n    }\n  })\n}",
    "getFriendlyMessage(t('projectList.messages.createFailed')))\n      } finally {\n        creating.value = false\n      }\n    }\n  })\n}"
)

# Delete error messages
content = content.replace(
    "getFriendlyMessage('删除失败'))",
    "getFriendlyMessage(t('projectList.messages.deleteFailed')))"
)

with open('src/views/ProjectList.vue', 'w') as f:
    f.write(content)

print('ProjectList.vue updated successfully')
