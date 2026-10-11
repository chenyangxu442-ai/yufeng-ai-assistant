---
name: library-f795a57775834a8237f5
description: "生活领域的AI技能，改善日常品质与决策能力"
---

# berre

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
  "reference": {
    "face_identity": "${face_identity:uploaded reference image never change face and hair}",
    "identity_lock": true,
    "face_preservation": "100% identical facial structure, proportions, skin texture, eye shape, lips, nose, brows, moles, and natural expression"
  },
  "subjects": [
    {
      "type": "${subject1_type:young woman}",
      "role": "foreground subject",
      "expression": "soft confident smile",
      "gaze": "looking directly at the camera",
      "pose": {
        "position": "standing very close to the male subject",
        "interaction": "leaning slightly toward him in a casual selfie pose"
      },
      "hair": {
        "color": "dark brown",
        "style": "sleek high ponytail"
      },
      "makeup": {
        "style": "natural glam",
        "details": [
          "even glowing skin",
          "subtle contour",
          "soft blush",
          "defined brows",
          "natural pink lips"
        ]
      },
      "outfit": {
        "clothing": "black fitted short-sleeve top",
        "style": "sporty casual"
      }
    },
    {
      "type": "${subject2_type:Lionel Messi}",
      "role": "secondary subject",
      "expression": "relaxed smile",
      "gaze": "looking at the camera",
      "features": {
        "beard": "short, well-groomed full beard"
      },
      "hair": {
        "color": "brown",
        "style": "short, modern styled, slightly messy on top"
      },
      "outfit": {
        "clothing": "Inter Miami pink home football jersey",
        "details": [
          "Inter Miami heron logo visible on chest",
          "adidas logo visible",
          "sponsor logo visible",
          "athletic fit"
        ]
      }
    }
  ],
  "environment": {
    "location": "football stadium",
    "background_elements": [
      "large cheering crowd",
      "stadium seating filled with fans",
      "players and staff visible in the distance",
      "night sky with stadium floodlights"
    ]
  },
  "lighting": {
    "type": "stadium lighting",
    "characteristics": [
      "bright overhead lights",
      "even illumination on faces",
      "slight highlights on skin",
      "realistic night-time contrast"
    ]
  },
  "photography_style": {
    "style": "real-life selfie photography",
    "camera_look": "smartphone camera",
    "depth_of_field": "moderate depth of field with slightly blurred crowd",
    "mood": "excited, celebratory, candid"
  },
  "render_quality": {
    "realism": "ultra-photorealistic",
    "detail_level": "high",
    "Aspect Ratio": "4:5",
    "skin_texture": "natural and realistic",
    "resolution": "high resolution",
    "color_grading": "true-to-life colors with stadium vibrancy"
  }
}
```

## 中文说明
此技能来自 GitHub 高星开源项目 [f/prompts.chat](https://github.com/f/prompts.chat)（⭐165,462），让 AI 扮演「berre」角色，按照提示词中的指令进行交互。

## 技巧
- 可以根据自己的需求微调提示词中的具体要求
- 角色扮演类 skill 越具体，AI 的表现越精准
