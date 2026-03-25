<template>
  <div class="plugin-manager">
    <el-card class="header-card">
      <div class="header">
        <h2>插件管理</h2>
        <div class="actions">
          <el-button @click="showInstallDialog = true">
            <el-icon><Download /></el-icon>
            安装插件
          </el-button>
          <el-button @click="refreshPlugins">
            <el-icon><Refresh /></el-icon>
            刷新
          </el-button>
        </div>
      </div>
    </el-card>

    <div class="content">
      <!-- 插件列表 -->
      <el-tabs v-model="activeTab">
        <!-- 已安装插件 -->
        <el-tab-pane label="已安装" name="installed">
          <el-empty v-if="installedPlugins.length === 0" description="还没有安装插件">
            <el-button type="primary" @click="showInstallDialog = true">
              安装第一个插件
            </el-button>
          </el-empty>

          <div v-else class="plugin-grid">
            <el-card
              v-for="plugin in installedPlugins"
              :key="plugin.id"
              class="plugin-card"
              :class="{ 'is-active': isPluginActive(plugin.id) }"
            >
              <div class="plugin-header">
                <div class="plugin-icon">
                  {{ plugin.icon || '📦' }}
                </div>
                <div class="plugin-info">
                  <h3>{{ plugin.name }}</h3>
                  <div class="plugin-meta">
                    <span>v{{ plugin.version }}</span>
                    <span>·</span>
                    <span>{{ plugin.author }}</span>
                  </div>
                </div>
              </div>

              <div class="plugin-description">
                {{ plugin.description }}
              </div>

              <div v-if="plugin.permissions && plugin.permissions.length > 0" class="plugin-permissions">
                <el-tag
                  v-for="permission in plugin.permissions"
                  :key="permission"
                  size="small"
                  type="info"
                >
                  {{ getPermissionLabel(permission) }}
                </el-tag>
              </div>

              <el-divider />

              <div class="plugin-actions">
                <el-switch
                  v-model="plugin.active"
                  :loading="pluginToggling === plugin.id"
                  active-text="已启用"
                  inactive-text="已停用"
                  @change="togglePluginStatus(plugin)"
                />
                <el-button
                  size="small"
                  @click="showPluginSettings(plugin)"
                  :disabled="!isPluginActive(plugin.id)"
                >
                  <el-icon><Setting /></el-icon>
                  设置
                </el-button>
                <el-button
                  size="small"
                  type="danger"
                  @click="confirmUninstallPlugin(plugin)"
                >
                  <el-icon><Delete /></el-icon>
                  卸载
                </el-button>
              </div>
            </el-card>
          </div>
        </el-tab-pane>

        <!-- 扩展点浏览 -->
        <el-tab-pane label="扩展点" name="extensions">
          <el-collapse v-model="activeExtensions">
            <el-collapse-item title="AI Provider" name="providers">
              <div class="extension-list">
                <div
                  v-for="provider in registeredProviders"
                  :key="provider.id"
                  class="extension-item"
                >
                  <el-icon><Cpu /></el-icon>
                  <span>{{ provider.name }}</span>
                  <el-tag size="small">{{ provider.config.providerType }}</el-tag>
                </div>
                <el-empty v-if="registeredProviders.length === 0" description="未注册AI Provider" />
              </div>
            </el-collapse-item>

            <el-collapse-item title="导出器" name="exporters">
              <div class="extension-list">
                <div
                  v-for="exporter in registeredExporters"
                  :key="exporter.id"
                  class="extension-item"
                >
                  <el-icon><Download /></el-icon>
                  <span>{{ exporter.name }}</span>
                  <el-tag size="small">{{ exporter.format }}</el-tag>
                </div>
                <el-empty v-if="registeredExporters.length === 0" description="未注册导出器" />
              </div>
            </el-collapse-item>

            <el-collapse-item title="导入器" name="importers">
              <div class="extension-list">
                <div
                  v-for="importer in registeredImporters"
                  :key="importer.id"
                  class="extension-item"
                >
                  <el-icon><Upload /></el-icon>
                  <span>{{ importer.name }}</span>
                  <el-tag
                    v-for="format in importer.supportedFormats"
                    :key="format"
                    size="small"
                  >
                    {{ format }}
                  </el-tag>
                </div>
                <el-empty v-if="registeredImporters.length === 0" description="未注册导入器" />
              </div>
            </el-collapse-item>

            <el-collapse-item title="处理器" name="processors">
              <div class="extension-list">
                <div
                  v-for="processor in registeredProcessors"
                  :key="processor.id"
                  class="extension-item"
                >
                  <el-icon><Operation /></el-icon>
                  <span>{{ processor.name }}</span>
                  <el-tag size="small">{{ processor.stage }}</el-tag>
                </div>
                <el-empty v-if="registeredProcessors.length === 0" description="未注册处理器" />
              </div>
            </el-collapse-item>

            <el-collapse-item title="菜单项" name="menuItems">
              <div class="extension-list">
                <div
                  v-for="menuItem in registeredMenuItems"
                  :key="menuItem.id"
                  class="extension-item"
                >
                  <el-icon><Menu /></el-icon>
                  <span>{{ menuItem.label }}</span>
                </div>
                <el-empty v-if="registeredMenuItems.length === 0" description="未注册菜单项" />
              </div>
            </el-collapse-item>

            <el-collapse-item title="侧边栏面板" name="sidebarPanels">
              <div class="extension-list">
                <div
                  v-for="panel in registeredSidebarPanels"
                  :key="panel.id"
                  class="extension-item"
                >
                  <el-icon><Grid /></el-icon>
                  <span>{{ panel.title }}</span>
                  <el-tag size="small">{{ panel.position }}</el-tag>
                </div>
                <el-empty v-if="registeredSidebarPanels.length === 0" description="未注册侧边栏面板" />
              </div>
            </el-collapse-item>

            <el-collapse-item title="工具栏按钮" name="toolbarButtons">
              <div class="extension-list">
                <div
                  v-for="button in registeredToolbarButtons"
                  :key="button.id"
                  class="extension-item"
                >
                  <el-icon><Position /></el-icon>
                  <span>{{ button.label }}</span>
                  <el-tag size="small">{{ button.location }}</el-tag>
                </div>
                <el-empty v-if="registeredToolbarButtons.length === 0" description="未注册工具栏按钮" />
              </div>
            </el-collapse-item>
          </el-collapse>
        </el-tab-pane>

        <!-- 快捷命令 -->
        <el-tab-pane label="快捷命令" name="commands">
          <el-empty v-if="registeredQuickCommands.length === 0" description="未注册快捷命令" />
          <div v-else class="command-list">
            <el-card
              v-for="command in registeredQuickCommands"
              :key="command.id"
              class="command-card"
              shadow="hover"
            >
              <div class="command-info">
                <span class="command-text">{{ command.text }}</span>
                <el-tag size="small">{{ command.command }}</el-tag>
              </div>
              <el-button
                size="small"
                @click="executeCommand(command)"
                :disabled="!command.handler"
              >
                执行
              </el-button>
            </el-card>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- 安装插件对话框 -->
    <el-dialog
      v-model="showInstallDialog"
      title="安装插件"
      width="600px"
    >
      <el-tabs v-model="installTab">
        <el-tab-pane label="从URL安装" name="url">
          <el-form label-width="100px">
            <el-form-item label="插件URL">
              <el-input
                v-model="installUrl"
                placeholder="输入插件manifest.json的URL"
              />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="installFromUrl" :loading="installing">
                安装
              </el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="从本地文件安装" name="file">
          <el-upload
            drag
            :auto-upload="false"
            :on-change="handlePluginFileSelect"
            accept=".json"
          >
            <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
            <div class="el-upload__text">
              拖拽插件配置文件到此处，或<em>点击上传</em>
            </div>
            <template #tip>
              <div class="el-upload__tip">
                仅支持 .json 格式的插件配置文件
              </div>
            </template>
          </el-upload>
        </el-tab-pane>

        <el-tab-pane label="插件市场" name="market">
          <el-empty description="插件市场即将上线" />
        </el-tab-pane>
      </el-tabs>
    </el-dialog>

    <!-- 插件设置对话框 -->
    <el-dialog
      v-model="showSettingsDialog"
      :title="`${currentPlugin?.name} 设置`"
      width="600px"
    >
      <el-empty v-if="!currentPlugin?.configuration" description="此插件没有可配置项" />
      <el-form v-else label-width="120px">
        <el-form-item
          v-for="(config, key) in currentPlugin.configuration"
          :key="key"
          :label="config.description || key"
        >
          <el-input
            v-if="config.type === 'string'"
            v-model="pluginSettings[key]"
            :placeholder="`默认: ${config.default}`"
          />
          <el-input-number
            v-else-if="config.type === 'number'"
            v-model="pluginSettings[key]"
          />
          <el-switch
            v-else-if="config.type === 'boolean'"
            v-model="pluginSettings[key]"
          />
          <el-select
            v-else-if="config.type === 'array'"
            v-model="pluginSettings[key]"
            multiple
          >
            <el-option
              v-for="option in config.options || []"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showSettingsDialog = false">取消</el-button>
        <el-button type="primary" @click="savePluginSettings">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { usePluginStore } from '@/stores/plugin'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Download,
  Refresh,
  Setting,
  Delete,
  Cpu,
  Upload,
  Operation,
  Menu,
  Grid,
  Position,
  UploadFilled
} from '@element-plus/icons-vue'
import type { PluginManifest } from '@/plugins/types'
import { PluginLoader } from '@/plugins/loader'

const pluginStore = usePluginStore()

const activeTab = ref('installed')
const activeExtensions = ref(['providers'])
const showInstallDialog = ref(false)
const showSettingsDialog = ref(false)
const installTab = ref('url')
const installUrl = ref('')
const installing = ref(false)
const pluginToggling = ref<string | null>(null)
const currentPlugin = ref<PluginManifest | null>(null)
const pluginSettings = ref<Record<string, any>>({})

// 已安装插件
const installedPlugins = computed(() => {
  return pluginStore.plugins.map(plugin => ({
    ...plugin,
    active: pluginStore.isPluginActive(plugin.id)
  }))
})

// 注册的扩展点
const registeredProviders = computed(() => pluginStore.getRegistries().aiProvider.getAll())
const registeredExporters = computed(() => pluginStore.getRegistries().exporter.getAll())
const registeredImporters = computed(() => pluginStore.getRegistries().importer.getAll())
const registeredProcessors = computed(() => pluginStore.getRegistries().processor.getAll())
const registeredMenuItems = computed(() => pluginStore.getMenuItems())
const registeredSidebarPanels = computed(() => pluginStore.getSidebarPanels())
const registeredToolbarButtons = computed(() => pluginStore.getToolbarButtons())
const registeredQuickCommands = computed(() => pluginStore.getQuickCommands())

onMounted(async () => {
  await pluginStore.loadInstalledPlugins()
})

// 刷新插件
async function refreshPlugins() {
  try {
    await pluginStore.loadInstalledPlugins()
    ElMessage.success('插件列表已刷新')
  } catch (error) {
    ElMessage.error('刷新失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 判断插件是否激活
function isPluginActive(pluginId: string) {
  return pluginStore.isPluginActive(pluginId)
}

// 切换插件状态
async function togglePluginStatus(plugin: any) {
  pluginToggling.value = plugin.id

  try {
    if (plugin.active) {
      await pluginStore.activatePlugin(plugin.id)
      ElMessage.success(`插件 ${plugin.name} 已启用`)
    } else {
      await pluginStore.deactivatePlugin(plugin.id)
      ElMessage.success(`插件 ${plugin.name} 已停用`)
    }
  } catch (error) {
    ElMessage.error(`操作失败: ${error instanceof Error ? error.message : String(error)}`)
    plugin.active = !plugin.active // 恢复原状态
  } finally {
    pluginToggling.value = null
  }
}

// 显示插件设置
function showPluginSettings(plugin: PluginManifest) {
  currentPlugin.value = plugin
  pluginSettings.value = { ...pluginStore.getPluginSettings(plugin.id) }
  showSettingsDialog.value = true
}

// 保存插件设置
async function savePluginSettings() {
  if (!currentPlugin.value) return

  try {
    await pluginStore.updatePluginSettings(currentPlugin.value.id, pluginSettings.value)
    ElMessage.success('设置已保存')
    showSettingsDialog.value = false
  } catch (error) {
    ElMessage.error(`保存失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// 确认卸载插件
async function confirmUninstallPlugin(plugin: PluginManifest) {
  try {
    await ElMessageBox.confirm(
      `确定要卸载插件 "${plugin.name}" 吗？卸载后将无法使用此插件提供的功能。`,
      '卸载插件',
      {
        confirmButtonText: '确定卸载',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    await pluginStore.uninstallPlugin(plugin.id)
    ElMessage.success(`插件 ${plugin.name} 已卸载`)
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(`卸载失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

// 从URL安装插件
async function installFromUrl() {
  if (!installUrl.value.trim()) {
    ElMessage.warning('请输入插件URL')
    return
  }

  installing.value = true

  try {
    // 使用PluginLoader加载插件
    const result = await PluginLoader.loadFromUrl(installUrl.value)

    if (!result.success) {
      ElMessage.error(result.error || '加载插件失败')
      return
    }

    if (result.warnings && result.warnings.length > 0) {
      result.warnings.forEach(warning => {
        ElMessage.warning(warning)
      })
    }

    // 检查兼容性
    const compatibility = PluginLoader.checkCompatibility(result.manifest!)
    if (!compatibility.compatible) {
      ElMessage.error(`插件不兼容: ${compatibility.issues.join(', ')}`)
      return
    }

    // 安装插件
    await pluginStore.installPlugin(result.manifest!, async () => result.module)

    ElMessage.success(`插件 ${result.manifest!.name} 安装成功`)
    showInstallDialog.value = false
    installUrl.value = ''

    // 刷新插件列表
    await pluginStore.loadInstalledPlugins()
  } catch (error) {
    ElMessage.error(`安装失败: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    installing.value = false
  }
}

// 处理插件文件选择
async function handlePluginFileSelect(file: any) {
  try {
    // 使用PluginLoader加载插件
    const result = await PluginLoader.loadFromFile(file.raw)

    if (!result.success) {
      ElMessage.error(result.error || '加载插件失败')
      return
    }

    if (result.warnings && result.warnings.length > 0) {
      result.warnings.forEach(warning => {
        ElMessage.warning(warning)
      })
    }

    // 检查兼容性
    const compatibility = PluginLoader.checkCompatibility(result.manifest!)
    if (!compatibility.compatible) {
      ElMessage.error(`插件不兼容: ${compatibility.issues.join(', ')}`)
      return
    }

    // 安装插件
    await pluginStore.installPlugin(result.manifest!, async () => result.module)

    ElMessage.success(`插件 ${result.manifest!.name} 安装成功`)
    showInstallDialog.value = false

    // 刷新插件列表
    await pluginStore.loadInstalledPlugins()
  } catch (error) {
    ElMessage.error(`安装失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// 执行快捷命令
async function executeCommand(command: any) {
  if (command.handler) {
    try {
      await command.handler()
      ElMessage.success('命令执行成功')
    } catch (error) {
      ElMessage.error(`命令执行失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

// 获取权限标签
function getPermissionLabel(permission: string) {
  const labels: Record<string, string> = {
    'storage': '存储访问',
    'network': '网络请求',
    'filesystem': '文件系统',
    'ai-api': 'AI API',
    'project-data': '项目数据',
    'user-settings': '用户设置'
  }
  return labels[permission] || permission
}
</script>

<style scoped>
.plugin-manager {
  padding: 20px;
}

.header-card {
  margin-bottom: 20px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header h2 {
  margin: 0;
  font-size: 20px;
}

.actions {
  display: flex;
  gap: 10px;
}

.plugin-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 20px;
  margin-top: 20px;
}

.plugin-card {
  transition: all 0.3s;
}

.plugin-card.is-active {
  border-color: #409eff;
}

.plugin-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.plugin-icon {
  font-size: 32px;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f7fa;
  border-radius: 8px;
}

.plugin-info h3 {
  margin: 0;
  font-size: 16px;
}

.plugin-meta {
  display: flex;
  gap: 8px;
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.plugin-description {
  font-size: 14px;
  color: #606266;
  margin-bottom: 12px;
  line-height: 1.6;
}

.plugin-permissions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.plugin-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.extension-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.extension-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background: #f5f7fa;
  border-radius: 4px;
}

.extension-item .el-tag {
  margin-left: auto;
}

.command-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 20px;
}

.command-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.command-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.command-text {
  font-weight: 500;
}
</style>
