# Berkeley Navigator：Course Enrollment Copilot（前端 MVP）

面向 UC Berkeley 本科生的课程探索 Copilot 原型，用于早期可用性测试。
**独立学生项目，与 UC Berkeley 无隶属或背书关系**，界面中已常驻声明。

- 技术栈：Next.js 16（App Router）、React 19、TypeScript、Tailwind CSS 4
- 运行时依赖仅 `next` / `react` / `react-dom`；LLM 调用使用原生 `fetch`，未引入 SDK
- 界面文案为英文（面向 Berkeley 学生测试），本文档为中文

---

## 1. 快速开始

```bash
npm install
cp .env.example .env.local      # 默认 NEXT_PUBLIC_DATA_MODE=mock
npm run dev                     # http://localhost:3000
```

要求 Node.js ≥ 20.9。

### 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发模式 |
| `npm run build` / `npm run start` | 生产构建 / 启动 |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run check` | lint + typecheck + build |
| `npm run stub:retrieval` | 启动符合契约的本地 stub 检索服务（端口 8000，假数据） |

---

## 2. 数据模式

`NEXT_PUBLIC_DATA_MODE` 在**构建时**写入前端，修改后需重新 build / 重启 dev。

| 模式 | 数据来源 | 界面标识 |
|---|---|---|
| `mock`（默认，或变量缺失/取值非法） | 浏览器内预设模拟回答，不访问任何后端 | 顶部金色横幅 “Mock mode” + 每条回答 “Simulated answer” |
| `live` | `/api/chat` → 后端 `/api/retrieve` → 答案生成 | 顶部 “Live data”；每条回答标注来源类型 |

**Mock 模式原则**：不包含任何 Berkeley 课程事实（先修课、学分、开课学期、政策）。所有“事实”位置均为占位文本，说明 live 模式下会展示什么。示例来源链接指向真实的官方首页（Academic Guide、Class Schedule）及学生论坛，并标注为 “Sample source”。

Mock 测试辅助：问题中包含 `#error` 模拟请求失败；包含 `#empty` 模拟无结果。

### 在 live 模式下本地联调（无需真实后端）

```bash
npm run stub:retrieval                       # 终端 1：stub 后端 :8000
# .env.local:
#   NEXT_PUBLIC_DATA_MODE=live
#   RETRIEVAL_API_BASE_URL=http://localhost:8000
npm run dev                                  # 终端 2
```

`STUB_MODE=error` 让 stub 始终返回 HTTP 500；`STUB_MODE=empty` 返回空结果。

---

## 3. 架构

```
Chat UI (client)
  └─ ChatService 接口 ── mock: mockChatService（浏览器内）
                      └─ live: POST /api/chat（Next.js 服务端）
                              ├─ 1. Retrieval service   lib/api/retrievalClient.ts → 后端 POST /api/retrieve
                              ├─ 2. 归一化               lib/api/normalize.ts（来源去重、编号 S1…、分类）
                              └─ 3. Answer generation   lib/server/generation/
                                     ├─ llm.ts          有 ANTHROPIC_API_KEY 时：基于证据生成 + 引用校验
                                     └─ evidenceOnly.ts 无 key 或 LLM 失败时：原样展示检索证据，不做 AI 解读
```

三层分离：UI 只依赖结构化的 `Answer` 对象（`lib/types/message.ts`），不关心来源；检索只返回证据，不假设其为可直接展示的回答；生成层负责组织答案。

### 为什么检索请求走 Next.js 服务端

- 后端地址与密钥只存在于服务端环境变量，不进入浏览器
- 后端无需配置 CORS
- 答案生成必须在服务端进行（保护 LLM key）

### 答案分层（防止把未经支持的信息当作官方事实）

| 层级 | 来源要求 | 视觉标识 |
|---|---|---|
| Official information | 至少引用 1 个 `official` 类型来源 | 实线左边框 |
| Student insights | 至少引用 1 个 `student` 类型来源 | 点线左边框 |
| Other retrieved information | 检索到但来源类型未标注 | 双线左边框 |
| AI interpretation / How this fits your profile | AI 生成，不含引用 | 虚线左边框 |

**引用校验（`lib/server/generation/validate.ts`）**：LLM 输出中不存在于检索结果的来源 ID 一律丢弃；类型不符的陈述（如引用学生来源却放在 Official）被移除；移除数量会作为 “Notes and limits” 告知用户；课程选项只能来自检索结果。来源 URL 仅接受 http(s)。

---

## 4. 后端集成要求

### 4.1 环境变量（服务端，均不会暴露给浏览器）

| 变量 | 必需 | 说明 |
|---|---|---|
| `RETRIEVAL_API_BASE_URL` | live 模式必需 | 例如 `http://localhost:8000`，前端调用 `{base}/api/retrieve` |
| `RETRIEVAL_API_KEY` | 否 | 若设置，以 `Authorization: Bearer` 发送 |
| `RETRIEVAL_API_TIMEOUT_MS` | 否 | 默认 15000 |
| `ANTHROPIC_API_KEY` | 否 | 设置后启用 AI 答案生成；否则为 evidence-only |
| `LLM_MODEL` | 否 | 默认 `claude-sonnet-5-5` |
| `LLM_TIMEOUT_MS` | 否 | 默认 45000 |

### 4.2 请求（前端发送）

```json
{
  "query": "What should I explore after CS 61B?",
  "student_profile": {
    "academic_year": "Sophomore",
    "majors": ["Data Science"],
    "completed_courses": ["CS 61A", "CS 61B"],
    "interests": ["Machine Learning"]
  },
  "limit": 5
}
```

说明：
- 未填写的 `academic_year` 发送为空字符串 `""`，列表字段发送为 `[]`
- 课程代码会被规范化（`cs61a` → `CS 61A`）
- `constraints` 不发送给检索服务（契约示例中未包含），仅用于答案生成
- 追问未提及课程代码时，查询末尾会追加上一轮课程作为上下文，例如 `"Is it hard? (follow-up about CS 189)"`（契约中无对话字段）

### 4.3 响应（需与后端确认的字段形态）

契约示例中 `facts` 与 `sources` 为空数组，具体结构尚未确定。前端目前兼容以下形态：

```jsonc
{
  "results": [{
    "course_id": "CS 189",
    "course_title": "Introduction to Machine Learning",
    "matched_reason": "…",
    "facts": [
      "纯字符串事实",
      { "text": "…", "source_id": "cat-1" },           // 也接受 fact / content、source_ids[]、source_index
    ],
    "sources": [
      { "id": "cat-1", "title": "…", "url": "https://…", "type": "official" }  // 也接受 source_id、name、source_type、retrieved_at
    ]
  }],
  "limitations": ["…"]
}
```

**请后端确认以下事项**：

1. **来源类型标签**：`type` 含 official / catalog / registrar / department / schedule / guide → 官方；含 student / review / forum / reddit → 学生；其余或缺失 → “类型未标注”。前端**不会**根据域名推断官方身份（许多 berkeley.edu 子域为学生内容）。建议后端直接使用 `"official"` / `"student"`。
2. **事实与来源的关联**：建议每条 fact 显式给出 `source_id`。若未给出且该课程只有 1 个来源，则默认关联该来源；有多个来源时该事实无引用，归入 “Other retrieved information”。
3. `results` 必须为数组，否则视为契约不匹配（返回 502）。
4. 错误处理：网络不可达或超时 → “service is not responding”；非 2xx 或格式错误 → “unexpected response”。

---

## 5. 功能清单

- **Student Profile**：首次访问引导填写（全部可跳过）；侧栏/移动端顶栏可编辑；仅存于 localStorage；表单提示不要填写姓名、学号等个人信息
- **Chatbox**：自由输入、发送按钮、Enter 发送 / Shift+Enter 换行（兼容中文输入法组字）、加载状态、多轮对话、错误提示与 “Try again”、空状态、4 个示例问题、回答后的 “Ask next” 追问建议、1000 字符上限
- **Answer**：直接回答、课程选项、基于 profile 的解释、分层证据、编号引用（新标签页打开原始来源）、限制说明、来源列表
- **Feedback**：Helpful / Not helpful / Report incorrect info（可选文字说明），按消息绑定；界面明确提示 “Kept on this page only. Not sent to a server.”
- **New session**：主持人可在受试者之间清空对话，或连同 profile 一起清空并回到引导页
- **可访问性**：语义化结构、键盘可操作、可见焦点、`aria-live` 加载状态、原生 `<dialog>`、尊重 reduced-motion
- **响应式**：≥1024px 显示侧栏；移动端（已在 390px 宽验证）profile 收为顶栏，无横向滚动

### 可用性测试观察点（无埋点）

未实现任何数据采集或分析埋点。研究者可通过现场观察获取：是否理解界面、是否完成 profile、是否自主提问、是否追问、是否点击引用、是否使用反馈。

---

## 6. 目录结构

```
src/
  app/
    api/chat/route.ts            live 模式服务端编排：检索 → 生成
    layout.tsx, page.tsx, globals.css, icon.svg
  components/
    NavigatorApp.tsx             页面状态编排
    layout/AppHeader.tsx, ProvenanceLegend.tsx
    onboarding/StudentProfileForm.tsx, ChipInput.tsx, ProfileSummary.tsx
    chat/ChatWindow.tsx, ChatMessage.tsx, ChatInput.tsx, SuggestedQuestions.tsx,
         SourceCitation.tsx, MessageFeedback.tsx
    ui/Button.tsx, Dialog.tsx, Icon.tsx
  lib/
    api/retrievalClient.ts       类型化检索客户端（服务端）
    api/normalize.ts             检索响应归一化
    chat/chatService.ts          live 实现 + 模式选择
    chat/mockChatService.ts      mock 实现
    chat/types.ts                ChatService 接口
    server/generation/           答案生成：llm / evidenceOnly / validate
    server/retrievalQuery.ts     追问上下文拼接
    storage/profileStore.ts      localStorage profile 存储
    types/course.ts, profile.ts, message.ts
    config.ts, courseCodes.ts, profileSanitize.ts
scripts/stub-retrieval-server.mjs
```

相对建议结构的调整：增加 `lib/server/`（服务端专用代码与客户端隔离）、`lib/api/normalize.ts`（后端字段形态未定，集中兼容）、`components/ui/`（共享基础组件）。

---

## 7. 已知限制

- **LLM 路径未经真实 API 验证**：本环境无 API key。请求格式、响应解析、引用校验与失败回退已通过模拟响应测试；接入真实 key 后需实测答案质量与延迟
- **未与真实后端联调**：仅使用符合契约的 stub 验证；`facts` / `sources` 的最终结构需与后端确认（见 4.3）
- 对话与反馈仅存于页面内存，刷新即清空；profile 存于 localStorage
- 无流式输出（回答整体返回）
- 课程代码识别为启发式规则，可能漏识别非常规写法
- 未实现自动化测试套件（未引入测试框架依赖）；已执行的检查见交付说明
- 未支持深色模式
