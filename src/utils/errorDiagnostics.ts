/**
 * AI 服务错误诊断工具
 *
 * 提供详细的错误诊断信息和解决方案
 */

export interface DiagnosticResult {
  success: boolean
  error?: string
  possibleCauses: string[]
  solutions: string[]
  actions: DiagnosticAction[]
}

export interface DiagnosticAction {
  label: string
  description: string
  type: 'link' | 'button' | 'info'
  value?: string
}

/**
 * 诊断 API 错误
 */
export function diagnoseAPIError(error: any, context: {
  provider?: string
  baseUrl?: string
  model?: string
}): DiagnosticResult {
  const errorMessage = error?.message || String(error)
  const statusCode = extractStatusCode(errorMessage)
  const errorType = identifyErrorType(errorMessage, statusCode)

  switch (errorType) {
    case 'auth_error':
      return diagnoseAuthError(context)
    case 'not_found':
      return diagnoseNotFoundError(context)
    case 'rate_limit':
      return diagnoseRateLimitError()
    case 'network_error':
      return diagnoseNetworkError(context)
    case 'invalid_request':
      return diagnoseInvalidRequest(errorMessage, context)
    case 'content_filter':
      return diagnoseContentFilterError(errorMessage, context)
    case 'provider_error':
      return diagnoseProviderError(errorMessage, context)
    default:
      return diagnoseUnknownError(errorMessage)
  }
}

/**
 * 提取 HTTP 状态码
 */
function extractStatusCode(errorMessage: string): number | null {
  const match = errorMessage.match(/(\d{3})/)
  return match ? parseInt(match[1]) : null
}

/**
 * 识别错误类型
 */
function identifyErrorType(errorMessage: string, statusCode: number | null): string {
  if (statusCode === 401 || statusCode === 403 || errorMessage.includes('Unauthorized') || errorMessage.includes('Invalid API key')) {
    return 'auth_error'
  }
  if (statusCode === 404 || errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
    return 'not_found'
  }
  if (statusCode === 429 || errorMessage.includes('rate limit') || errorMessage.includes('Too Many Requests')) {
    return 'rate_limit'
  }
  // 增加对国内 API 常见敏感词拦截的识别 (如 1003 或 msg 包含敏感内容)
  if (errorMessage.includes('敏感内容') || errorMessage.includes('安全要求') || errorMessage.includes('content filter') || errorMessage.includes('1003')) {
    return 'content_filter'
  }
  if (errorMessage.includes('network') || errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ETIMEDOUT')) {
    return 'network_error'
  }
  if (statusCode === 400 || errorMessage.includes('Invalid') || errorMessage.includes('Bad Request')) {
    return 'invalid_request'
  }
  if (errorMessage.includes('Claude provider not configured')) {
    return 'provider_error'
  }
  return 'unknown'
}

/**
 * 诊断认证错误
 */
function diagnoseAuthError(context: { provider?: string, baseUrl?: string }): DiagnosticResult {
  return {
    success: false,
    error: 'API 认证失败',
    possibleCauses: [
      'API 密钥不正确或已过期',
      'API 密钥格式错误（缺少前缀或包含多余空格）',
      'API 密钥没有访问该模型的权限',
      '账户余额不足或已欠费'
    ],
    solutions: [
      '检查 API 密钥是否正确复制（没有多余空格）',
      '确认 API 密钥是否有效（登录提供商控制台验证）',
      '检查账户是否有余额或配额',
      '确认 API 密钥有访问该模型的权限',
      `确认 Base URL 正确（当前：${context.baseUrl || '未设置'}）`
    ],
    actions: [
      {
        label: '检查配置',
        description: '打开项目配置页面',
        type: 'button',
        value: 'open_config'
      },
      {
        label: '获取 API 密钥',
        description: context.provider === 'anthropic'
          ? 'https://console.anthropic.com/'
          : context.provider === 'openai'
          ? 'https://platform.openai.com/api-keys'
          : context.baseUrl || '',
        type: 'link',
        value: context.provider === 'anthropic'
          ? 'https://console.anthropic.com/'
          : context.provider === 'openai'
          ? 'https://platform.openai.com/api-keys'
          : context.baseUrl || ''
      }
    ]
  }
}

/**
 * 诊断 404 错误
 */
function diagnoseNotFoundError(context: { provider?: string, model?: string, baseUrl?: string }): DiagnosticResult {
  return {
    success: false,
    error: 'API 端点或模型不存在',
    possibleCauses: [
      '模型名称不正确',
      'Base URL 错误',
      'API 版本不匹配',
      '提供商不支持该模型'
    ],
    solutions: [
      `确认模型名称正确（当前：${context.model || '未设置'}）`,
      `验证 Base URL 是否正确（当前：${context.baseUrl || '未设置'}）`,
      '检查提供商支持的模型列表',
      '确认 API 版本（如 v1 vs v4）'
    ],
    actions: [
      {
        label: '查看支持的模型',
        description: context.provider === 'anthropic'
          ? 'https://docs.anthropic.com/claude/docs/models-overview'
          : context.provider === 'openai'
          ? 'https://platform.openai.com/docs/models'
          : context.baseUrl || '',
        type: 'link',
        value: context.provider === 'anthropic'
          ? 'https://docs.anthropic.com/claude/docs/models-overview'
          : context.provider === 'openai'
          ? 'https://platform.openai.com/docs/models'
          : context.baseUrl || ''
      }
    ]
  }
}

/**
 * 诊断速率限制错误
 */
function diagnoseRateLimitError(): DiagnosticResult {
  return {
    success: false,
    error: 'API 请求速率超限',
    possibleCauses: [
      '短时间内发送了太多请求',
      '超出账户配额限制',
      '并发请求过多'
    ],
    solutions: [
      '等待几分钟后再试',
      '降低请求频率',
      '升级账户套餐以获得更高配额',
      '实施请求队列和重试机制'
    ],
    actions: [
      {
        label: '查看配额状态',
        description: '登录提供商控制台查看配额使用情况',
        type: 'info'
      }
    ]
  }
}

/**
 * 诊断网络错误
 */
function diagnoseNetworkError(context: { baseUrl?: string }): DiagnosticResult {
  return {
    success: false,
    error: '网络连接失败',
    possibleCauses: [
      '网络连接不稳定',
      'Base URL 无法访问',
      '防火墙或代理阻止连接',
      'DNS 解析失败'
    ],
    solutions: [
      '检查网络连接是否正常',
      `验证 Base URL 是否可访问（当前：${context.baseUrl || '未设置'}）`,
      '检查是否需要代理或 VPN',
      '尝试使用其他网络环境'
    ],
    actions: [
      {
        label: '测试连接',
        description: '在配置页面点击"测试连接"按钮',
        type: 'button',
        value: 'test_connection'
      },
      {
        label: '在浏览器中打开 Base URL',
        description: context.baseUrl || '',
        type: 'link',
        value: context.baseUrl || ''
      }
    ]
  }
}

/**
 * 诊断内容审核/敏感词拦截错误
 */
function diagnoseContentFilterError(errorMessage: string, context: { model?: string }): DiagnosticResult {
  return {
    success: false,
    error: '内容触发了安全审核机制 (敏感词拦截)',
    possibleCauses: [
      '前文历史记录（最近几章）中包含了涉黄、涉暴、涉政等敏感词汇',
      '大纲或当前设定的 Prompt 包含了违规描写',
      'API 提供商的审核规则过于严格，造成了误杀'
    ],
    solutions: [
      '排查并修改最近 3 章正文中的敏感词汇',
      '检查大纲与人物设定，避免使用高风险词语',
      '换用审核规则较宽松的模型（如海外版 OpenAI/Claude 或无过滤本地大模型）'
    ],
    actions: [
      {
        label: '查看原错误信息',
        description: errorMessage.substring(0, 100),
        type: 'info'
      }
    ]
  }
}

/**
 * 诊断无效请求错误
 */
function diagnoseInvalidRequest(errorMessage: string, context: { model?: string }): DiagnosticResult {
  return {
    success: false,
    error: 'API 请求参数无效',
    possibleCauses: [
      '请求格式不正确',
      '参数超出限制（如 max_tokens 过大）',
      '缺少必需参数',
      '参数值类型错误'
    ],
    solutions: [
      '检查请求参数是否符合 API 规范',
      '调整参数值（如减小 max_tokens）',
      '确认消息格式正确',
      '查看 API 文档了解参数限制'
    ],
    actions: [
      {
        label: '查看 API 文档',
        description: '了解请求参数规范',
        type: 'link',
        value: 'https://docs.anthropic.com/claude/reference/messages_post'
      },
      {
        label: '重试生成',
        description: '有时临时错误可以重试解决',
        type: 'button',
        value: 'retry'
      }
    ]
  }
}

/**
 * 诊断提供商配置错误
 */
function diagnoseProviderError(errorMessage: string, context: { provider?: string }): DiagnosticResult {
  return {
    success: false,
    error: 'AI 提供商配置错误',
    possibleCauses: [
      '未正确配置 AI 提供商',
      '模型路由器无法选择合适的模型',
      '配置的模型在提供商中不存在'
    ],
    solutions: [
      '检查项目配置中的 AI 提供商设置',
      '确认至少启用了一个提供商',
      '验证提供商的 API 密钥和 Base URL',
      '检查是否选择了正确的模型'
    ],
    actions: [
      {
        label: '打开配置',
        description: '检查 AI 提供商配置',
        type: 'button',
        value: 'open_config'
      }
    ]
  }
}

/**
 * 诊断未知错误
 */
function diagnoseUnknownError(errorMessage: string): DiagnosticResult {
  return {
    success: false,
    error: '未知错误',
    possibleCauses: [
      '意外的 API 响应格式',
      '服务暂时不可用',
      '其他未知错误'
    ],
    solutions: [
      '查看控制台日志了解详细错误信息',
      '重试操作',
      '如果问题持续，请联系技术支持并提供错误日志'
    ],
    actions: [
      {
        label: '查看详细日志',
        description: '打开浏览器控制台（F12）查看详细错误',
        type: 'info'
      },
      {
        label: '重试',
        description: '重新尝试该操作',
        type: 'button',
        value: 'retry'
      }
    ]
  }
}

/**
 * 格式化诊断结果为用户友好的消息
 */
export function formatDiagnosticMessage(result: DiagnosticResult): string {
  let message = `❌ ${result.error}\n\n`

  if (result.possibleCauses.length > 0) {
    message += '**可能原因：**\n'
    result.possibleCauses.forEach((cause, index) => {
      message += `${index + 1}. ${cause}\n`
    })
    message += '\n'
  }

  if (result.solutions.length > 0) {
    message += '**解决方案：**\n'
    result.solutions.forEach((solution, index) => {
      message += `${index + 1}. ${solution}\n`
    })
  }

  return message
}

/**
 * 检查配置是否完整
 */
export function validateConfig(config: {
  providers?: any[]
}): DiagnosticResult {
  if (!config.providers || config.providers.length === 0) {
    return {
      success: false,
      error: '未配置任何 AI 提供商',
      possibleCauses: [
        '尚未添加 AI 提供商配置',
        '所有提供商都已禁用'
      ],
      solutions: [
        '在项目配置中添加 AI 提供商',
        '至少启用一个提供商',
        '配置 API 密钥和 Base URL'
      ],
      actions: [
        {
          label: '打开配置',
          description: '添加 AI 提供商配置',
          type: 'button',
          value: 'open_config'
        },
        {
          label: '配置指南',
          description: '查看如何配置 AI 提供商',
          type: 'link',
          value: 'https://github.com/your-repo/ai-novel-workshop/blob/main/docs/AI_CONFIG.md'
        }
      ]
    }
  }

  const enabledProviders = config.providers.filter(p => p.isEnabled)
  if (enabledProviders.length === 0) {
    return {
      success: false,
      error: '没有启用的 AI 提供商',
      possibleCauses: [
        '所有提供商都已禁用'
      ],
      solutions: [
        '启用至少一个提供商',
        '检查提供商配置是否正确'
      ],
      actions: [
        {
          label: '打开配置',
          description: '启用 AI 提供商',
          type: 'button',
          value: 'open_config'
        }
      ]
    }
  }

  const providersWithoutKey = enabledProviders.filter(p => !p.apiKey)
  if (providersWithoutKey.length > 0) {
    return {
      success: false,
      error: '启用的提供商缺少 API 密钥',
      possibleCauses: [
        '未填写 API 密钥',
        'API 密钥字段为空'
      ],
      solutions: [
        '为所有启用的提供商配置 API 密钥',
        '或禁用未配置的提供商'
      ],
      actions: [
        {
          label: '打开配置',
          description: '配置 API 密钥',
          type: 'button',
          value: 'open_config'
        }
      ]
    }
  }

  return {
    success: true,
    possibleCauses: [],
    solutions: [],
    actions: []
  }
}
