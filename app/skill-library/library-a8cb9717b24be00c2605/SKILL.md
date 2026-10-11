---
name: library-a8cb9717b24be00c2605
description: "专注漫画、图像的AI技能"
---

# Hyper-Realistic Marvel Comic Fusion Image Generation

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
  "image_generation": {
    "requirements": {
      "face_preservation": {
        "preserve_original": true,
        "accuracy_level": "100% identical to reference",
        "details": [
          "real facial proportions",
          "exact skin texture",
          "true eye shape and color",
          "natural look without makeup"
        ]
      },
      "pose": {
        "match_reference_pose": true,
        "description": "Chest-up portrait, face forward with a gentle rightward tilt."
      },
      "lighting": {
        "match_reference_lighting": true,
        "type": "soft diffused indoor lighting",
        "direction": "front-left",
        "shadows": "gentle soft shadows",
        "background_tone": "neutral with slight bluish tint"
      }
    },

    "subject": {
      "gender": "male",
      "age": "child",
      "hairstyle": {
        "match_reference": true,
        "description": "same hairstyle as reference, adapted naturally for a young boy"
      },
      "expression": "neutral, slightly curious",
      "clothing": {
        "top": "Avengers-style suit top (child version), subtle tech-textured fabric",
        "accessory": "miniature Avengers emblem on the chest"
      }
    },

    "composition": {
      "frame": "chest-up portrait",
      "orientation": "frontal with slight rightward tilt",
      "style": "hyper-realistic with split real/comic effect"
    },

    "special_effects": {
      "split_effect": {
        "type": "irregular centered tear",
        "edges": "white angled torn-paper look",
        "description": "image looks ripped down the middle"
      },

      "realistic_side": {
        "background": "soft, neutral, bluish environment",
        "filters": [
          "soft analog grain",
          "light vintage texture",
          "reduced saturation",
          "subtle film imperfections"
        ],
        "overlays": [
          "small holographic HUD icons (Iron Man–style)",
          "mini Captain America shield doodle",
          "tiny Thor hammer sketch",
          "stylized blue tech sparks"
        ]
      },

      "illustrated_side": {
        "art_style": "bold comic-style illustration inspired by Marvel",
        "color_palette": "vibrant, high-contrast superhero palette",
        "hair": "same color as realistic half but stylized sharply",
        "eyes": "slightly exaggerated heroic emphasis",
        "background": "dynamic red-blue comic burst pattern",
        "decorations": {
          "elements": [
            "chibi Iron Man flying",
            "pixel-style Captain America",
            "small cartoon lightning bolts",
            "comic-style 'POW!' and 'WHOOSH!' text bubbles",
            "floating colorful Avengers symbols"
          ]
        }
      }
    },

    "aesthetic": {
      "overall_tone": "heroic, energetic, lightly vintage",
      "lighting_consistency": "perfectly matching the reference",
      "skin_texture_realism": "high",
      "blending_quality": "smooth transition with crisp tear edge"
    },

    "output": {
      "style": "hyper-realistic + Marvel comic fusion",
      "quality": "ultra-high-resolution",
      "filters": [
        "subtle analog film",
        "soft grain"
      ]
    }
  }
}
```

## 中文说明
此技能来自 GitHub 高星开源项目 [f/prompts.chat](https://github.com/f/prompts.chat)（⭐165,462），让 AI 扮演「Hyper-Realistic Marvel Comic Fusion Image Generation」角色，按照提示词中的指令进行交互。

## 技巧
- 可以根据自己的需求微调提示词中的具体要求
- 角色扮演类 skill 越具体，AI 的表现越精准
