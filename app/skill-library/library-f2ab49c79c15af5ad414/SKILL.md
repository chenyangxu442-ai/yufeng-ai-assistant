---
name: library-f2ab49c79c15af5ad414
description: "专注用户体验、用户界面的AI技能"
---

# Bookstore Aisle (artsy, quiet luxury)

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
  "category": "BOOKSTORE_AISLE_ARTSY",
  "identity_lock": {
    "enabled": true,
    "priority": "ABSOLUTE_MAX",
    "instruction": "Preserve the exact identity from the reference image (face geometry, features, skin tone, marks). Adult 21+ only. No beautification or identity changes."
  },
  "subject": {
    "demographics": "Adult woman, 21-29, Turkish-looking (must match reference).",
    "hair": {
      "color": "Match reference exactly.",
      "style": "Loose waves tucked behind one ear",
      "texture": "Real strands; slight frizz; flyaways visible",
      "movement": "Hair rests naturally on shoulders"
    },
    "face": {
      "eyes": "Exact reference eyes; thoughtful gaze; natural catchlights",
      "skin_details": "Pores visible, realistic tone variation",
      "micro_details": "Preserve all reference marks precisely"
    },
    "clothing": {
      "outfit": "Minimal black coat or cardigan over a neutral top (no logos/text).",
      "fabric": "Wool/knit texture visible, slight wrinkles at elbows"
    },
    "accessories": {
      "jewelry": ["Small silver hoops"],
      "props": ["One hardcover book with no readable title (blur/spine turned away)"]
    }
  },
  "pose": {
    "type": "Candid browsing",
    "orientation": "Half-body",
    "head_position": "Chin slightly down, eyes up toward camera",
    "hands": "One hand holding a book near chest; other hand touching a shelf edge (hands correct)",
    "gaze": "Near-direct eye contact, calm and confident",
    "expression": "Soft neutral with micro-smile"
  },
  "setting": {
    "environment": "Bookstore aisle",
    "background_elements": [
      "Shelves of books with spines turned away or blurred (NO readable text)",
      "Warm indoor lighting",
      "Soft depth layers down the aisle"
    ],
    "depth": "Shallow DOF: face sharp, shelves softly blurred"
  },
  "camera": {
    "shot_type": "Half-body portrait",
    "angle": "Eye level or slightly above",
    "focal_length_equivalent": "35-50mm pro OR 26mm phone",
    "framing": "4:5, asymmetrical with leading lines from shelves",
    "focus": "Eyes sharp, hands reasonably sharp, background soft"
  },
  "lighting": {
    "source": "Warm overhead bookstore lights + soft fill",
    "direction": "Gentle top/side",
    "highlights": "Soft highlights on eyes and cheekbones",
    "shadows": "Subtle under-chin shadow, realistic contrast"
  },
  "mood_and_expression": {
    "tone": "Artsy, calm, 'quiet luxury'",
    "atmosphere": "Cozy and intimate, candid"
  },
  "style_and_realism": {
    "style": "Photoreal lifestyle/editorial",
    "fidelity": "High detail, no airbrushing"
  },
  "colors_and_tone": {
    "palette": "Warm browns + neutral blacks + creamy highlights",
    "white_balance": "Warm indoor",
    "contrast": "Medium"
  },
  "technical_details": {
    "aspect_ratio": "4:5",
    "resolution": "High",
    "noise": "Mild indoor grain",
    "mode_variants": {
      "amateur": "Slightly crooked handheld framing, mild noise, imperfect WB",
      "pro": "Cleaner exposure, controlled highlights, crisp micro-contrast"
    }
  },
  "constraints": {
    "adult_only": true,
    "single_subject_only": true,
    "no_text": true,
    "no_logos": true,
    "no_watermarks": true,
    "no_readable_book_titles": true
  },
  "negative_prompt": [
    "readable text", "logos", "watermark",
    "identity drift", "face morphing",
    "plastic skin", "over-smoothing",
    "extra fingers", "warped hands",
    "cgi", "cartoon", "anime"
  ]
}
```

## 中文说明
此技能来自 GitHub 高星开源项目 [f/prompts.chat](https://github.com/f/prompts.chat)（⭐165,462），让 AI 扮演「Bookstore Aisle (artsy, quiet luxury)」角色，按照提示词中的指令进行交互。

## 技巧
- 可以根据自己的需求微调提示词中的具体要求
- 角色扮演类 skill 越具体，AI 的表现越精准
