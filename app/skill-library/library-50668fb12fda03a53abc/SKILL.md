---
name: library-50668fb12fda03a53abc
description: "专注产品、照片、图像的AI技能"
---

# Transform the input product image into a professional commercial studio photograph

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
  "model": "nano-banana",
  "task": "image_to_image_product_enhancement",
  "objective": "Transform the input product image into a professional commercial studio photograph while preserving the exact product identity, geometry, proportions, stitching, texture, and material properties.",
  "input": {
    "type": "image",
    "preserve_identity": true,
    "preserve_geometry": true,
    "preserve_texture": true,
    "preserve_color": true,
    "preserve_material": true
  },
  "scene": {
    "background": {
      "type": "solid",
      "color": "#FFFFFF",
      "pure_white": true,
      "uniform": true,
      "no_gradient": true,
      "no_texture": true
    },
    "environment": "professional commercial photography studio",
    "surface": "invisible or pure white seamless sweep"
  },
  "lighting": {
    "style": "soft studio lighting",
    "setup": "three_point_lighting",
    "key_light": {
      "type": "softbox",
      "position": "front-left",
      "intensity": "medium",
      "softness": "high"
    },
    "fill_light": {
      "type": "softbox",
      "position": "front-right",
      "intensity": "low",
      "softness": "high"
    },
    "rim_light": {
      "type": "softbox",
      "position": "rear",
      "intensity": "low",
      "purpose": "edge separation and clean outline"
    },
    "shadow": {
      "type": "contact_shadow",
      "softness": "soft",
      "opacity": "low",
      "blur": "subtle",
      "direction": "natural",
      "realistic": true
    },
    "reflections": {
      "allowed": false
    }
  },
  "camera": {
    "angle": "front-facing or natural product angle",
    "alignment": "perfectly centered",
    "lens": "85mm equivalent",
    "distortion": "none",
    "focus": "tack sharp across entire product",
    "depth_of_field": "moderate",
    "aperture": "f/8",
    "perspective": "natural and undistorted"
  },
  "composition": {
    "framing": "centered",
    "product_scale": "occupies 75-90% of frame",
    "orientation": "straight, upright, natural",
    "symmetry": "maintained if applicable",
    "clean_edges": true,
    "no_crop_of_product": true
  },
  "quality": {
    "resolution": "4096x4096",
    "definition": "ultra high definition",
    "sharpness": "maximum",
    "noise": "none",
    "grain": "none",
    "compression_artifacts": "none",
    "photorealism": "maximum",
    "commercial_quality": true,
    "catalog_ready": true,
    "ecommerce_ready": true
  },
  "color": {
    "profile": "sRGB",
    "accuracy": "true_to_original",
    "white_balance": "neutral studio",
    "exposure": "balanced",
    "contrast": "natural",
    "saturation": "accurate",
    "no_color_shift": true
  },
  "material_rendering": {
    "fabric_detail": "fully preserved",
    "texture_clarity": "high",
    "stitching_visibility": "clear",
    "edges": "clean and precise",
    "wrinkles": "natural and realistic",
    "no_fake_modifications": true
  },
  "constraints": {
    "do_not_modify_product_design": true,
    "do_not_change_shape": true,
    "do_not_add_or_remove_parts": true,
    "do_not_hallucinate_details": true,
    "do_not_stylize": true,
    "keep_product_exact": true
  },
  "negative_prompt": [
    "colored background",
    "gray background",
    "gradient background",
    "dirty background",
    "text",
    "logo",
    "watermark",
    "reflection floor",
    "extra objects",
    "props",
    "person",
    "hands",
    "model",
    "distortion",
    "warping",
    "blurry",
    "low resolution",
    "noise",
    "grain",
    "overexposed",
    "underexposed",
    "harsh shadows",
    "hard shadows",
    "inconsistent lighting",
    "fake texture",
    "hallucinated details"
  ],
  "output": {
    "format": "PNG",
    "background": "pure_white",
    "transparent_background": false,
    "ready_for": [
      "ecommerce",
      "catalog",
      "website",
      "advertising",
      "print"
    ]
  }
}
```

## 中文说明
此技能来自 GitHub 高星开源项目 [f/prompts.chat](https://github.com/f/prompts.chat)（⭐165,462），让 AI 扮演「Transform the input product image into a professional commercial studio photograph」角色，按照提示词中的指令进行交互。

## 技巧
- 可以根据自己的需求微调提示词中的具体要求
- 角色扮演类 skill 越具体，AI 的表现越精准
