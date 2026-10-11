# Harness 技能库面板 — 设计说明(改编版)

日期:2026-10-11。范围:右侧「技能库」面板 + 作曲器 skill 芯片轨的**视觉**重做。
不改原生聊天布局、不改技能调用语义、不加业务功能。

## 1. 参考来源(三个,按权重)

| 来源 | 路径 | 用法 |
|------|------|------|
| 设计系统生成器 | `D:\.claude\skills\ui-ux-pro-max-skill`(读了 `src/ui-ux-pro-max/templates/base/quick-reference.md`,跑了 `scripts/search.py --design-system "productivity desktop chat skill library minimal monochrome content first"`) | 抽规则/反模式,不照搬配色与字体 |
| 用户认可的真实产品 | `F:\workspace\tradepilot-next`(`app/globals.css`、`components/app-sidebar.tsx`、`components/nav-main.tsx`、`components/empty-state.tsx`、`app/mail/_components/MailHistory.tsx`、`MailForm.tsx`);`F:\workspace\tradepilot\web` 为同源副本,`globals.css` 与 next 版一致 | **更强的美学基准**:密度、边框、层级、状态 |
| 宿主自身 | 随包 `@deepseek-ai/dsh-web-frontend` + `dsh-client-ui-theme` 的 CSS | 真实主题 token(唯一颜色来源) |

`search.py --design-system` 的输出(节选):Pattern = *Newsletter / Content First*;
Style = *Exaggerated Minimalism*(monochrome、高对比、负空间);Colors = 主 `#18181B` /
背景 `#FAFAFA` / 边框 `#E4E4E7` / 强调 `#2563EB`;Typography = Playfair Display + Source Serif 4。

### 采纳
- **Monochrome + 内容优先**:同一灰阶家族做层级,靠字重/字号/间距分层,不靠彩色。
- **编辑式列表**:标题/描述两段式 + 细分隔线,不用卡片框。
- **SVG 线性图标,不用 emoji**(原 ★ 入口正是反例)。
- **状态要齐**:empty / loading / hover / focus / disabled / 选中,都要有明确视觉。
- 预交付清单里的:对比度 ≥4.5:1、`cursor-pointer`、150–300ms 过渡、可见 focus、`prefers-reduced-motion`、375/768/1024/1440 响应式。

### 不采纳(以及为什么)
- **Playfair Display / Source Serif 4 / Google Fonts**:用户明确要求**不引入 web 字体**;且它是给"夸张极简主义落地页/杂志"的推荐,不是工具型面板。→ 字体**完全继承宿主**(`--dsw-font-family` 已含 `PingFang SC / Microsoft YaHei` 系统中文栈)。
- **Newsletter/Hero/CTA 版式、`clamp(3rem…)` 大字**:面板不是营销页;用户明确禁止 hero 卡片。
- **React Native / iOS 触摸尺寸等平台条目**:本项目是 React Web(宿主是浏览器客户端插件),模板里的 RN 专属指令**不适用**,不换栈、不照抄 44pt 规则(桌面端用 32/34px 控件高度 + 8px 间距)。
- **`--color-accent: #2563EB` 蓝强调色**:与"安静灰阶、去掉通用 AI 感"冲突,也不跟随宿主主题。→ 强调色一律走宿主的 `--dsw-alias-*`。

## 2. 从 TradePilot 借什么

| TradePilot 做法 | 落地到面板 |
|------|------|
| 单色 OKLCH(白 `oklch(1 0 0)` / 近黑 `oklch(0.145 0 0)`),不用彩色装饰 | 只用宿主中性 token,零彩色 |
| `--radius: 0.625rem`(10px)一套圆角;`radius-sm/md/lg = ×0.6/0.8/1.0` | 控件 8px、行 6px、胶囊 999px(等比收敛) |
| 克制的 1px 细边框(`border: oklch(0.922 0 0)` / 暗色 `oklch(1 0 0 / 10%)`) | 1px 边框 + 细分隔线,无投影、无渐变 |
| 选中态 = 底色微变 + 强调边框,而非大色块 | 行选中 = 极淡底 + 勾选框;不铺满 |
| meta 文字用 `text-muted-foreground`、正文 `text-sm`、标签 `text-xs` | 12px 三级文字 / 13px 描述 / 14px 标题 |
| 侧栏密度:`p-2`、`rounded-md`、`hover:bg-accent`、条目间软分隔 | 行 `padding:10px 8px`、hover 淡底、`border-top` 软分隔 |
| `EmptyState`:居中的 muted 图标(`/30`)+ 一句 muted 说明 | 空态 = 放大镜图标 + 主句 + 一句提示 |
| 幽灵按钮 `variant="ghost"` 与主按钮共存 | 页脚 = 主按钮(写入)+ 幽灵按钮(清空) |

## 3. 真实主题 token(唯一颜色来源)

全部来自宿主 `--dsw-alias-*`。它们定义在 `body` 上、并在 `body[data-ds-dark-theme]` 下整组翻转,
所以**面板不需要写任何 dark 分支**。代码里每个都带浅色兜底值(宿主缺席时仍可读)。

| 用途 | token | 浅色兜底(≈) | 暗色兜底(≈) |
|------|-------|------|------|
| 正文/标题 | `--dsw-alias-label-primary` | `#0f1115` | `#f9fafb` |
| 次级文字 | `--dsw-alias-label-secondary` | `#61666b` | `#cfd3d6` |
| 三级/meta | `--dsw-alias-label-tertiary` | `#81858c` | `#adb2b8` |
| placeholder | `--dsw-alias-label-dimmed` | 更浅 | 更浅 |
| 边框 1/2/3 级 | `--dsw-alias-border-l1/l2/l3` | `rgb(0 0 0/7→18%)` | `rgb(255 255 255/10→18%)` |
| hover / 选中底 | `--dsw-alias-interactive-bg-hover` / `-active` | 近黑 5% / 9% | 近白 6% / 10% |
| 主按钮底 | `--dsw-alias-button-primary-fill` | `#0f1115` | `#f9fafb` |
| 主按钮字 | `--dsw-alias-label-primary-inverted` | `#fff` | `#151517` |
| 焦点环 | `--dsw-alias-brand-primary` | 近黑 | 近白 |
| 危险/错误 | `--dsw-alias-state-error-primary` | 红 | 红 |

宿主切换方式(已核实):`document.body.toggleAttribute('data-ds-dark-theme', dark)`;
`dark = preference==='dark' || (preference==='system' && matchMedia('(prefers-color-scheme: dark)').matches)`。

文字对比:暗色 `#f9fafb` on `#151517` ≈ 16:1;浅色 `#0f1115` on `#fff` ≈ 18:1;
三级 `#81858c` on `#fff` ≈ 3.4:1(仅用于 12px 辅助信息,主信息一律用 primary/secondary)。
即"深字浅底压在灰上 → 用主/次文字",不打灰对灰。

## 4. 面板规格

```
技能库(标签页原生标题,面板内不重复)
538 个技能 · 仅用于下一条消息          ← 12px,一行,计数用二级色
[⌕ 搜索技能…]                          ← 32px,图标在左,aria-label
[全部类别 (538)          ▾]  显示 8 个  ← 单一下拉替代 22 个胶囊;右侧结果数
───────────────────────────────────    ← 1px 细分隔
☐ 面试官模拟                            ← 14px/600 标题
  职场  已在草稿                         ← 11px 三级 meta + 状态标签
  AI扮演面试官,逐题提问…                 ← 13px 二级,最多 2 行
  (行间 1px 软分隔;hover 淡底)
...
───────────────────────────────────
[    写入当前对话 (2)    ]  [清空选择]   ← 固定页脚,始终可见
```

- **间距**:面板内边距 16,头部下 14,控件间 10,行内 10/8;窄面板 12。—— 16/20/24 体系的桌面版收敛。
- **字号**:标题 14 / 描述 13 / meta 11–12。随宿主 `--dsh-content-font-size` 由宿主放大,面板按 px 固定。
- **圆角**:控件 8,行 6,胶囊/标签 999。
- **状态**:`hover` 淡底;`:focus-visible` 2px 品牌色 outline(输入另外加 2px 柔光);`disabled` 与主按钮 `opacity:.42` + `cursor:default`;空态双行文案;加载态 4 条骨架行;选中行有勾选框 + 标签。
- **响应式**:`container-type:inline-size` + `@container (max-width:360px)` → 收起描述、收紧内边距。面板宽度由宿主布局决定(1024px 视口下实测 344px)。
- **禁止项(用户要求)**:无渐变、无霓虹、无装饰投影、无 hero 卡片、无 emoji 图标、无内部 ID 外露。

## 5. 样式如何"打包"进扩展

浏览器 bundle 无打包器,所以样式以**一个被注入的 `<style id="aiskill-skill-library-styles">`** 承载
(`ensureStyles()`,只在 `typeof document !== 'undefined'` 时注入一次,兼容 Node 自检沙箱)。
类名统一 `aiskill-` 前缀,颜色全部走语义 token —— 即"用类名 + 语义 token,而不是满屏 inline style"。
