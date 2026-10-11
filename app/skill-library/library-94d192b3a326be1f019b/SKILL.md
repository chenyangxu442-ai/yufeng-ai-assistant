---
name: library-94d192b3a326be1f019b
description: "职场领域的AI技能，提升职业竞争力与工作效率"
---

# timeline

> 来源：[f/prompts.chat](https://github.com/f/prompts.chat) ⭐165,462
> 搬运日期：2026-07-12
> 原作者：f, community contributors

## 适用平台
ChatGPT / Claude / Kimi / DeepSeek / 通义千问

## 使用方法
复制下面的提示词到 AI 对话框。

## 提示词

```
Objective: Construct a chronological sequence of events

1. **Identify the central point of the content**

    * Find explicit dates, for example, "January 15, 2024"; "2019"; or "last Tuesday"
    * Identify relative references, for example, "three months later", "the following year"
    * Note sequence words like "first", "then", "finally", "before", and "after"

2. **Identify what happened at each point**

    * Identify the action or occurrence
    * Note who was involved
    * Note the significance, if stated

3. **Convert events to specific dates when possible**

    * Use context clues to calculate relative dates
    * Mark uncertain dates with (?)
    * Preserve original phrasing when dates can't be determined

4. **Unless there is a strong reason not to, arrange events**

    * Place earliest events first
    * Group events with the same date/timeframe
    * Use relative markers ("Before X," "After Y") when exact sequence is known but dates aren't

5. **Cover the entire timeline of events presented on the page**

    * Comprehensiveness is important, so complete timelines with all information available on a webpage
    * Contextual accuracy is important, so don't add additional events to the timeline that aren't mentioned on the webpage

6. **Handling exceptions**

    Prioritize excellent content in your response. If you're unable to formulate a response that meets all criteria, you should
    * respond as best you can and
    * acknowledge any limitations or challenges you faced. For example, maybe there wasn't sufficient content on a webpage or the content wasn't compatible with a given request.

    Consider your proposed response objectively and rate it on a scale from 1-10. If you wouldn't give it a 10, either try to create a stronger response or consider acknowledging any limitations or challenges you faced. The score is just for your own purposes; don't share it with the user.

7. **Final response**

    If you have relevant info to share, your final response should follow standard writing guidelines, including:

    * Sentence case: titles, labels, and all other content should be displayed using sentence case (only proper nouns and the first letter of a string appear capitalized).
    * Favor simple sentences that use common words

    **Format the response as:**

    **Timeline**

    * **[Date/Timeframe]**: ${event_description}
    * **[Date/Timeframe]**: ${event_description}
    * **[Date/Timeframe]**: ${event_description}

    **Notes**

    * ${any_dates_marked_uncertain}
    * ${any_events_where_sequence_is_unclear}

8. **Follow-up questions**

    If you can think of a way you can help the user act on information shown in the response, conclude with one (at most two) sentences that offers this help. Frame it as a question so that a simple response like "yes please" might launch the next round.
```

## 中文说明
此技能来自 GitHub 高星开源项目 [f/prompts.chat](https://github.com/f/prompts.chat)（⭐165,462），让 AI 扮演「timeline」角色，按照提示词中的指令进行交互。

## 技巧
- 可以根据自己的需求微调提示词中的具体要求
- 角色扮演类 skill 越具体，AI 的表现越精准
