const db = require('better-sqlite3')('ai_novel_workshop.db');

const projectRow = db.prepare('SELECT data FROM projects LIMIT 1').get();
const project = JSON.parse(projectRow.data);

const chaptersRows = db.prepare('SELECT data FROM chapters').all();
const chapters = chaptersRows.map(r => JSON.parse(r.data)).sort((a,b) => a.number - b.number);
project.chapters = chapters;

// 模拟上下文构建
function estimateTokens(text) {
  if (!text) return 0;
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
  const otherChars = text.length - chineseChars - englishWords.length;
  return Math.ceil(chineseChars * 1.5 + englishWords * 1.2 + otherChars * 0.5);
}

function truncateToTokens(text, maxTokens) {
  if (!text) return '';
  const currentTokens = estimateTokens(text);
  if (currentTokens <= maxTokens) return text;
  const ratio = maxTokens / currentTokens;
  let targetLength = Math.floor(text.length * ratio * 0.9);
  if (targetLength < 0) targetLength = 0;
  let truncated = text.substring(0, targetLength);
  if (truncated.length > 0) {
    const lastCode = truncated.charCodeAt(truncated.length - 1);
    if (lastCode >= 0xD800 && lastCode <= 0xDBFF) {
      truncated = truncated.substring(0, truncated.length - 1);
    }
  }
  return truncated + '\n...(内容已截断)';
}

const currentChapterNum = 14;
const recentChapters = chapters
  .filter(ch => ch.number < currentChapterNum && ch.number >= currentChapterNum - 3)
  .sort((a, b) => b.number - a.number);

let totalTokens = 0;
const parts = [];
const maxTokensLimit = 2000;

for (const ch of recentChapters) {
  const cContent = ch.content || '';
  const chapterText = `\n第${ch.number}章 ${ch.title}\n${cContent}`;
  const chapterTokens = estimateTokens(chapterText);

  if (totalTokens + chapterTokens > maxTokensLimit) {
    const remainingTokens = maxTokensLimit - totalTokens;
    if (remainingTokens > 50) {
      const truncatedContent = truncateToTokens(cContent, remainingTokens - 50);
      parts.push(`\n第${ch.number}章 ${ch.title}\n${truncatedContent}`);
    }
    break;
  }
  parts.push(chapterText);
  totalTokens += chapterTokens;
}

const recentChaptersText = parts.join('\n');
const prompt = "测试章节生成。前文：\n" + recentChaptersText;

const payload = {
  model: 'glm-5',
  messages: [{ role: 'user', content: prompt }],
  max_tokens: 65536,
  temperature: 0.7,
  top_p: 0.9
};

const apiKey = project.config.providers[0].apiKey;
const baseUrl = project.config.providers[0].baseUrl;

console.log("🚀 发送 API 请求...");
console.log("请求体积 (字符数):", JSON.stringify(payload).length);

(async () => {
  try {
    let response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errText = await response.text();
        console.log(`❌ 第一次请求失败: HTTP ${response.status}`);
        console.log(`详细错误: ${errText}`);
        
        const errorMsg = errText.toLowerCase();
        if (response.status === 400 || response.status === 422 || errorMsg.includes('token')) {
            console.log('🔄 触发降级重试逻辑: 移除 max_tokens 和 top_p (模拟 ai.ts)...');
            delete payload.max_tokens;
            // Also if API complains about top_p and temperature used together
            
            response = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(payload)
            });
            
            if (!response.ok) {
                const retryErr = await response.text();
                console.log(`❌ 重试仍然失败: HTTP ${response.status}`);
                console.log(`详细错误: ${retryErr}`);
            } else {
                console.log(`✅ 重试成功！HTTP ${response.status}`);
            }
        }
    } else {
        console.log(`✅ 第一次请求成功！HTTP ${response.status}`);
    }
  } catch (e) {
    console.error("Fetch error:", e);
  }
})();
