// client.source.js — 技能库扩展的浏览器端**模板**,不是最终产物。
// 装机时 engine/extension.js 会把下面三处占位替换掉,生成 lib/client.js:
//   一行 tokens 占位    ← tokens.fragment.js 的原文(选择模型只此一份)
//   一行 catalog 占位   ← 随包 538 条目录(name/title/category/…)
//   一行 scenarios 占位 ← engine/scenarios.js 的 build() 结果(4 个任务场景)
// 注意:占位符的**字面量**只允许出现在下方真正要替换的那几行,别写进注释。
//
// 形态照抄随包客户端插件:window.__ModuleLoader__.load({id, factory}) 只做注册,
// 真正的模块体在 factory 内,materialize 时才跑。
//
// 样式策略:纯 CSS 类(前缀 aiskill-)+ Harness 主题语义 token(--dsw-alias-*)。
// token 本身随明暗主题翻转,所以不必写 dark-mode 分支;两处占位的同行约束不适用于
// CSS 字符串(它不含占位字面量)。见 docs/harness-ui-design.md。
window.__ModuleLoader__.load({
	id: "@ai-setup/dsh-client-ui-skill-library",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const react = require("react");
		const h = react.createElement;

		/*__SKILL_LIBRARY_TOKENS__*/

		const CATALOG = /*__SKILL_LIBRARY_CATALOG__*/[];
		const SCENARIOS = /*__SKILL_LIBRARY_SCENARIOS__*/[];
		const BY_NAME = new Map(CATALOG.map((item) => [item.name, item]));
		const CATEGORIES = [...new Set(CATALOG.map((item) => item.category).filter(Boolean))];
		const COUNT_BY_CATEGORY = CATALOG.reduce((acc, item) => {
			if (item.category) acc[item.category] = (acc[item.category] || 0) + 1;
			return acc;
		}, {});

		const ID = "@ai-setup/dsh-client-ui-skill-library";
		const KIND = "skill-library";
		const NS = "skillLibrary";
		// 场景页是 root 作用域的全局面板:key = 侧栏 panellist 行 id = layout.selectPanel 的入参。
		const PANEL_ID = "task-scenes";
		// 开发者联系方式与开源地址。微信点一下复制,邮箱是 mailto 链接(另给复制按钮)。
		const WECHAT = "xxx890332";
		const EMAIL = "chenyangxu442@gmail.com";
		const GITHUB = "https://github.com/chenyangxu442-ai/yufeng-ai-assistant";

		const ZH = {
			"entry.title": "技能库",
			"entry.hint": "浏览本地技能,选中后写入当前会话",
			"header.count": "{n} 个技能",
			"header.purpose": "仅用于下一条消息",
			"search.placeholder": "搜索技能…",
			"search.label": "搜索技能",
			"filter.label": "按类别筛选",
			"filter.all": "全部类别",
			"filter.result": "显示 {n} 个",
			"row.inDraft": "已在草稿",
			"action.add": "写入当前对话",
			"action.busy": "写入中…",
			"action.clear": "清空选择",
			"empty": "没有匹配的技能",
			"empty.hint": "换个关键词,或把类别切回「全部类别」",
			"selected": "已选",
			"chip.remove": "从本条消息移除",
			"scenes.title": "任务场景",
			"scenes.lead": "先挑一个场景,再把它写进当前对话的输入框 —— 你还能接着改。",
			"scenes.inputs": "需要你提供",
			"scenes.template": "任务模板(可直接改)",
			"scenes.skills": "推荐技能(可选,默认不启用)",
			"scenes.use": "写入当前对话并返回",
			"scenes.noSession.title": "还没有打开的对话",
			"scenes.noSession.hint": "先开一个会话,再回来挑场景;模板会写进它的输入框。",
			"scenes.noSession.action": "开始新会话",
			"scenes.appendNote": "会接在你已有内容后面,不会覆盖。",
			"contact.title": "联系开发者",
			"contact.hint": "有疑问或问题,欢迎联系开发者",
			"contact.who": "联系开发者",
			"contact.wechat": "微信",
			"contact.copy": "复制",
			"contact.copied": "已复制",
			"contact.send": "发邮件",
			"contact.copyMail": "复制邮箱",
			"contact.lead": "开源项目，欢迎交流。有疑问请联系，有问题欢迎反馈。",
			"contact.open": "查看"
		};
		const EN = {
			"entry.title": "Skill library",
			"entry.hint": "Browse local skills and stage them into this chat",
			"header.count": "{n} skills",
			"header.purpose": "Applies to the next message only",
			"search.placeholder": "Search skills…",
			"search.label": "Search skills",
			"filter.label": "Filter by category",
			"filter.all": "All categories",
			"filter.result": "{n} shown",
			"row.inDraft": "in draft",
			"action.add": "Add to message",
			"action.busy": "Adding…",
			"action.clear": "Clear",
			"empty": "No matching skills",
			"empty.hint": "Try another keyword, or switch the category back to All",
			"selected": "Selected",
			"chip.remove": "Remove from this message",
			"scenes.title": "Task scenarios",
			"scenes.lead": "Pick a scenario, then write it into this chat's input — you can still edit it.",
			"scenes.inputs": "What you provide",
			"scenes.template": "Task template (editable)",
			"scenes.skills": "Suggested skills (optional, off by default)",
			"scenes.use": "Write to chat and return",
			"scenes.noSession.title": "No chat is open yet",
			"scenes.noSession.hint": "Start a session, then come back and pick a scenario — its template goes into that input.",
			"scenes.noSession.action": "Start a new session",
			"scenes.appendNote": "Appended after your existing text; nothing is overwritten.",
			"contact.title": "Contact",
			"contact.hint": "Questions or issues? Contact the developer",
			"contact.who": "Contact the developer",
			"contact.wechat": "WeChat",
			"contact.copy": "copy",
			"contact.copied": "copied",
			"contact.send": "send email",
			"contact.copyMail": "copy email",
			"contact.lead": "Open source — questions and feedback welcome.",
			"contact.open": "view"
		};

		/** 文案插值:{n} → 数字。 */
		function fmt(text, n) {
			return String(text).replace("{n}", String(n));
		}

		/** 中国名字:文案来自随包目录,目录没收录就退回 slug。 */
		function titleOf(slug) {
			const item = BY_NAME.get(slug);
			return item ? item.title : slug;
		}

		/** 会话是否绑定了输入面(读草稿/写草稿都走它)。 */
		function readDraft(props) {
			try {
				return props.useInput((state) => state.draft) || "";
			} catch (e) {
				return "";
			}
		}

		// ── 样式:一次性注入一个 <style>,类名全部挂在 aiskill- 前缀下。 ──────────
		// 只用 Harness 主题语义 token(--dsw-alias-*),且每个都带浅色兜底值:
		// token 缺失时仍是可读的中性灰,存在时随明暗主题自动翻转。
		const STYLE_ID = "aiskill-skill-library-styles";
		const CSS = `
/* 语义 token 只声明一次,面板(窄栏)和场景页(整列)共用。 */
.aiskill-panel,.aiskill-scenes,.aiskill-contact{
  --aiskill-fg:var(--dsw-alias-label-primary,#0f1115);
  --aiskill-fg-2:var(--dsw-alias-label-secondary,#61666b);
  --aiskill-fg-3:var(--dsw-alias-label-tertiary,#81858c);
  --aiskill-fg-dim:var(--dsw-alias-label-dimmed,#a0a4aa);
  --aiskill-line:var(--dsw-alias-border-l1,rgba(15,17,21,.07));
  --aiskill-line-2:var(--dsw-alias-border-l2,rgba(15,17,21,.12));
  --aiskill-line-3:var(--dsw-alias-border-l3,rgba(15,17,21,.18));
  --aiskill-hover:var(--dsw-alias-interactive-bg-hover,rgba(15,17,21,.05));
  --aiskill-active:var(--dsw-alias-interactive-bg-active,rgba(15,17,21,.09));
  --aiskill-strong:var(--dsw-alias-button-primary-fill,#0f1115);
  --aiskill-on-strong:var(--dsw-alias-label-primary-inverted,#ffffff);
  --aiskill-ring:var(--dsw-alias-brand-primary,#0f1115);
  --aiskill-danger:var(--dsw-alias-state-error-primary,#c0392b);
}
.aiskill-panel{
  container-type:inline-size;
  display:flex;flex-direction:column;height:100%;min-height:0;
  padding:16px 16px 12px;box-sizing:border-box;
  color:var(--aiskill-fg);
  font-size:14px;line-height:1.5;
}

/* 紧凑头部:一行 = 技能总数 + 用途(标签页已写着「技能库」,这里不重复) */
.aiskill-head{display:flex;align-items:center;gap:6px;padding:0 2px 14px;font-size:12px;color:var(--aiskill-fg-3)}
.aiskill-count{color:var(--aiskill-fg-2);font-variant-numeric:tabular-nums}
.aiskill-sep{color:var(--aiskill-fg-dim)}

/* 搜索:图标 + 无边框输入,焦点时整条描边 */
.aiskill-search{position:relative;display:flex;align-items:center;margin:0 0 10px}
.aiskill-searchicon{position:absolute;left:10px;display:grid;place-items:center;color:var(--aiskill-fg-3);pointer-events:none}
.aiskill-input{
  width:100%;height:32px;padding:0 10px 0 32px;box-sizing:border-box;
  border:1px solid var(--aiskill-line-2);border-radius:8px;
  background:transparent;color:inherit;font:inherit;font-size:13px;
  transition:border-color .15s ease,box-shadow .15s ease;
}
.aiskill-input::placeholder{color:var(--aiskill-fg-dim)}
.aiskill-input:hover{border-color:var(--aiskill-line-3)}
.aiskill-input:focus{outline:none;border-color:var(--aiskill-ring);box-shadow:0 0 0 2px color-mix(in srgb,var(--aiskill-ring) 22%,transparent)}

/* 筛选行:一个下拉 + 结果计数 */
.aiskill-filters{display:flex;align-items:center;gap:10px;padding:0 2px 10px}
.aiskill-select{
  flex:1;min-width:0;height:32px;padding:0 8px;box-sizing:border-box;
  border:1px solid var(--aiskill-line-2);border-radius:8px;
  background:transparent;color:inherit;font:inherit;font-size:13px;cursor:pointer;
  transition:border-color .15s ease,box-shadow .15s ease;
}
.aiskill-select:hover{border-color:var(--aiskill-line-3)}
.aiskill-select:focus{outline:none;border-color:var(--aiskill-ring);box-shadow:0 0 0 2px color-mix(in srgb,var(--aiskill-ring) 22%,transparent)}
.aiskill-result{flex:none;font-size:12px;color:var(--aiskill-fg-3);font-variant-numeric:tabular-nums}

/* 列表:编辑式行 + 软分隔线,不套外框 */
.aiskill-list{flex:1;min-height:0;overflow:auto;border-top:1px solid var(--aiskill-line);margin:0 -4px}
.aiskill-row{
  display:flex;gap:10px;align-items:flex-start;padding:10px 8px;
  border-radius:6px;cursor:pointer;
  transition:background-color .12s ease;
}
.aiskill-row+.aiskill-row{border-top:1px solid var(--aiskill-line)}
.aiskill-row:hover{background:var(--aiskill-hover)}
.aiskill-row.is-in-draft{cursor:default}
.aiskill-row.is-in-draft .aiskill-rowtitle{color:var(--aiskill-fg-2)}
.aiskill-check{
  flex:none;width:16px;height:16px;margin:2px 0 0;
  accent-color:var(--aiskill-strong);cursor:pointer;
}
.aiskill-check:disabled{cursor:default}
.aiskill-check:focus-visible{outline:2px solid var(--aiskill-ring);outline-offset:2px;border-radius:3px}
.aiskill-body{display:flex;flex-direction:column;gap:1px;min-width:0}
.aiskill-rowtitle{font-size:14px;font-weight:600;color:var(--aiskill-fg);line-height:1.35}
.aiskill-rowmeta{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--aiskill-fg-3)}
.aiskill-tag{
  padding:0 6px;border-radius:999px;line-height:16px;
  background:var(--aiskill-active);color:var(--aiskill-fg-2);
}
.aiskill-rowdesc{
  font-size:13px;color:var(--aiskill-fg-2);line-height:1.45;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
}

/* 空 / 加载 */
.aiskill-empty{display:flex;flex-direction:column;align-items:center;gap:6px;padding:40px 16px;text-align:center}
.aiskill-empty-icon{color:var(--aiskill-fg-dim)}
.aiskill-empty-title{font-size:13px;color:var(--aiskill-fg-2)}
.aiskill-empty-hint{font-size:12px;color:var(--aiskill-fg-3)}
.aiskill-ghostrow{height:44px;margin:8px;border-radius:6px;background:var(--aiskill-hover);opacity:.55}
.aiskill-ghostrow+.aiskill-ghostrow{margin-top:0}

/* 固定页脚:始终可见 */
.aiskill-foot{display:flex;align-items:center;gap:8px;padding:12px 2px 0;margin-top:12px;border-top:1px solid var(--aiskill-line)}
.aiskill-primary,.aiskill-ghost{
  height:34px;padding:0 14px;border-radius:8px;font:inherit;font-size:13px;font-weight:500;
  cursor:pointer;white-space:nowrap;transition:background-color .12s ease,border-color .12s ease,opacity .12s ease;
}
.aiskill-primary{flex:1;min-width:0;border:1px solid transparent;background:var(--aiskill-strong);color:var(--aiskill-on-strong)}
.aiskill-primary:hover:not(:disabled){opacity:.88}
.aiskill-ghost{border:1px solid var(--aiskill-line-2);background:transparent;color:var(--aiskill-fg-2)}
.aiskill-ghost:hover:not(:disabled){background:var(--aiskill-hover);color:var(--aiskill-fg)}
.aiskill-primary:disabled,.aiskill-ghost:disabled{opacity:.42;cursor:default}
.aiskill-primary:focus-visible,.aiskill-ghost:focus-visible{outline:2px solid var(--aiskill-ring);outline-offset:2px}

/* 芯片轨:作曲器上方 */
.aiskill-chips{display:flex;flex-wrap:wrap;gap:6px;padding:4px 2px}
.aiskill-chip{
  display:inline-flex;align-items:center;gap:2px;height:26px;padding:0 2px 0 10px;
  border-radius:999px;border:1px solid var(--aiskill-line-2);
  background:var(--aiskill-active);color:var(--aiskill-fg);
  font-size:12px;font-weight:500;line-height:1;max-width:100%;
}
.aiskill-chip-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aiskill-chip-x{
  flex:none;width:20px;height:20px;display:grid;place-items:center;padding:0;
  border:none;border-radius:999px;background:transparent;color:var(--aiskill-fg-3);
  cursor:pointer;transition:background-color .12s ease,color .12s ease;
}
.aiskill-chip-x:hover{background:var(--aiskill-hover);color:var(--aiskill-fg)}
.aiskill-chip-x:focus-visible{outline:2px solid var(--aiskill-ring);outline-offset:1px}

/* 侧栏入口 */
.aiskill-launcher{
  display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;
  border:none;border-radius:6px;background:transparent;color:inherit;
  cursor:pointer;text-align:left;font:inherit;
  transition:background-color .12s ease;
}
.aiskill-launcher:hover{background:var(--aiskill-hover)}
.aiskill-launcher:focus-visible{outline:2px solid var(--aiskill-ring);outline-offset:-2px}
.aiskill-launcher-icon{flex:none;display:grid;place-items:center;color:var(--aiskill-fg-3)}

/* 侧栏导航图标(panellist 行里只画一个 glyph,靠 sidebar 自己的行样式) */
.aiskill-navglyph{display:block;color:inherit}

/* 开发者联系入口:页脚一行,点开在本地收紧展开 —— 不弹层、不遮聊天 */
.aiskill-contact{display:flex;flex-direction:column}
.aiskill-contact-lead{padding:6px 10px 2px;font-size:11px;line-height:1.5;color:var(--aiskill-fg-3)}
.aiskill-contact-pop{display:flex;flex-direction:column;gap:1px;margin:2px 2px 4px;padding:8px 10px;border:1px solid var(--aiskill-line-2);border-radius:8px;background:var(--aiskill-active)}
.aiskill-contact-who{font-size:11px;font-weight:600;color:var(--aiskill-fg-2);margin-bottom:2px}
.aiskill-contact-row{display:flex;align-items:center;gap:8px;width:100%;padding:3px 0;border:none;background:transparent;font:inherit;font-size:12px;color:var(--aiskill-fg-2);text-decoration:none;cursor:pointer;text-align:left}
.aiskill-contact-row:hover{color:var(--aiskill-fg)}
.aiskill-contact-value{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aiskill-contact-action{margin-left:auto;flex:none;font-size:11px;color:var(--aiskill-fg-3)}
.aiskill-contact-row:hover .aiskill-contact-action{color:var(--aiskill-fg-2)}
.aiskill-contact-mail{margin:4px 0 0;padding:0;border:none;background:transparent;font:inherit;font-size:11px;color:var(--aiskill-fg-3);cursor:pointer;align-self:flex-start}
.aiskill-contact-mail:hover{color:var(--aiskill-fg-2);text-decoration:underline}

/* ── 任务场景主面板(整列宽)────────────────────────────────────────────── */
.aiskill-scenes{display:flex;flex-direction:column;height:100%;min-height:0;overflow:auto;
  container-type:inline-size;
  padding:20px 24px 28px;box-sizing:border-box;color:var(--aiskill-fg);
  font-size:14px;line-height:1.5;}
.aiskill-scenes-inner{width:100%;max-width:760px;margin:0 auto;display:flex;flex-direction:column;min-height:0}
.aiskill-scenes-head{padding-bottom:14px}
.aiskill-scenes-title{font-size:16px;font-weight:600;line-height:1.35}
.aiskill-scenes-lead{margin-top:4px;font-size:13px;color:var(--aiskill-fg-2)}
.aiskill-scenes-rule{height:1px;background:var(--aiskill-line);margin:0 0 4px}

/* 场景行:编辑式两段 + 软分隔,不套卡片框 */
.aiskill-scene{border-top:1px solid var(--aiskill-line)}
.aiskill-scene:first-of-type{border-top:none}
.aiskill-scene-head{display:flex;gap:12px;align-items:flex-start;width:100%;
  padding:14px 6px;border:none;background:transparent;color:inherit;
  cursor:pointer;text-align:left;font:inherit;transition:background-color .12s ease}
.aiskill-scene-head:hover{background:var(--aiskill-hover)}
.aiskill-scene-head:focus-visible{outline:2px solid var(--aiskill-ring);outline-offset:-2px;border-radius:6px}
.aiskill-scene.is-open .aiskill-scene-head{background:var(--aiskill-active)}
.aiskill-scene-glyph{flex:none;margin-top:1px;color:var(--aiskill-fg-3)}
.aiskill-scene.is-open .aiskill-scene-glyph{color:var(--aiskill-fg)}
.aiskill-scene-body{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}
.aiskill-scene-name{font-size:14px;font-weight:600;line-height:1.35}
.aiskill-scene-outcome{font-size:13px;color:var(--aiskill-fg-2);line-height:1.45}
.aiskill-scene-needs{font-size:11px;color:var(--aiskill-fg-3);line-height:1.5;margin-top:1px}
.aiskill-scene-caret{flex:none;margin-top:2px;color:var(--aiskill-fg-3);transition:transform .16s ease}
.aiskill-scene.is-open .aiskill-scene-caret{transform:rotate(90deg)}

.aiskill-scene-detail{padding:2px 6px 18px}
.aiskill-scene-fieldlabel{font-size:11px;color:var(--aiskill-fg-3);margin:0 0 6px}
.aiskill-scene-textarea{
  width:100%;box-sizing:border-box;min-height:132px;resize:vertical;
  padding:10px;border:1px solid var(--aiskill-line-2);border-radius:8px;
  background:transparent;color:inherit;font:inherit;font-size:13px;line-height:1.55;
  transition:border-color .15s ease,box-shadow .15s ease;
}
.aiskill-scene-textarea:hover{border-color:var(--aiskill-line-3)}
.aiskill-scene-textarea:focus{outline:none;border-color:var(--aiskill-ring);box-shadow:0 0 0 2px color-mix(in srgb,var(--aiskill-ring) 22%,transparent)}
.aiskill-scene-skills{margin-top:14px}
.aiskill-scene-skilllist{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:2px}
.aiskill-scene-skill{display:inline-flex;align-items:center;gap:7px;font-size:13px;color:var(--aiskill-fg-2);cursor:pointer}
.aiskill-scene-skill input{accent-color:var(--aiskill-strong);cursor:pointer;flex:none}
.aiskill-scene-skill input:disabled{cursor:default}
.aiskill-scene-skill-cat{font-size:11px;color:var(--aiskill-fg-3)}
.aiskill-scene-actions{display:flex;align-items:center;gap:10px;margin-top:16px}
.aiskill-scene-note{font-size:11px;color:var(--aiskill-fg-3);margin-left:auto;text-align:right}

/* 无会话空态 */
.aiskill-scenes-empty{margin:auto;display:flex;flex-direction:column;align-items:center;
  gap:8px;text-align:center;padding:48px 16px;color:var(--aiskill-fg-2)}
.aiskill-scenes-empty-icon{color:var(--aiskill-fg-dim)}
.aiskill-scenes-empty-title{font-size:14px;font-weight:600;color:var(--aiskill-fg)}
.aiskill-scenes-empty-hint{font-size:13px;max-width:34em}
.aiskill-scenes-empty .aiskill-primary{margin-top:6px;flex:none;padding:0 18px}

@container (max-width:600px){
  .aiskill-scenes{padding:16px 14px 22px}
  .aiskill-scene-needs{display:none}
  .aiskill-scene-note{display:none}
}

/* 窄面板:收起描述、收紧留白 */
@container (max-width:360px){
  .aiskill-panel{padding:12px 12px 10px}
  .aiskill-rowdesc{display:none}
  .aiskill-head{padding-bottom:10px}
}
`;
		function ensureStyles() {
			// 自检沙箱里没有 document;真实浏览器里只注入一次。
			if (typeof document === "undefined" || !document.head) return;
			if (document.getElementById(STYLE_ID)) return;
			const tag = document.createElement("style");
			tag.id = STYLE_ID;
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}

		// ── 线性图标:统一 1.5 描边、currentColor,不用 emoji ────────────────────
		function icon(children, size) {
			return h("svg", {
				key: "i", width: size || 16, height: size || 16, viewBox: "0 0 24 24",
				fill: "none", stroke: "currentColor", strokeWidth: 1.5,
				strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", focusable: "false"
			}, children);
		}
		const searchIcon = () => icon([
			h("circle", { key: "c", cx: 11, cy: 11, r: 6.5 }),
			h("path", { key: "l", d: "m20 20-3.6-3.6" })
		], 15);
		const bookIcon = (size) => icon([
			h("path", { key: "l", d: "M4 5.5A1.5 1.5 0 0 1 5.5 4H10v16H5.5A1.5 1.5 0 0 1 4 18.5z" }),
			h("path", { key: "r", d: "M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14z" }),
			h("path", { key: "s", d: "M12 4v16" })
		], size);
		// 场景图标:文件夹 / 表格 / 文稿 / 网页 —— 统一 1.5 描边,不用 emoji。
		const sceneIcons = {
			files: (size) => icon([
				h("path", { key: "f", d: "M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" })
			], size),
			spreadsheet: (size) => icon([
				h("rect", { key: "r", x: 3.5, y: 4.5, width: 17, height: 15, rx: 1.5 }),
				h("path", { key: "h", d: "M3.5 9.5h17M9.5 9.5v10M3.5 14.5h17" })
			], size),
			writing: (size) => icon([
				h("path", { key: "s", d: "M6 3.5h8L19 8.5v12H6z" }),
				h("path", { key: "f", d: "M13.5 3.5v5h5" }),
				h("path", { key: "l", d: "M9 13h7M9 16.5h5" })
			], size),
			website: (size) => icon([
				h("circle", { key: "c", cx: 12, cy: 12, r: 8.5 }),
				h("path", { key: "m", d: "M3.5 12h17M12 3.5c2.4 2.2 3.6 5.2 3.6 8.5S14.4 18.3 12 20.5c-2.4-2.2-3.6-5.2-3.6-8.5S9.6 5.7 12 3.5z" })
			], size),
		};
		const caretIcon = (size) => icon([h("path", { key: "p", d: "m9 6 6 6-6 6" })], size);
		const emptyChatIcon = (size) => icon([
			h("path", { key: "b", d: "M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9A1.5 1.5 0 0 1 18.5 16H9l-5 4z" }),
			h("path", { key: "l", d: "M8.5 10h7" })
		], size);

		/**
		 * 侧栏 panellist 行的 glyph(行按钮、选中态、点击都由 sidebar 自己管;
		 * 这里只画图标,选中时第一行填色)。owner props = {size, active}。
		 */
		function ScenarioPanelIcon(props) {
			const size = props.size || 18;
			const row = (key, y) => h("rect", {
				key, x: 3.5, y, width: 17, height: 6, rx: 1.6,
				fill: props.active ? "currentColor" : "none"
			});
			return h("span", { className: "aiskill-navglyph" },
				h("svg", {
					width: size, height: size, viewBox: "0 0 24 24", fill: "none",
					stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round",
					strokeLinejoin: "round", "aria-hidden": "true", focusable: "false"
				}, [row("a", 4), row("b", 14)]));
		}

		/**
		 * 主面板不是会话作用域(拿不到绑定的会话),所以草稿读写都走 ctx 上的真实服务:
		 * sessions.list.getSnapshot().current 拿当前会话 id,
		 * conversation.input.shell(id) 拿该会话的输入面(编辑器 + 状态 + 动作)。
		 * 全程不碰剪贴板、不改 DOM、不发送 —— 只写草稿。
		 */
		function makeScenarioIO(ctx) {
			const service = (name) => { try { return ctx.get(name); } catch (e) { return undefined; } };
			const shellFor = (id) => {
				const conversation = service("conversation");
				if (id === undefined || !conversation || !conversation.input) return undefined;
				try { return conversation.input.shell(id); } catch (e) { return undefined; }
			};
			return {
				currentId() {
					const sessions = service("sessions");
					try { return sessions && sessions.list.getSnapshot().current; } catch (e) { return undefined; }
				},
				read(id) {
					const shell = shellFor(id);
					if (!shell) return "";
					try { return shell.state.getSnapshot().draft || ""; } catch (e) { return ""; }
				},
				write(id, text) {
					const shell = shellFor(id);
					if (!shell || !shell.actions) return false;
					try { shell.actions.setDraft(text); return true; } catch (e) { return false; }
				},
				/** 切回会话面板,但不改变当前会话。 */
				openChat() {
					const layout = service("layout");
					try { if (layout && layout.selectPanel) layout.selectPanel(null); } catch (e) { /* 布局未就绪 */ }
				},
				/** 走原生导航开一个新会话(无工作区时它自己退到纯新会话视图)。 */
				startSession() {
					const workspace = service("uiWorkspace");
					try { if (workspace && workspace.startSession) workspace.startSession(); } catch (e) { /* 静默 */ }
				},
			};
		}

		/**
		 * 「任务场景」主面板。每个场景给三样:能得到什么、需要你提供什么、一份可直接改的模板。
		 * 「写入当前对话并返回」把模板**追加**进当前草稿(接在已有内容后面,绝不覆盖,
		 * 已有的 /skill token 原样保留),勾选的推荐技能以 `/name ` token 形式加在同一段里,
		 * 然后切回会话面板 —— 不自动发送。推荐技能默认全不勾,不会静默启用。
		 */
		function ScenarioPanel(props) {
			const t = props.t;
			const io = props.scenarioIO;
			const sessionId = props.useSessions((state) => state.current);
			const [openKey, setOpenKey] = react.useState(null);
			const [edits, setEdits] = react.useState({});
			const [picked, setPicked] = react.useState(() => new Set());
			const [busy, setBusy] = react.useState(false);

			const toggleScene = (key) => {
				setPicked(new Set());
				setOpenKey((prev) => (prev === key ? null : key));
			};
			const toggleSkill = (name) => {
				setPicked((prev) => {
					const next = new Set(prev);
					if (next.has(name)) next.delete(name); else next.add(name);
					return next;
				});
			};
			const use = (scene) => {
				if (!io || busy) return;
				const id = io.currentId();
				const text = edits[scene.key] !== undefined ? edits[scene.key] : scene.template;
				setBusy(true);
				if (io.write(id, applyScene(io.read(id), text, Array.from(picked)))) io.openChat();
				Promise.resolve().then(() => setBusy(false));
			};

			const renderScene = (scene) => {
				const open = openKey === scene.key;
				const glyph = sceneIcons[scene.key] || sceneIcons.files;
				const head = h("button", {
					key: "head", type: "button", className: "aiskill-scene-head",
					"aria-expanded": open ? "true" : "false",
					onClick: () => toggleScene(scene.key)
				}, [
					h("span", { key: "g", className: "aiskill-scene-glyph" }, glyph(18)),
					h("span", { key: "b", className: "aiskill-scene-body" }, [
						h("span", { key: "n", className: "aiskill-scene-name" }, scene.title),
						h("span", { key: "o", className: "aiskill-scene-outcome" }, scene.outcome),
						h("span", { key: "d", className: "aiskill-scene-needs" },
							t("scenes.inputs") + " · " + scene.inputs.join(" · "))
					]),
					h("span", { key: "c", className: "aiskill-scene-caret" }, caretIcon(16))
				]);

				if (!open) return h("div", { key: scene.key, className: "aiskill-scene" }, head);

				const text = edits[scene.key] !== undefined ? edits[scene.key] : scene.template;
				const detail = h("div", { key: "detail", className: "aiskill-scene-detail" }, [
					h("div", { key: "fl", className: "aiskill-scene-fieldlabel" }, t("scenes.template")),
					h("textarea", {
						key: "ta", className: "aiskill-scene-textarea", value: text,
						"aria-label": t("scenes.template"),
						onChange: (event) => {
							const value = event.target.value;
							setEdits((prev) => Object.assign({}, prev, { [scene.key]: value }));
						}
					}),
					scene.skills.length ? h("div", { key: "sk", className: "aiskill-scene-skills" }, [
						h("div", { key: "l", className: "aiskill-scene-fieldlabel" }, t("scenes.skills")),
						h("div", { key: "list", className: "aiskill-scene-skilllist" }, scene.skills.map((s) =>
							h("label", { key: s.name, className: "aiskill-scene-skill", title: s.name }, [
								h("input", {
									key: "c", type: "checkbox", checked: picked.has(s.name),
									disabled: busy, "aria-label": s.title,
									onChange: () => toggleSkill(s.name)
								}),
								h("span", { key: "t" }, s.title),
								h("span", { key: "cat", className: "aiskill-scene-skill-cat" }, s.category)
							])))
					]) : null,
					h("div", { key: "ac", className: "aiskill-scene-actions" }, [
						h("button", {
							key: "u", type: "button", className: "aiskill-primary",
							disabled: busy || !io, onClick: () => use(scene)
						}, (busy ? t("action.busy") : t("scenes.use")) + (picked.size ? " (" + picked.size + ")" : "")),
						h("span", { key: "n", className: "aiskill-scene-note" }, t("scenes.appendNote"))
					])
				]);

				return h("div", { key: scene.key, className: "aiskill-scene is-open" }, [head, detail]);
			};

			if (sessionId === undefined) {
				return h("div", { className: "aiskill-scenes" },
					h("div", { className: "aiskill-scenes-empty" }, [
						h("span", { key: "i", className: "aiskill-scenes-empty-icon" }, emptyChatIcon(30)),
						h("span", { key: "t", className: "aiskill-scenes-empty-title" }, t("scenes.noSession.title")),
						h("span", { key: "h", className: "aiskill-scenes-empty-hint" }, t("scenes.noSession.hint")),
						h("button", {
							key: "b", type: "button", className: "aiskill-primary",
							onClick: () => { if (io) io.startSession(); }
						}, t("scenes.noSession.action"))
					]));
			}

			return h("div", { className: "aiskill-scenes" },
				h("div", { className: "aiskill-scenes-inner" }, [
					h("div", { key: "head", className: "aiskill-scenes-head" }, [
						h("div", { key: "t", className: "aiskill-scenes-title" }, t("scenes.title")),
						h("div", { key: "l", className: "aiskill-scenes-lead" }, t("scenes.lead"))
					]),
					h("div", { key: "rule", className: "aiskill-scenes-rule" }),
					h("div", { key: "list" }, SCENARIOS.map(renderScene))
				]));
		}

		/** 侧栏技能库面板体:浏览/搜索/分类 + 多选 → 写入当前会话草稿。 */
		function SkillLibraryBody(props) {
			const t = props.t;
			const draft = readDraft(props);
			const [query, setQuery] = react.useState("");
			const [category, setCategory] = react.useState("");
			const [picked, setPicked] = react.useState(() => new Set());
			const [busy, setBusy] = react.useState(false);
			const selected = react.useMemo(() => new Set(selectedSlugs(draft)), [draft]);

			const shown = react.useMemo(() => {
				const q = query.trim().toLowerCase();
				return CATALOG.filter((item) => {
					if (category && item.category !== category) return false;
					if (!q) return true;
					return [item.title, item.name, item.description, item.category]
						.concat(item.tags || [])
						.some((field) => String(field || "").toLowerCase().includes(q));
				});
			}, [query, category]);

			const toggle = (name) => {
				setPicked((prev) => {
					const next = new Set(prev);
					if (next.has(name)) next.delete(name);
					else next.add(name);
					return next;
				});
			};

			const commit = () => {
				if (picked.size === 0 || !props.inputActions || busy) return;
				setBusy(true);
				let next = draft;
				for (const name of picked) next = addToken(next, name);
				props.inputActions.setDraft(next);
				setPicked(new Set());
				// 提交是同步的;留一个提交中的可见态,避免连点重复写入。
				Promise.resolve().then(() => setBusy(false));
			};

			const ready = !!props.inputActions;
			const canWrite = picked.size > 0 && ready && !busy;

			const listBody = () => {
				if (props.loading) {
					return [0, 1, 2, 3].map((i) => h("div", { key: "g" + i, className: "aiskill-ghostrow" }));
				}
				if (!shown.length) {
					return h("div", { className: "aiskill-empty" }, [
						h("span", { key: "ic", className: "aiskill-empty-icon" }, searchIcon()),
						h("span", { key: "ti", className: "aiskill-empty-title" }, t("empty")),
						h("span", { key: "hi", className: "aiskill-empty-hint" }, t("empty.hint"))
					]);
				}
				return shown.map((item) => {
					const inDraft = selected.has(item.name);
					return h("label", {
						key: item.name,
						className: "aiskill-row" + (inDraft ? " is-in-draft" : ""),
						title: item.title
					}, [
						h("input", {
							key: "box", className: "aiskill-check", type: "checkbox",
							checked: picked.has(item.name),
							disabled: busy,
							"aria-label": item.title,
							onChange: () => toggle(item.name)
						}),
						h("span", { key: "body", className: "aiskill-body" }, [
							h("span", { key: "title", className: "aiskill-rowtitle" }, item.title),
							h("span", { key: "meta", className: "aiskill-rowmeta" }, [
								h("span", { key: "cat" }, item.category || t("selected")),
								inDraft ? h("span", { key: "tag", className: "aiskill-tag" }, t("row.inDraft")) : null
							]),
							item.description
								? h("span", { key: "desc", className: "aiskill-rowdesc" }, item.description)
								: null
						])
					]);
				});
			};

			return h("div", { className: "aiskill-panel" }, [
				h("div", { key: "head", className: "aiskill-head" }, [
					h("span", { key: "c", className: "aiskill-count" }, fmt(t("header.count"), CATALOG.length)),
					h("span", { key: "s", className: "aiskill-sep" }, "·"),
					h("span", { key: "p" }, t("header.purpose"))
				]),
				h("div", { key: "search", className: "aiskill-search" }, [
					h("span", { key: "ic", className: "aiskill-searchicon" }, searchIcon()),
					h("input", {
						key: "in", className: "aiskill-input", type: "search",
						value: query, placeholder: t("search.placeholder"),
						"aria-label": t("search.label"),
						onChange: (event) => setQuery(event.target.value)
					})
				]),
				h("div", { key: "filters", className: "aiskill-filters" }, [
					h("select", {
						key: "sel", className: "aiskill-select", value: category,
						"aria-label": t("filter.label"),
						onChange: (event) => setCategory(event.target.value)
					}, [h("option", { key: "__all__", value: "" }, fmt(t("filter.all") + " ({n})", CATALOG.length))]
						.concat(CATEGORIES.map((name) =>
							h("option", { key: name, value: name }, name + " (" + (COUNT_BY_CATEGORY[name] || 0) + ")")))),
					h("span", { key: "rc", className: "aiskill-result" }, fmt(t("filter.result"), shown.length))
				]),
				h("div", { key: "list", className: "aiskill-list" }, listBody()),
				h("div", { key: "foot", className: "aiskill-foot" }, [
					h("button", {
						key: "add", type: "button", className: "aiskill-primary",
						disabled: !canWrite, onClick: commit
					}, (busy ? t("action.busy") : t("action.add")) + (picked.size ? " (" + picked.size + ")" : "")),
					h("button", {
						key: "clear", type: "button", className: "aiskill-ghost",
						disabled: picked.size === 0 || busy, onClick: () => setPicked(new Set())
					}, t("action.clear"))
				])
			]);
		}

		/** 面板标签(= 右侧标签页标题)。 */
		function SkillLibraryTitle(props) {
			return props.t("entry.title");
		}

		/** 侧栏页脚入口:点开右侧技能库面板,聊天保持可见。 */
		function SkillLibraryLauncher(props) {
			const t = props.t;
			const open = props.openLibrary;
			return h("button", {
				type: "button", className: "aiskill-launcher",
				title: t("entry.hint"),
				onClick: () => { try { open(); } catch (e) { /* 还没有会话可挂载时,静默忽略 */ } }
			}, [
				h("span", { key: "icon", className: "aiskill-launcher-icon" }, bookIcon(18)),
				props.wide ? h("span", { key: "label" }, t("entry.title")) : null
			]);
		}

		/**
		 * 作曲器上方的 skill chip 轨。**唯一的真相是草稿文本** —— 这里只做
		 * 「把草稿里已有的 /slug 画成中文 chip」和「× 时把该 token 从草稿里删掉」。
		 * 于是原生语义自动成立:只作用于下一条;发送成功草稿被清空(chip 消失);
		 * 发送失败草稿被还原(chip 仍在);草稿本就按会话存(会话隔离)。
		 */
		function SkillChips(props) {
			const t = props.t;
			const draft = readDraft(props);
			const slugs = selectedSlugs(draft);
			if (slugs.length === 0) return null;
			const chips = slugs.map((slug) =>
				h("span", { key: slug, className: "aiskill-chip" }, [
					h("span", { key: "label", className: "aiskill-chip-label", title: titleOf(slug) }, titleOf(slug)),
					h("button", {
						key: "x", type: "button", className: "aiskill-chip-x",
						title: t("chip.remove"), "aria-label": t("chip.remove"),
						onClick: () => { if (props.inputActions) props.inputActions.setDraft(removeToken(draft, slug)); }
					}, icon([h("path", { key: "p", d: "M6 6l12 12M18 6L6 18" })], 13))
				])
			);
			return h("div", { className: "aiskill-chips" }, chips);
		}

		/**
		 * 侧栏页脚「联系开发者」:点开在本地收紧展开。微信/邮箱点一下复制,
		 * 邮箱另有 mailto 链接;不弹层、不遮挡聊天 —— 页脚本来就窄,展开即所见。
		 */
		function ContactLauncher(props) {
			const t = props.t;
			const [open, setOpen] = react.useState(false);
			const [copied, setCopied] = react.useState("");
			const copy = (value, key) => {
				try {
					if (!(typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText)) return;
					navigator.clipboard.writeText(value).then(() => setCopied(key), () => {});
				} catch (e) { /* 剪贴板不可用:保持原样,不谎报已复制 */ }
			};
			const copyRow = (key, value) => h("button", {
				key, type: "button", className: "aiskill-contact-row",
				title: t("contact.copy"), onClick: () => copy(value, key)
			}, [
				h("span", { key: "v", className: "aiskill-contact-value" }, value),
				h("span", { key: "a", className: "aiskill-contact-action" }, copied === key ? t("contact.copied") : t("contact.copy"))
			]);
			return h("div", { className: "aiskill-contact" }, [
				h("button", {
					key: "head", type: "button", className: "aiskill-launcher",
					"aria-expanded": open ? "true" : "false", title: t("contact.hint"),
					onClick: () => setOpen((v) => !v)
				}, [
					h("span", { key: "i", className: "aiskill-launcher-icon" }, emptyChatIcon(18)),
					props.wide ? h("span", { key: "l" }, t("contact.title")) : null
				]),
				open ? h("div", { key: "pop", className: "aiskill-contact-pop" }, [
					h("div", { key: "who", className: "aiskill-contact-who" }, t("contact.who")),
					copyRow("wechat", WECHAT),
					h("a", {
						key: "mail", className: "aiskill-contact-row",
						href: "mailto:" + EMAIL, title: t("contact.send")
					}, [
						h("span", { key: "v", className: "aiskill-contact-value" }, EMAIL),
						h("span", { key: "a", className: "aiskill-contact-action" }, t("contact.send"))
					]),
					h("button", {
						key: "cmail", type: "button", className: "aiskill-contact-mail",
						onClick: () => copy(EMAIL, "email")
					}, copied === "email" ? t("contact.copied") : t("contact.copyMail"))
				]) : null,
				h("div", { key: "lead", className: "aiskill-contact-lead" },
					h("a", { href: GITHUB, target: "_blank", rel: "noopener noreferrer" }, t("contact.lead")))
			]);
		}

		const inject = ["slots", "locale", "sidebarRightTabs", "sidebarRight", "uiSession"];

		function apply(ctx) {
			ensureStyles();

			ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), "skill-library: dictionaries");

			ctx.effect(() => ctx.sidebarRightTabs.register({
				id: ID,
				kind: KIND,
				priority: "extension",
				title: () => "技能库"
			}), "skill-library: tab type");

			ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
				name: "sidebar.right.pane.tab",
				key: ID,
				locale: NS
			}, SkillLibraryBody)), "skill-library: tab body");

			ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab.title", () => ctx.slots.register({
				name: "sidebar.right.pane.tab.title",
				key: ID,
				locale: NS
			}, SkillLibraryTitle)), "skill-library: tab title");

			ctx.effect(() => ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
				name: "conversation.input.dock",
				id: "skill-library-chips",
				order: 5,
				locale: NS
			}, SkillChips)), "skill-library: composer chips");

			ctx.effect(() => ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "skill-library-entry",
				order: 100,
				locale: NS,
				inject: () => ({ openLibrary: () => ctx.sidebarRight.openTab(KIND) })
			}, SkillLibraryLauncher)), "skill-library: sidebar entry");

			// 开发者联系入口:同一页脚槽位,排到技能库入口之后。
			ctx.effect(() => ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "yufeng-contact",
				order: 200,
				locale: NS
			}, ContactLauncher)), "skill-library: developer contact");

			// 任务场景:侧栏一行 glyph + 一个 root 作用域的主面板。
			// 行按钮/选中态/点击→selectPanel 都由 sidebar 自己实现,标签走 options.label。
			ctx.effect(() => ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
				name: "sidebar.panellist",
				id: PANEL_ID,
				order: 20,
				locale: NS,
				label: () => ctx.locale.bind(NS)("scenes.title")
			}, ScenarioPanelIcon)), "skill-library: task scenes sidebar row");

			ctx.effect(() => ctx.slots.inject("main", () => ctx.slots.register({
				name: "main",
				key: PANEL_ID,
				locale: NS,
				inject: () => ({ scenarioIO: makeScenarioIO(ctx) })
			}, ScenarioPanel)), "skill-library: task scenes panel");
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
