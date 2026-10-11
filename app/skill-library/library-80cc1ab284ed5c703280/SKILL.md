---
name: library-80cc1ab284ed5c703280
description: "专注法律、风险管理、工具的AI技能"
---

# Legal Risk Minimization Tool for Freelancers

> 来源：[f/prompts.chat](https://github.com/f/prompts.chat) ⭐165,462
> 搬运日期：2026-07-12
> 原作者：f, community contributors

## 适用平台
ChatGPT / Claude / Kimi / DeepSeek / 通义千问

## 使用方法
复制下面的提示词到 AI 对话框。

## 提示词

```
Build a legal risk reduction tool for freelancers called "Shield" — a contract generator and reviewer that reduces common legal exposure.

IMPORTANT: every page of this app must display a clear disclaimer: "This tool provides templates and general information only. It is not legal advice. Review all documents with a qualified attorney before use."

Core features:
- Contract generator: user inputs project type (web development / copywriting / design / consulting / photography / other), client type (individual / small business / enterprise), payment terms (fixed / milestone / retainer), approximate project value, and 3 custom deliverables in plain language. [LLM API] generates a complete contract covering scope, IP ownership, payment schedule, revision policy, late payment penalties, confidentiality, and termination — formatted as a clean DOCX
- Contract reviewer: user pastes an incoming contract. AI highlights the 5 most important clauses (ranked by risk), flags anything unusual or asymmetric, and for each flagged clause suggests a specific alternative wording
- Risk radar: user describes their freelance business in 3 sentences — AI identifies their top 5 legal exposure areas with a one-paragraph explanation of each risk and a mitigation step
- Template library: 10 pre-built contract types, all downloadable as DOCX and editable in any word processor
- NDA generator: inputs both party names, confidentiality scope, and duration — generates a mutual NDA in under 30 seconds

Stack: React, [LLM API] for generation and review, docx-js for DOCX export. Professional, trustworthy design — this handles serious matters.
```

## 中文说明
此技能来自 GitHub 高星开源项目 [f/prompts.chat](https://github.com/f/prompts.chat)（⭐165,462），让 AI 扮演「Legal Risk Minimization Tool for Freelancers」角色，按照提示词中的指令进行交互。

## 技巧
- 可以根据自己的需求微调提示词中的具体要求
- 角色扮演类 skill 越具体，AI 的表现越精准
