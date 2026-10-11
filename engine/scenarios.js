// scenarios.js — 「任务场景」面板的数据源(装机时烘进浏览器 bundle)
//
// 放在 engine/ 根(与 presets.js 同处):extensions/skill-library/ 声明了
// "type":"module",而本文件只服务装机这一步、不进浏览器,所以留在 CJS 侧。
//
// 四个场景各自带:可理解的结果、需要你提供什么、一份可直接改的短模板。
// 推荐技能**点名到真实目录**:per-scene 列的是 catalog 的 id(人工挑的),装机时
// 解析成真实调用名 name(library-…)+ 标题 —— name 正是 `/name` 通道要用的那一个。
// id 万一在换快照后消失,那条就跳过;全丢光才退回 presets.pickSkills 打分兜底。
'use strict';
const presets = require('./presets');

// 场景模板:标题 + 结果 + 输入 + 可编辑模板。模板要短、能直接改。
const SCENES = [
  {
    key: 'files',
    presetId: 'files',
    skills: ['python-解释器', 'linux-终端模拟器', '正则表达式生成器'],
    title: '整理文件',
    outcome: '把一堆散乱的文件按类型或日期归好类、批量改名,拿到一份可直接执行的整理方案',
    inputs: ['要整理的文件夹路径', '按什么规则整理(类型 / 日期 / 名称)', '是否要批量重命名'],
    template: [
      '帮我整理文件。',
      '文件夹:<把要整理的文件夹路径填这里>',
      '整理规则:按文件类型(图片 / 文档 / 表格 / 压缩包等)分文件夹归档。',
      '重命名:需要(统一成 日期_名称 的形式)/ 不需要',
      '要求:先列出整理方案(建哪些文件夹、每个文件去哪),我确认后再给可执行的脚本;不要删除任何文件。',
    ].join('\n'),
  },
  {
    key: 'spreadsheet',
    presetId: 'spreadsheet',
    skills: ['excel-表格生成器', 'base-r', 'missing-values-handler', '财务分析师'],
    title: '处理表格',
    outcome: '从一份表格里得到清洗后的数据、汇总结果或一段能直接用的公式/脚本',
    inputs: ['表格文件路径,或直接粘贴数据', '要算的指标(汇总 / 对比 / 环比…)', '输出成什么样(表格 / 说明 / 图表)'],
    template: [
      '帮我处理表格。',
      '数据:<粘贴数据,或写清 CSV / Excel 的文件路径>',
      '要做的处理:<例如 按月份汇总销售额并算出环比>',
      '输出:先给出结果表格,再说明用了哪些步骤,方便我复核。',
      '要求:动手前先确认每一列是什么含义;数值计算要能复现。',
    ].join('\n'),
  },
  {
    key: 'writing',
    presetId: 'writing',
    skills: ['biao-ti-sheng-cheng', '校对润色', '技术文档写手', '项目经理助手'],
    title: '写材料',
    outcome: '一份能直接交出去的文稿(周报 / 推文 / 邮件…),并附上可改的修改建议',
    inputs: ['材料类型和用途', '给谁看(受众)', '要写进去的要点 / 素材', '大概多少字'],
    template: [
      '帮我写一份材料。',
      '类型与用途:<例如 本周项目周报,发给直属领导>',
      '受众:<例如 非技术背景的管理者>',
      '要点:<把要写进去的事实 / 数据 / 进展列在这里>',
      '篇幅:<例如 500 字以内>',
      '要求:先给一版正文,再单独列出可以再强化的地方;不要编造我没提供的数据。',
    ].join('\n'),
  },
  {
    key: 'website',
    presetId: 'website',
    skills: ['网页设计顾问', 'frontend-developer', 'web-typography', 'seo-优化专家'],
    title: '做网页',
    outcome: '一个用浏览器打开就能用的网页(单文件 HTML),附带怎么继续改的说明',
    inputs: ['网页的用途', '要展示的内容(文字 / 图片 / 数据)', '风格偏好(简洁 / 商务 / 活泼…)'],
    template: [
      '帮我做一个网页。',
      '用途:<例如 个人主页,展示简介、作品和联系方式>',
      '内容:<把要展示的文字 / 图片 / 数据列在这里>',
      '风格:<例如 简洁,黑白灰为主>',
      '要求:产出单个 HTML 文件,双击就能打开;同时说明我想改颜色或文字时该动哪一段。',
    ].join('\n'),
  },
];

// 推荐技能:解析点名 id → 真实目录条目;全丢光时才用关键词打分兜底。
function recommend(scene, catalog, limit) {
  const byId = new Map(catalog.map((item) => [item.id, item]));
  const picked = scene.skills.map((id) => byId.get(id)).filter(Boolean);
  const chosen = picked.length ? picked : presets.pickSkills(
    presets.PRESETS.find((p) => p.id === scene.presetId) || { categories: [], keywords: [] },
    catalog, limit,
  );
  return chosen.slice(0, limit).map((item) => ({ name: item.name, title: item.title, category: item.category }));
}

function build(catalog, { limit = 4 } = {}) {
  return SCENES.map((scene) => ({
    key: scene.key,
    title: scene.title,
    outcome: scene.outcome,
    inputs: scene.inputs.slice(),
    template: scene.template,
    skills: recommend(scene, catalog, limit),
  }));
}

module.exports = { SCENES, build };

if (require.main === module) {
  const assert = require('assert');
  const path = require('path');
  const catalog = require(path.join(__dirname, '..', 'app', 'skill-library', 'catalog.json'));
  const scenes = build(catalog);
  assert.deepStrictEqual(scenes.map((s) => s.key), ['files', 'spreadsheet', 'writing', 'website']);
  const names = new Set(catalog.map((i) => i.name));
  for (const scene of scenes) {
    assert.ok(scene.title && scene.outcome && scene.inputs.length && scene.template.length > 40, scene.key + ' 字段不全');
    assert.ok(scene.skills.length > 0, scene.key + ' 应能挑到推荐技能');
    for (const s of scene.skills) {
      assert.ok(names.has(s.name), scene.key + ' 推荐技能必须是目录里的真实 name:' + s.name);
      assert.match(s.name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
      assert.ok(s.title, '推荐技能要有中文标题');
    }
  }
  console.log('scenarios.js self-check OK（4 场景,推荐技能全部命中真实目录)');
}
