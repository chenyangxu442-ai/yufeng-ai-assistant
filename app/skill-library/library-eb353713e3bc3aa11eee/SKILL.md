---
name: library-eb353713e3bc3aa11eee
description: "创意领域的AI技能，激发灵感产出独特内容"
---

# Grocery Aisle (relatable, comedic-candid)

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
  "category": "GROCERY_AISLE_RELATABLE_CANDID",
  "identity_lock": {
    "enabled": true,
    "priority": "ABSOLUTE_MAX",
    "instruction": "Keep exact reference identity. Adult 21+ only."
  },
  "subject": {
    "demographics": "Adult woman, 21-29, match reference identity.",
    "hair": {
      "color": "Match reference.",
      "style": "Casual ponytail or loose waves",
      "texture": "Real strands, flyaways",
      "movement": "Minimal"
    },
    "face": {
      "eyes": "Exact reference; playful eye contact",
      "skin_details": "Natural texture; no smoothing",
      "micro_details": "Preserve marks"
    },
    "clothing": {
      "outfit": "Casual black hoodie or jacket (no logos/text)",
      "fabric": "Cotton weave visible; slight wrinkles"
    },
    "accessories": {
      "props": [
        "Shopping basket (unbranded)"
      ]
    }
  },
  "pose": {
    "type": "Candid mid-aisle",
    "orientation": "Half-body",
    "hands": "One hand holding basket; other holding a plain-label item with NO readable text",
    "gaze": "Direct eye contact",
    "expression": "Funny 'caught in the act' smirk"
  },
  "setting": {
    "environment": "Grocery aisle",
    "background_elements": [
      "Shelves blurred with NO readable packaging text",
      "Fluorescent overhead lighting",
      "Clean reflective floor"
    ],
    "depth": "Face sharp; shelves softened"
  },
  "camera": {
    "shot_type": "Half-body candid",
    "angle": "Eye level",
    "focal_length_equivalent": "24-28mm phone wide",
    "framing": "4:5, slightly imperfect composition",
    "focus": "Eyes sharp; item slightly out of focus to avoid readable text"
  },
  "lighting": {
    "source": "Overhead fluorescent",
    "direction": "Top-down with mild fill",
    "highlights": "Realistic shine, not plastic",
    "shadows": "Soft under-chin"
  },
  "mood_and_expression": {
    "tone": "Relatable, playful, candid",
    "atmosphere": "Everyday life"
  },
  "style_and_realism": {
    "style": "Photoreal UGC",
    "imperfections": "Mild noise and imperfect WB"
  },
  "technical_details": {
    "aspect_ratio": "4:5",
    "resolution": "High",
    "noise": "Mild",
    "mode_variants": {
      "amateur": "Phone candid, slightly crooked, mild HDR",
      "pro": "Cleaner exposure, sharper detail, controlled highlights"
    }
  },
  "constraints": {
    "adult_only": true,
    "single_subject_only": true,
    "no_text": true,
    "no_logos": true,
    "no_watermarks": true,
    "no_readable_packaging": true
  },
  "negative_prompt": [
    "readable labels",
    "logos",
    "watermark",
    "identity drift",
    "face morphing",
    "extra fingers",
    "warped hands",
    "plastic skin",
    "over-smoothing"
  ]
}
```

## 中文说明
此技能来自 GitHub 高星开源项目 [f/prompts.chat](https://github.com/f/prompts.chat)（⭐165,462），让 AI 扮演「Grocery Aisle (relatable, comedic-candid)」角色，按照提示词中的指令进行交互。

## 技巧
- 可以根据自己的需求微调提示词中的具体要求
- 角色扮演类 skill 越具体，AI 的表现越精准
