---
name: library-04191e402f936d9e6ec8
description: "专注提示词的AI技能"
---

# Information Gathering Prompt

> 来源：[f/prompts.chat](https://github.com/f/prompts.chat) ⭐165,462
> 搬运日期：2026-07-12
> 原作者：f, community contributors

## 适用平台
ChatGPT / Claude / Kimi / DeepSeek / 通义千问

## 使用方法
复制下面的提示词到 AI 对话框。

## 提示词

```
## *Information Gathering Prompt*

---

## *Prompt Input*
- Enter the prompt topic = ${topic}
- **The entered topic is a variable within curly braces that will be referred to as "M" throughout the prompt.**

---

## *Prompt Principles*
- I am a researcher designing articles on various topics.
- You are **absolutely not** supposed to help me design the article. (Most important point)
	1. **Never suggest an article about "M" to me.**
	2. **Do not provide any tips for designing an article about "M".**
- You are only supposed to give me information about "M" so that **based on my learnings from this information, ==I myself== can go and design the article.**
- In the "Prompt Output" section, various outputs will be designed, each labeled with a number, e.g., Output 1, Output 2, etc.
	- **How the outputs work:**
		1. **To start, after submitting this prompt, ask which output I need.**
		2. I will type the number of the desired output, e.g., "1" or "2", etc.
		3. You will only provide the output with that specific number.
		4. After submitting the desired output, if I type **"more"**, expand the same type of numbered output.
	- It doesn’t matter which output you provide or if I type "more"; in any case, your response should be **extremely detailed** and use **the maximum characters and tokens** you can for the outputs. (Extremely important)
- Thank you for your cooperation, respected chatbot!

---

## *Prompt Output*

---

### *Output 1*
- This output is named: **"Basic Information"**
- Includes the following:
	- An **introduction** about "M"
	- **General** information about "M"
	- **Key** highlights and points about "M"
- If "2" is typed, proceed to the next output.
- If "more" is typed, expand this type of output.

---

### *Output 2*
- This output is named: "Specialized Information"
- Includes:
	- More academic and specialized information
	- If the prompt topic is character development:
		- For fantasy character development, more detailed information such as hardcore fan opinions, detailed character stories, and spin-offs about the character.
		- For real-life characters, more personal stories, habits, behaviors, and detailed information obtained about the character.
- How to deliver the output:
	1. Show the various topics covered in the specialized information about "M" as a list in the form of a "table of contents"; these are the initial topics.
	2. Below it, type:
		- "Which topic are you interested in?"
			- If the name of the desired topic is typed, provide complete specialized information about that topic.
		- "If you need more topics about 'M', please type 'more'"
			- If "more" is typed, provide additional topics beyond the initial list. If "more" is typed again after the second round, add even more initial topics beyond the previous two sets.
				- A note for you: When compiling the topics initially, try to include as many relevant topics as possible to minimize the need for using this option.
		- "If you need access to subtopics of any topic, please type 'topics ... (desired topic)'."
			- If the specified text is typed, provide the subtopics (secondary topics) of the initial topics.
			- Even if I type "topics ... (a secondary topic)", still provide the subtopics of those secondary topics, which can be called "third-level topics", and this can continue to any level.
			- At any stage of the topics (initial, secondary, third-level, etc.), typing "more" will always expand the topics at that same level.
		- **Summary**:
			- If only the topic name is typed, provide specialized information in the format of that topic.
			- If "topics ... (another topic)" is typed, address the subtopics of that topic.
			- If "more" is typed after providing a list of topics, expand the topics at that same level.
			- If "more" is typed after providing information on a topic, give more specialized information about that topic.
	3. At any stage, if "1" is typed, refer to "Output 1".
		- When providing a list of topics at any level, remind me that if I just type "1", we will return to "Basic Information"; if I type "option 1", we will go to the first item in that list.
```

## 中文说明
此技能来自 GitHub 高星开源项目 [f/prompts.chat](https://github.com/f/prompts.chat)（⭐165,462），让 AI 扮演「Information Gathering Prompt」角色，按照提示词中的指令进行交互。

## 技巧
- 可以根据自己的需求微调提示词中的具体要求
- 角色扮演类 skill 越具体，AI 的表现越精准
