// cost.js — 成本估算:预估 vs 手动用量,用户自己填单价,预算提醒
//
// ⚠️ 本工具**不**读取 DeepSeek 账户账单,也**不**声称知道真实扣费。
//   · 预估 = 按场景的经验 token 数 × **你填的**单价,纯本地计算
//   · 手动用量 = 你自己记录的 token 数 × 你填的单价(是"估算",不是账单)
// 两者在界面上**分开显示**,永远不混成一个数字。
//
// ⚠️ 不带任何内置价目表:单价没填就是"未配置",估算直接标为不可用,
//   绝不拿某个模型的过时价格去套别的模型(包括未知模型)。
'use strict';
const crypto = require('crypto');
const store = require('./store');

const CONFIG = 'cost-config';
const USAGE = 'cost-usage';
const ESTIMATES = 'cost-estimates';
const MAX_ENTRIES = 2000;

// 场景的经验 token 量(用于"预估",粗粒度,仅供参考)。
const SCENARIO_TOKENS = {
  writing: { tokensIn: 800, tokensOut: 1600 },
  spreadsheet: { tokensIn: 600, tokensOut: 900 },
  website: { tokensIn: 1200, tokensOut: 3000 },
  files: { tokensIn: 500, tokensOut: 700 },
  general: { tokensIn: 800, tokensOut: 1200 },
};

function defaultConfig() {
  // 默认**没有任何单价**。价格由用户按官网自行填写。
  return { currency: 'CNY', monthlyBudget: 0, rates: {}, priceConfigured: false };
}
function getConfig() {
  const stored = store.read(CONFIG, null);
  const base = defaultConfig();
  if (!stored || typeof stored !== 'object') return base;
  const rates = sanitizeRates(stored.rates, {});
  return {
    currency: typeof stored.currency === 'string' ? stored.currency : base.currency,
    monthlyBudget: Number.isFinite(stored.monthlyBudget) && stored.monthlyBudget >= 0 ? stored.monthlyBudget : 0,
    rates,
    priceConfigured: Object.keys(rates).length > 0,
  };
}
function sanitizeRates(input, fallback) {
  if (!input || typeof input !== 'object') return { ...fallback };
  const out = {};
  for (const [model, rate] of Object.entries(input)) {
    if (!/^[a-z0-9._-]{1,60}$/i.test(model)) continue;
    const inPerM = Number(rate && rate.inPerM), outPerM = Number(rate && rate.outPerM);
    if (!Number.isFinite(inPerM) || !Number.isFinite(outPerM) || inPerM < 0 || outPerM < 0) continue;
    out[model] = { inPerM, outPerM };
  }
  return out;
}

function setConfig(input = {}) {
  const current = getConfig();
  const next = { ...current };
  if (input.currency !== undefined) {
    if (typeof input.currency !== 'string' || !/^[A-Z]{3}$/.test(input.currency)) throw new Error('货币代码不正确');
    next.currency = input.currency;
  }
  if (input.monthlyBudget !== undefined) {
    const b = Number(input.monthlyBudget);
    if (!Number.isFinite(b) || b < 0) throw new Error('预算金额不正确');
    next.monthlyBudget = b;
  }
  if (input.rates !== undefined) {
    next.rates = sanitizeRates(input.rates, {});
    next.priceConfigured = Object.keys(next.rates).length > 0;
  }
  store.write(CONFIG, next);
  return next;
}

// 单价:**没有就是没有**,不回落到别的模型,也不回落到任何内置价。
function rateFor(model, rates) { return (rates && rates[model]) || null; }
function costOf(tokensIn, tokensOut, model, config) {
  const rate = rateFor(model, config.rates);
  if (!rate) return null; // 未配置单价 → 成本不可知
  return (tokensIn / 1e6) * rate.inPerM + (tokensOut / 1e6) * rate.outPerM;
}
function monthOf(ts) { return new Date(ts).toISOString().slice(0, 7); }

// 预估:按场景经验值 × 单价。单价缺失时 cost 记 null,不猜。
function estimate(input = {}) {
  const config = getConfig();
  const scenario = SCENARIO_TOKENS[input.scenario] ? input.scenario : 'general';
  const base = SCENARIO_TOKENS[scenario];
  const tokensIn = Number.isFinite(input.tokensIn) && input.tokensIn >= 0 ? Math.round(input.tokensIn) : base.tokensIn;
  const tokensOut = Number.isFinite(input.tokensOut) && input.tokensOut >= 0 ? Math.round(input.tokensOut) : base.tokensOut;
  const model = typeof input.model === 'string' && input.model ? input.model : 'deepseek-chat';
  const cost = costOf(tokensIn, tokensOut, model, config);
  const entry = { id: crypto.randomBytes(4).toString('hex'), ts: Date.now(), scenario, model, tokensIn, tokensOut, cost, priced: cost !== null, currency: config.currency, kind: 'estimate' };
  store.write(ESTIMATES, [entry, ...store.read(ESTIMATES, [])].slice(0, MAX_ENTRIES));
  return entry;
}

// 手动用量:用户自己填的 token 数,按单价折算 —— 是估算,不是账单。
function record(input = {}) {
  const config = getConfig();
  const model = typeof input.model === 'string' && input.model ? input.model : 'deepseek-chat';
  const tokensIn = Number.isFinite(input.tokensIn) && input.tokensIn >= 0 ? Math.round(input.tokensIn) : 0;
  const tokensOut = Number.isFinite(input.tokensOut) && input.tokensOut >= 0 ? Math.round(input.tokensOut) : 0;
  if (!tokensIn && !tokensOut) throw new Error('请填写手动记录的 token 用量');
  const scenario = SCENARIO_TOKENS[input.scenario] ? input.scenario : 'general';
  const note = typeof input.note === 'string' ? input.note.trim().slice(0, 200) : '';
  const cost = costOf(tokensIn, tokensOut, model, config);
  const entry = { id: crypto.randomBytes(4).toString('hex'), ts: Date.now(), scenario, model, tokensIn, tokensOut, cost, priced: cost !== null, currency: config.currency, note, kind: 'manual' };
  store.write(USAGE, [entry, ...store.read(USAGE, [])].slice(0, MAX_ENTRIES));
  return entry;
}

// 汇总:预估与手动用量**分别**统计;只累加"有单价"的条目,并如实报告未定价条数。
function summary(input = {}) {
  const config = getConfig();
  const month = /^\d{4}-\d{2}$/.test(input.month || '') ? input.month : monthOf(Date.now());
  const inMonth = (arr) => arr.filter(e => monthOf(e.ts) === month);
  const estimates = inMonth(store.read(ESTIMATES, []));
  const manual = inMonth(store.read(USAGE, []));
  const sumPriced = (arr) => arr.filter(e => typeof e.cost === 'number').reduce((s, e) => s + e.cost, 0);
  const unpriced = (arr) => arr.filter(e => typeof e.cost !== 'number').length;
  // 没有配置单价时,金额一律标为不可用(null),不拿历史条目凑出一个金额。
  const estimateTotal = config.priceConfigured ? round(sumPriced(estimates)) : null;
  const manualTotal = config.priceConfigured ? round(sumPriced(manual)) : null;
  const remaining = config.monthlyBudget > 0 && config.priceConfigured ? round(config.monthlyBudget - manualTotal) : null;
  let alert = 'none';
  if (config.monthlyBudget > 0 && config.priceConfigured) {
    if (manualTotal >= config.monthlyBudget) alert = 'over';
    else if (manualTotal >= config.monthlyBudget * 0.8) alert = 'warn';
  }
  const unpricedCount = unpriced(estimates) + unpriced(manual);
  return {
    month, currency: config.currency, monthlyBudget: config.monthlyBudget,
    priceConfigured: config.priceConfigured, rates: config.rates,
    estimateTotal, manualTotal, remaining, alert,
    estimateCount: estimates.length, manualCount: manual.length,
    unpricedCount,
    usageSource: 'unavailable',
    note: config.priceConfigured
      ? '均为本地按你填的单价折算的估算值,不是账户账单;本工具不接入实际用量。'
      : '还没有填写单价,估算不可用;本工具不接入实际用量,也无法给出真实扣费。',
  };
}

function history(limit = 50) {
  const n = Math.min(Math.max(Number(limit) || 50, 1), 200);
  return store.read(USAGE, []).slice(0, n).map(e => ({ ...e, kind: 'manual' }));
}
function round(x) { return Math.round(x * 1e6) / 1e6; }

module.exports = { getConfig, setConfig, estimate, record, summary, history, SCENARIO_TOKENS };

if (require.main === module) {
  const assert = require('assert');
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const old = process.env.AI_SETUP_WORK;
  process.env.AI_SETUP_WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'cost-'));
  try {
    // 默认无单价:估算不可用,绝不猜价
    assert.strictEqual(getConfig().priceConfigured, false);
    assert.strictEqual(getConfig().monthlyBudget, 0);
    const e0 = estimate({ scenario: 'website' });
    assert.strictEqual(e0.cost, null, '没填单价时预估成本必须为空');
    assert.strictEqual(e0.priced, false);
    // 未知模型不回落
    assert.strictEqual(estimate({ model: 'some-unknown-model' }).cost, null, '未知模型不能按别的价算');
    // 用户填单价后才有数字
    setConfig({ rates: { 'deepseek-chat': { inPerM: 2, outPerM: 8 } } });
    assert.strictEqual(getConfig().priceConfigured, true);
    const e = estimate({ scenario: 'website' });
    assert.strictEqual(e.tokensOut, SCENARIO_TOKENS.website.tokensOut);
    assert.ok(e.cost > 0, '填了单价后才算成本');
    assert.strictEqual(estimate({ model: 'other-model' }).cost, null, '未定价的模型仍为空');
    const u = record({ tokensIn: 1e6, tokensOut: 0, model: 'deepseek-chat' });
    assert.strictEqual(u.cost, 2, '百万输入 token × 2 元 = 2');
    assert.strictEqual(u.kind, 'manual');
    const s = summary();
    assert.ok(s.estimateTotal > 0 && s.manualTotal === 2, '预估与手动用量分开统计');
    assert.strictEqual(s.usageSource, 'unavailable', '没有真实用量来源要如实标注');
    setConfig({ monthlyBudget: 2 });
    assert.strictEqual(summary().alert, 'over', '达到预算要报 over');
    setConfig({ monthlyBudget: 10 });
    assert.strictEqual(summary().alert, 'none');
    setConfig({ monthlyBudget: 2.4 });
    assert.strictEqual(summary().alert, 'warn', '达到 80% 要报 warn');
    assert.throws(() => record({}), /token/);
    console.log('cost.js self-check OK（无内置价/未知模型不回落/手动用量估算）');
  } finally {
    fs.rmSync(process.env.AI_SETUP_WORK, { recursive: true, force: true });
    if (old === undefined) delete process.env.AI_SETUP_WORK; else process.env.AI_SETUP_WORK = old;
  }
}
