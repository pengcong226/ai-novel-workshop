const Database = require('better-sqlite3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const dbPath = path.resolve(__dirname, 'ai_novel_workshop.db');
const db = new Database(dbPath);

const projectId = uuidv4();
const projectTitle = '九天吞噬诀（300章百万字极限测试）';

console.log(`🚀 开始创建 300 章百万字玄幻巨著: ${projectTitle} (${projectId})`);

const projectData = {
  id: projectId,
  title: projectTitle,
  description: '一本标准的升级流玄幻爽文。主角从废柴开局，获得吞噬神鼎，一路逆袭，最终踏破九天。',
  genre: '玄幻',
  targetWords: 1200000,
  currentWords: 0,
  status: 'draft',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  world: { 
    name: '九霄大陆', 
    era: { time: '荒古纪元', techLevel: '修真', socialForm: '宗门林立' }, 
    geography: { locations: ['东荒', '南岭', '西漠', '北原', '中州'] }, 
    factions: ['天剑宗', '万魔谷', '丹鼎阁', '紫微圣地'], 
    rules: ['炼体、聚气、凝元、真丹、神海、虚天、涅槃、圣尊、神帝'], 
    aiGenerated: true 
  },
  characters: [
    { id: 'c1', name: '叶辰', role: 'protagonist', personality: '杀伐果断、重情重义', background: '原本是家族天才，被未婚妻夺走灵脉沦为废人，后坠崖获得吞噬神鼎。' },
    { id: 'c2', name: '苏雪', role: 'antagonist', personality: '冷酷无情', background: '叶辰的前未婚妻，夺走灵脉后拜入紫微圣地。' },
    { id: 'c3', name: '九幽魔帝', role: 'supporting', personality: '傲娇腹黑', background: '只剩一缕残魂寄宿在神鼎中的上古大能，成为叶辰的随身老爷爷。' }
  ],
  outline: { 
    synopsis: '少年叶辰，遭人陷害沦为废人，得吞噬神鼎，炼化万物！夺天地造化，踩天骄，斩邪魔，一路逆天而上，成就万古第一神帝！', 
    chapters: [] 
  },
  chapters: [],
  config: { preset: 'standard' }
};

// 1. 插入项目
db.prepare('INSERT OR REPLACE INTO projects (id, data) VALUES (?, ?)').run(projectId, JSON.stringify(projectData));

// 2. 更新项目元数据列表
let metaList = [];
const metaRow = db.prepare('SELECT data FROM projects_meta WHERE id = 1').get();
if (metaRow) {
  try { metaList = JSON.parse(metaRow.data); } catch(e) {}
}
if(!metaList.find(p => p.id === projectId)) {
  metaList.push({
    id: projectId,
    title: projectData.title,
    genre: projectData.genre,
    updatedAt: projectData.updatedAt
  });
  db.prepare('INSERT OR REPLACE INTO projects_meta (id, data) VALUES (1, ?)').run(JSON.stringify(metaList));
}

console.log(`✅ 项目基础设定创建成功！`);
console.log(`📝 开始疯狂码字生成 300 章，目标每章 4000 字...`);

let totalWords = 0;
const insertChapterStmt = db.prepare('INSERT OR REPLACE INTO chapters (id, project_id, data) VALUES (?, ?, ?)');

// 玄幻爽文常用词库，用于随机生成逼真的段落
const actions = ["怒吼", "冷笑", "双眼微眯", "一剑斩出", "疯狂运转吞噬神鼎", "仰天长啸", "踏空而行", "捏碎了手中的传讯玉简", "吐出一口浊气", "擦去嘴角的鲜血"];
const descriptions = [
  "恐怖的灵力波动以他为中心向四周轰然炸开，周围的空间仿佛都承受不住这股力量，发出了不堪重负的咔咔声。",
  "天空中乌云密布，雷霆在云层中疯狂翻滚，仿佛是在为即将降世的无上神威而颤抖。",
  "那一剑的风情，惊艳了时光，黯淡了日月。在场的所有人都张大了嘴巴，呆若木鸡地看着这如神灵降世般的一击。",
  "他体内的经脉如同奔腾的江河，狂暴的药力在他的四肢百骸中疯狂肆虐，带来一阵阵撕裂般的剧痛。",
  "不远处，几头堪比真丹境的高阶妖兽正虎视眈眈，猩红的眼眸中闪烁着贪婪与残忍的光芒。"
];
const dialogues = [
  "“就凭你这蝼蚁，也敢染指本少爷的机缘？简直是找死！”",
  "“三十年河东，三十年河西！今日你加诸于我身上的屈辱，他日我定要你百倍偿还！”",
  "“哈哈哈！叶辰，你以为你还能像以前那样嚣张吗？现在的你，不过是个没有灵脉的废人罢了！”",
  "“小子，这股力量不是现在的你能承受的！快停下，否则你会爆体而亡的！”九幽魔帝焦急的声音在脑海中响起。",
  "“我命由我不由天！给我吞！”"
];

for (let i = 1; i <= 300; i++) {
  const chapterId = `chap_${projectId}_${i}`;
  
  // 决定章节名
  let phase = "东荒历练";
  let realm = "炼体";
  if (i > 50) { phase = "天剑大比"; realm = "凝元"; }
  if (i > 100) { phase = "南岭遗迹"; realm = "真丹"; }
  if (i > 150) { phase = "圣地追杀"; realm = "神海"; }
  if (i > 200) { phase = "中州风云"; realm = "虚天"; }
  if (i > 250) { phase = "登顶九霄"; realm = "神帝"; }

  const title = `第${i}章：${phase} - 突破${realm}境`;
  
  // 生成大约 4000 字的正文
  // 每次循环生成一段约 150 字的内容，循环 27 次约 4000 字
  let content = `    【系统提示：本章节为百万字极限性能测试生成，展示了系统在超长篇幅下依然坚如磐石的数据承载力。】\n\n`;
  for(let p=0; p < 27; p++) {
    const action = actions[Math.floor(Math.random() * actions.length)];
    const desc = descriptions[Math.floor(Math.random() * descriptions.length)];
    const dialog = dialogues[Math.floor(Math.random() * dialogues.length)];
    
    // 构造极具画面感的冗长玄幻描写
    content += `    叶辰${action}，只感觉体内的力量如同即将喷发的火山。${desc}此时此刻，他的目光如炬，死死地盯着前方的强敌。${dialog}就在这千钧一发之际，他体内的吞噬神鼎突然爆发出刺目的黑芒，一股古老、苍茫、仿佛能吞噬诸天万界的恐怖气息轰然降临。周围的灵气如同受到了某种强烈的召唤，形成了一个巨大的灵气漩涡，疯狂地涌入他的头顶。随着力量的不断攀升，他感觉到阻碍自己突破的那层无形壁障正在剧烈颤抖。\n\n`;
    content += `    “给我破！”伴随着一声震动九霄的爆喝，叶辰的丹田内传来一声清脆的破裂声。紧接着，一股比之前强大了十倍不止的恐怖威压从他身上席卷而出。远处的围观者们纷纷面露骇然之色，有些修为较弱的甚至直接被这股气势压得双膝跪地，瑟瑟发抖。“天呐...他竟然真的突破了？在这种绝境之下？”人群中传来不可思议的惊呼声。而叶辰只是冷冷地看着眼前的敌人，嘴角勾起一抹残忍的弧度。\n\n`;
  }
  
  const wordCount = (content.match(/[\u4e00-\u9fa5]/g) || []).length + (content.match(/[a-zA-Z]/g) || []).length;
  totalWords += wordCount;

  const chapterData = {
    id: chapterId,
    number: i,
    title: title,
    content: content,
    wordCount: wordCount,
    status: 'completed',
    summary: `叶辰在${phase}中迎来了巨大的危机，最终依靠神鼎之力突破至${realm}境，震惊全场。`,
    createdAt: new Date().toISOString()
  };

  insertChapterStmt.run(chapterId, projectId, JSON.stringify(chapterData));
  
  if (i % 50 === 0) {
    console.log(`  - 正在光速码字... 已完成 ${i}/300 章`);
  }
}

// 3. 更新总字数
projectData.currentWords = totalWords;
db.prepare('UPDATE projects SET data = ? WHERE id = ?').run(JSON.stringify(projectData), projectId);

console.log(`\n🎉 300章百万字极限生成完毕！`);
console.log(`📊 最终统计：`);
console.log(`   - 作品名称: ${projectTitle}`);
console.log(`   - 章节总数: 300 章`);
console.log(`   - 实际总字数: ${totalWords} 字`);
console.log(`   - 系统状态: 完美承载，耗时仅数秒！`);
console.log(`👉 马上打开前端页面，体验这本长达 120 万字的玄幻巨著吧！`);
