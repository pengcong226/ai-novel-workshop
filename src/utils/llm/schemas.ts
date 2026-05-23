/**
 * JSON Schema定义
 * 用于验证LLM输出的格式
 */

// 章节列表schema
export const chapterListSchema = {
  type: "array",
  items: {
    type: "object",
    required: ["number", "title", "startPosition", "endPosition"],
    properties: {
      number: {
        type: "number",
        minimum: 1,
        description: "章节号"
      },
      title: {
        type: "string",
        minLength: 1,
        maxLength: 200,
        description: "章节标题"
      },
      startPosition: {
        type: "number",
        minimum: 0,
        description: "起始位置（字符索引）"
      },
      endPosition: {
        type: "number",
        minimum: 0,
        description: "结束位置（字符索引）"
      }
    },
    additionalProperties: false
  }
}

// 章节模式识别schema
export const chapterPatternSchema = {
  type: "object",
  required: ["pattern", "examples", "estimatedTotal", "confidence"],
  properties: {
    pattern: {
      type: "string",
      minLength: 1,
      description: "章节标题的特征模式描述"
    },
    examples: {
      type: "array",
      items: {
        type: "string",
        minLength: 1
      },
      minItems: 1,
      description: "章节标题示例"
    },
    estimatedTotal: {
      type: "number",
      minimum: 1,
      description: "预估章节数"
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description: "置信度（0-1）"
    }
  },
  additionalProperties: false
}

// 人物列表schema
export const characterListSchema = {
  type: "array",
  items: {
    type: "object",
    required: ["name", "role", "personality", "description"],
    properties: {
      name: {
        type: "string",
        minLength: 2,
        maxLength: 20,
        description: "人物姓名"
      },
      role: {
        type: "string",
        enum: ["protagonist", "supporting", "antagonist", "minor"],
        description: "角色定位"
      },
      personality: {
        type: "array",
        items: {
          type: "string",
          minLength: 1
        },
        description: "性格特征"
      },
      firstAppearance: {
        type: "string",
        description: "首次出现章节"
      },
      description: {
        type: "string",
        minLength: 1,
        description: "人物描述"
      },
      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "置信度（0-1）"
      }
    },
    additionalProperties: false
  }
}

// 人物关系schema
export const relationshipListSchema = {
  type: "array",
  items: {
    type: "object",
    required: ["from", "to", "relation"],
    properties: {
      from: {
        type: "string",
        minLength: 1,
        description: "人物A姓名"
      },
      to: {
        type: "string",
        minLength: 1,
        description: "人物B姓名"
      },
      relation: {
        type: "string",
        minLength: 1,
        description: "关系类型"
      },
      description: {
        type: "string",
        description: "关系描述"
      }
    },
    additionalProperties: false
  }
}

// 世界观schema
export const worldSettingSchema = {
  type: "object",
  required: ["worldType", "era", "majorFactions", "keyLocations", "description"],
  properties: {
    worldType: {
      type: "string",
      minLength: 1,
      description: "世界类型（如：修仙世界、现代都市、科幻星际）"
    },
    era: {
      type: "string",
      minLength: 1,
      description: "时代背景"
    },
    powerSystem: {
      type: "string",
      description: "力量体系（可选）"
    },
    majorFactions: {
      type: "array",
      items: {
        type: "string",
        minLength: 1
      },
      description: "主要势力"
    },
    keyLocations: {
      type: "array",
      items: {
        type: "string",
        minLength: 1
      },
      description: "重要地点"
    },
    description: {
      type: "string",
      minLength: 1,
      description: "世界观描述"
    }
  },
  additionalProperties: false
}

// 大纲schema
export const outlineSchema = {
  type: "object",
  required: ["mainPlot", "subPlots", "keyEvents"],
  properties: {
    mainPlot: {
      type: "string",
      minLength: 10,
      description: "主线剧情描述"
    },
    subPlots: {
      type: "array",
      items: {
        type: "string",
        minLength: 1
      },
      description: "支线剧情"
    },
    keyEvents: {
      type: "array",
      items: {
        type: "object",
        required: ["chapter", "event"],
        properties: {
          chapter: {
            type: "number",
            minimum: 1,
            description: "章节号"
          },
          event: {
            type: "string",
            minLength: 1,
            description: "事件描述"
          }
        },
        additionalProperties: false
      },
      description: "关键事件"
    }
  },
  additionalProperties: false
}
