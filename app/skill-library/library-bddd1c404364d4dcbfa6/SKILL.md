---
name: library-bddd1c404364d4dcbfa6
description: "专注规划器的AI技能"
---

# Camp Planner

> 来源：[f/prompts.chat](https://github.com/f/prompts.chat) ⭐165,462
> 搬运日期：2026-07-12
> 原作者：f, community contributors

## 适用平台
ChatGPT / Claude / Kimi / DeepSeek / 通义千问

## 使用方法
复制下面的提示词到 AI 对话框。

## 提示词

```
{
  "research_config": {
    "topic": "Logistics-Oriented and Car-Free Camping Planning Analysis",
    "target_persona": {
      "age_group": "${age_group:30-35}",
      "group_size": "${group_size:4}",
      "travel_mode": "Intermodal Transportation (Public Transit + Hiking/Walking Only)"
    },
    "output_lang": "${lang:English}"
  },
  "context": {
    "origin": "${origin:Ankara Yenimahalle}",
    "destination_region": "${destination:Nallihan}",
    "specific_date": "${date:March 14, 2026}",
    "priorities": [
      "Logistical feasibility",
      "Safety",
      "Nature immersion",
      "Minimalism/Ultralight approach"
    ]
  },
  "knowledge_base_requirements": {
    "transport_analysis": [
      "Main artery bus/train lines and specific stop locations",
      "First/Last Mile connectivity (Local shuttles, taxi availability, or trekking distance from the final stop)",
      "Weekend frequency and ticketing/payment methods (e.g., local transit cards vs. cash)"
    ],
    "site_selection_criteria": [
      "Accessibility: Max 5km hiking distance from public transit drop-off points",
      "Legality: Officially designated campsites or safe, legal wild camping zones",
      "Resource Availability: Proximity to water sources and basic necessities (WC/Market)"
    ]
  },
  "goal": {
    "primary_objective": "To create a sustainable, comfortable, and safe camping plan without a private vehicle.",
    "specific_research_tasks": [
      "Identify 3 distinct campsite typologies (e.g., lakeside, forest, high altitude) in the region.",
      "Curate a gear and meal list considering a strict backpack weight limit (max 15-18kg).",
      "Calculate distances to the nearest settlement and medical facilities for emergency protocols.",
      "Construct a precise timeline for a Saturday morning departure and Sunday evening return."
    ]
  },
  "output_structure": {
    "format": "Strategic Research Report",
    "sections": [
      "1. Transportation & Logistics Matrix",
      "2. Campsite Options (with Pros/Cons Analysis)",
      "3. Gear & Meal Planning (Ultralight & Practical)",
      "4. Step-by-Step Weekend Timeline (Chronological)",
      "5. Safety Protocols & Local Insider Tips"
    ],
    "tone": "Analytical, instructional, safe and encouraging"
  }
}
```

## 中文说明
此技能来自 GitHub 高星开源项目 [f/prompts.chat](https://github.com/f/prompts.chat)（⭐165,462），让 AI 扮演「Camp Planner」角色，按照提示词中的指令进行交互。

## 技巧
- 可以根据自己的需求微调提示词中的具体要求
- 角色扮演类 skill 越具体，AI 的表现越精准
