// presets.js — 场景任务向导 + 精选技能组合
//
// 场景(写作/表格/网站/文件整理)各自绑一份"精选技能组合",从现有技能库里
// 按分类和关键词打分挑出来 —— 不写死具体 id,快照换了也不会错。
// 每个场景带:示例任务(直接可用的说法)、前置环境检查、经验成本。
'use strict';
const skills = require('./skills');
const envmgr = require('./envmgr');
const cost = require('./cost');
const config = require('./config');

const PRESETS = [
  {
    id: 'writing', title: '写作', icon: '✍️',
    description: '周报、公众号、简历、文案之类的中文写作与改稿',
    categories: ['写作'],
    keywords: ['写作', '文案', '标题', '润色', '改稿', '自媒体', '公众号', '简历'],
    prereq: [],
    examples: ['帮我写一份本周项目周报，突出进展和风险', '把这段工作内容改写成公众号推文，标题要吸引人', '帮我润色这份简历的项目经历'],
  },
  {
    id: 'spreadsheet', title: '表格', icon: '📊',
    description: 'Excel / CSV 数据处理、统计、清洗与公式',
    categories: [],
    keywords: ['表格', 'excel', 'csv', '数据', '统计', '公式', '清洗', 'pandas'],
    prereq: ['python'],
    examples: ['把这个 CSV 按月份汇总销售额并算出环比', '帮我写一段 Python 脚本清洗这份带空值的 Excel', '根据这份数据做一份带图表的月度分析'],
  },
  {
    id: 'website', title: '网站', icon: '🌐',
    description: '网页、前端页面、小工具网站的搭建与部署准备',
    categories: ['编程'],
    keywords: ['网页', '网站', '前端', 'html', 'css', 'javascript', '代码', '开发者', '全栈'],
    prereq: ['git'],
    examples: ['做一个个人主页，包含简介、作品和联系方式', '帮我搭一个待办事项网页，数据存本地', '把这个页面改成手机也能正常显示'],
  },
  {
    id: 'files', title: '文件整理', icon: '📁',
    description: '批量重命名、归档、按内容整理本地文件',
    categories: [],
    keywords: ['文件', '整理', '归档', '重命名', '批量', '文件夹', '目录'],
    prereq: [],
    examples: ['按扩展名把下载文件夹里的文件分类归档', '把这一批照片按拍摄日期重命名', '帮我想一套文件命名规范并生成脚本'],
  },
];

// 打分挑技能:分类命中 +2,关键词命中 +1(标题权重更高)。
function pickSkills(preset, catalog, limit = 8) {
  const kw = preset.keywords.map(k => k.toLowerCase());
  return catalog
    .map((item, index) => {
      const hay = [item.title, item.description, ...(item.tags || [])].join(' ').toLowerCase();
      let score = preset.categories.includes(item.category) ? 2 : 0;
      for (const k of kw) if (hay.includes(k)) score += (String(item.title).toLowerCase().includes(k) ? 2 : 1);
      return { item, score, index };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(x => x.item);
}

function prereqStatus(keys, tools) {
  return keys.map(key => {
    const tool = tools.find(t => t.key === key) || envmgr.detectTool(key);
    return { key, name: tool.name, installed: tool.installed, version: tool.version, why: tool.why, officialPage: tool.officialPage };
  });
}

// 列出所有场景:含示例、精选技能(标记是否已装)、前置检查结果、经验成本。
function list({ home = config.dshHome(), root, tools } = {}) {
  const catalog = skills.catalog(root);
  const resolvedTools = tools || envmgr.list();
  const installed = new Set(skills.list(home, root).filter(i => i.installed).map(i => i.name));
  return PRESETS.map(preset => {
    const picked = pickSkills(preset, catalog);
    const tokens = cost.SCENARIO_TOKENS[preset.id] || cost.SCENARIO_TOKENS.general;
    return {
      id: preset.id, title: preset.title, icon: preset.icon, description: preset.description,
      examples: preset.examples.slice(),
      tokens,
      prereq: prereqStatus(preset.prereq, resolvedTools),
      skills: picked.map(item => ({
        id: item.id, name: item.name, title: item.title, description: item.description,
        category: item.category, installed: installed.has(item.name),
      })),
    };
  });
}

function get(id, opts) {
  const found = list(opts).find(p => p.id === id);
  if (!found) throw new Error('没有这个场景');
  return found;
}

// 精选能力套餐:人工从随包快照里点名的 catalog 真实 id(可能含中文),不再靠关键词打分。
// 这些是"本地随包候选",没有逐条在模型上跑过效果 —— 界面必须如实这么标,不能吹成实测。
const PACKS = [
  {
    id: 'office', title: '办公', icon: '🗂️',
    description: '文档、表格、会议纪要、邮件等日常办公产出',
    dependencies: [],
    examples: ['把这份会议记录整理成带待办的结构化纪要', '根据这列数据生成 Excel 公式并说明用法', '帮我写一封礼貌的催办邮件'],
    skills: ['excel-表格生成器', '技术文档写手', 'transcript_to_notes', '项目经理助手', 'sprint-prioritizer', '邮件营销专家', '正则表达式生成器'],
  },
  {
    id: 'job', title: '求职', icon: '💼',
    description: '简历、面试、求职信与职业规划',
    dependencies: [],
    examples: ['帮我根据这份岗位描述优化简历项目经历', '模拟一场产品经理面试并逐题点评', '写一封针对这个岗位的求职信'],
    skills: ['mian-shi-mo-ni', 'zhi-ye-gu-wen', '简历优化师', 'cover-letter', 'career-coach', 'universal-job-fit-evaluation-prompt', '产品经理助手'],
  },
  {
    id: 'website', title: '网页', icon: '🌐',
    description: '网页、前端页面、小工具站的搭建与优化',
    dependencies: ['git'],
    examples: ['做一个个人主页，含简介、作品和联系方式', '帮我设计这个落地页的排版和配色', '检查这个页面在手机上显示的问题'],
    skills: ['网页设计顾问', 'frontend-developer', 'web-product-architect', 'react-nextjs-frontend-architect', 'seo-优化专家', 'web-typography', 'javascript-控制台'],
  },
];

function resolveSkills(ids, catalog, installed) {
  return ids.map(id => {
    const item = catalog.find(x => x.id === id);
    if (!item) return { id, missing: true };
    return { id: item.id, name: item.name, title: item.title, description: item.description, category: item.category, installed: installed.has(item.name) };
  });
}

// 列出三个能力套餐:选中技能、用途、任务示例、依赖,并明确标注"未做效果实测"。
function listPacks({ home = config.dshHome(), root, tools } = {}) {
  const catalog = skills.catalog(root);
  const resolvedTools = tools || envmgr.list();
  const installed = new Set(skills.list(home, root).filter(i => i.installed).map(i => i.name));
  return PACKS.map(pack => {
    const skills_ = resolveSkills(pack.skills, catalog, installed);
    return {
      id: pack.id, title: pack.title, icon: pack.icon, description: pack.description,
      effectTested: false,
      source: '本地随包候选',
      note: '技能直接从随包快照里点名挑出；只验证了存在与安装，未逐条在模型上验证效果。',
      dependencies: prereqStatus(pack.dependencies || [], resolvedTools),
      examples: pack.examples.slice(),
      skills: skills_,
      missingCount: skills_.filter(s => s.missing).length,
    };
  });
}

module.exports = { list, get, listPacks, pickSkills, PRESETS, PACKS };

if (require.main === module) {
  const assert = require('assert');
  const all = list();
  assert.strictEqual(all.length, 4);
  const ids = all.map(p => p.id);
  assert.deepStrictEqual(ids, ['writing', 'spreadsheet', 'website', 'files']);
  for (const preset of all) {
    assert.ok(preset.skills.length > 0, preset.id + ' 应该能挑到技能');
    assert.ok(preset.skills.length <= 8);
    assert.ok(preset.examples.length > 0);
  }
  assert.ok(all.find(p => p.id === 'website').prereq.some(p => p.key === 'git'));
  assert.ok(all.find(p => p.id === 'spreadsheet').prereq.some(p => p.key === 'python'));
  assert.deepStrictEqual(all.find(p => p.id === 'writing').prereq, []);
  // 能力套餐:ID 必须全部命中真实 catalog,且明确标为未做效果实测
  const packs = listPacks();
  assert.deepStrictEqual(packs.map(p => p.id), ['office', 'job', 'website']);
  for (const pack of packs) {
    assert.strictEqual(pack.missingCount, 0, pack.id + ' 的精选技能必须都在快照里');
    assert.ok(pack.skills.length >= 5 && pack.skills.every(s => s.id && s.title));
    assert.strictEqual(pack.effectTested, false, '不得声称效果实测');
    assert.match(pack.note, /未逐条|候选/);
    assert.ok(pack.examples.length > 0);
  }
  assert.ok(packs.find(p => p.id === 'website').dependencies.some(d => d.key === 'git'));
  console.log('presets.js self-check OK（4 场景 + 办公/求职/网页候选套餐）');
}
