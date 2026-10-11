// harness.js — 与 AI 助手的交接(handoff)
//
// ⚠️ 我们不"替用户执行任务",也不假装执行了。
//   AI 助手是独立程序,这里只做两件**真实**的事:
//     1) 把任务整理成一段可直接粘贴的提示词
//     2) 复制到剪贴板 / 打开助手页面,由用户自己去发
//   界面上必须说清"已复制,去助手粘贴",绝不显示"任务已完成"。
'use strict';
const tasks = require('./tasks');

const SCENARIO_LABELS = { writing: '写作', spreadsheet: '表格', website: '网站', files: '文件整理', general: '通用' };

function build(input = {}) {
  const title = String(input.title || '未命名任务').trim().slice(0, 200);
  const goal = String(input.prompt || '').trim();
  if (!goal) throw new Error('任务目标不能为空');
  const scenario = SCENARIO_LABELS[input.scenario] ? input.scenario : 'general';
  const skillNames = Array.isArray(input.skillNames) ? input.skillNames.filter(n => typeof n === 'string').slice(0, 20) : [];
  const lines = [
    '请帮我完成下面的任务。',
    '场景：' + SCENARIO_LABELS[scenario],
    '目标：' + goal,
  ];
  if (skillNames.length) lines.push('可优先使用的技能：' + skillNames.join('、') + '（若已安装到助手中）');
  lines.push('请先说明你的思路，再给出结果。');
  return { title, scenario, prompt: lines.join('\n'), skillNames };
}

// 按任务编号或临时任务构造提示词。
function fromTask(input = {}) {
  if (input.taskId) {
    const task = tasks.list().find(t => t.id === input.taskId);
    if (!task) throw new Error('找不到这个已保存任务');
    return build({ ...task, skillNames: input.skillNames });
  }
  return build(input);
}

// 复制到剪贴板 —— 真实动作,失败就报错,不谎报成功。
async function copy(input, { clipboard } = {}) {
  const payload = fromTask(input);
  if (!clipboard || typeof clipboard.writeText !== 'function') throw new Error('请在安装版中使用（需要系统剪贴板）');
  clipboard.writeText(payload.prompt);
  return { ok: true, copied: true, prompt: payload.prompt, honesty: '已复制提示词；请在与风AI助手中粘贴并发送，工具不会代你执行任务。' };
}

module.exports = { build, fromTask, copy, SCENARIO_LABELS };

if (require.main === module) {
  const assert = require('assert');
  (async () => {
    const p = build({ title: '周报', scenario: 'writing', prompt: '帮我写周报', skillNames: ['标题生成器'] });
    assert.match(p.prompt, /场景：写作/);
    assert.match(p.prompt, /目标：帮我写周报/);
    assert.match(p.prompt, /标题生成器/);
    assert.throws(() => build({ prompt: '' }), /不能为空/);
    let wrote = null;
    const r = await copy({ title: 'x', prompt: 'y' }, { clipboard: { writeText: t => { wrote = t; } } });
    assert.strictEqual(r.copied, true);
    assert.match(r.honesty, /不会代你执行任务/);
    assert.strictEqual(wrote, r.prompt);
    await assert.rejects(copy({ prompt: 'y' }, {}), /安装版/);
    console.log('harness.js self-check OK');
  })().catch(e => { console.error(e); process.exit(1); });
}
