---
name: library-db0750a7e7ac528d0e92
description: "专注市场的AI技能"
---

# Farmers Market (colorful produce, candid)

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
  "category": "FARMERS_MARKET_PRODUCE_CANDID",
  "identity_lock": {
    "enabled": true,
    "priority": "ABSOLUTE_MAX",
    "instruction": "Lock identity to reference image exactly. Adult 21+ only. No face changes."
  },
  "subject": {
    "demographics": "Adult woman, 21-29, match reference identity.",
    "hair": {
      "color": "Match reference.",
      "style": "Loose waves, tucked behind ear",
      "texture": "Strands visible, mild flyaways",
      "movement": "Natural movement while walking"
    },
    "face": {
      "eyes": "Exact reference eyes; bright daylight catchlights",
      "skin_details": "Pores visible, natural sunlit texture",
      "micro_details": "Preserve marks"
    },
    "clothing": {
      "outfit": "Casual black top + light jacket (no logos/text)",
      "fabric": "Cotton/denim weave visible"
    },
    "accessories": {
      "bag": "Canvas tote (no logos)",
      "jewelry": ["Small silver hoops"],
      "props": ["Paper bag of produce (unbranded)"]
    }
  },
  "pose": {
    "type": "Walking candid",
    "orientation": "Half-body",
    "hands": "One hand holding produce bag, other adjusting tote strap",
    "gaze": "Looking at camera mid-laugh",
    "expression": "Bright, natural smile"
  },
  "setting": {
    "environment": "Outdoor farmers market",
    "background_elements": [
      "Colorful fruit/vegetable stalls (no readable signs)",
      "Soft crowd blur (no identifiable faces)",
      "Sunlight dappling"
    ],
    "depth": "Subject sharp; background lively bokeh"
  },
  "camera": {
    "shot_type": "Half-body lifestyle",
    "angle": "Eye level",
    "focal_length_equivalent": "26mm phone or 35mm editorial",
    "framing": "4:5, subject off-center",
    "focus": "Face sharp; background soft"
  },
  "lighting": {
    "source": "Natural daylight",
    "direction": "Soft front/side",
    "highlights": "Natural facial highlights",
    "shadows": "Soft under-chin"
  },
  "mood_and_expression": {
    "tone": "Fresh, happy, relatable",
    "atmosphere": "Weekend candid"
  },
  "style_and_realism": {
    "style": "Photorealistic IG lifestyle",
    "imperfections": "Minor motion blur in produce bag edges allowed"
  },
  "technical_details": {
    "aspect_ratio": "4:5",
    "resolution": "High",
    "noise": "Low",
    "mode_variants": {
      "amateur": "Slightly shaky candid framing, mild HDR, imperfect crop",
      "pro": "Clean editorial exposure, crisp detail, shallow DOF"
    }
  },
  "constraints": {
    "adult_only": true,
    "single_subject_only": true,
    "no_text": true,
    "no_logos": true,
    "no_watermarks": true,
    "no_readable_signage": true
  },
  "negative_prompt": [
    "readable text", "logos", "watermark",
    "identity drift", "face morphing",
    "extra fingers", "warped hands",
    "plastic skin", "over-smoothing"
  ]
}
```

## 中文说明
此技能来自 GitHub 高星开源项目 [f/prompts.chat](https://github.com/f/prompts.chat)（⭐165,462），让 AI 扮演「Farmers Market (colorful produce, candid)」角色，按照提示词中的指令进行交互。

## 技巧
- 可以根据自己的需求微调提示词中的具体要求
- 角色扮演类 skill 越具体，AI 的表现越精准
