---
target: 系统下所有页面
total_score: 23
p0_count: 0
p1_count: 3
timestamp: 2026-06-24T07-08-25Z
slug: apps-web-src-pages-users-page-tsx
---
#### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | 邀请批量生成、注册保存、分页切换都缺少明确的就地状态反馈。 |
| 2 | Match System / Real World | 2 | 同一系统模块混用 `Users / Invites / Registration` 与中文导航，语言系统不统一。 |
| 3 | User Control and Freedom | 3 | 有分页、子导航与管理员转移取消路径，但缺少更轻量的撤销/重置路径。 |
| 4 | Consistency and Standards | 2 | 顶部导航、系统子导航、内容卡标题的语言和层级标准不一致。 |
| 5 | Error Prevention | 3 | 邀请数量有限制、已使用邀请码禁删、管理员转移要二次验证，基础防错是到位的。 |
| 6 | Recognition Rather Than Recall | 3 | 用户列表、邀请列表、注册配置都有可见标签，但注册页高级字段一次性暴露太多。 |
| 7 | Flexibility and Efficiency | 2 | 用户页缺搜索/过滤/批量路径，长列表扫描效率一般。 |
| 8 | Aesthetic and Minimalist Design | 3 | 整体克制、没有明显 AI 装饰噪音，但注册页信息密度失衡。 |
| 9 | Error Recovery | 2 | 表单有基础校验，但保存后的回执、失败后的恢复路径不够明确。 |
| 10 | Help and Documentation | 1 | `模式 / quota / Client Secret / OAuth Base URL` 等关键设置没有上下文帮助。 |
| **Total** |  | **23/40** | **Acceptable** |

#### Anti-Patterns Verdict

**LLM assessment**：这组系统页不算 AI slop。它避免了渐变字、伪玻璃、无意义装饰和营销化组件堆砌，整体是克制的产品后台风格。真正拉低质感的不是“像 AI”，而是“像半完成的后台”：语言系统不统一、层级太平、注册页把决策和高级配置一次性全摊开。

**Deterministic scan**：`detect.mjs` 对 `apps/web/src/pages/users-page.tsx` 与 `apps/web/src/components/users/user-table.tsx` 返回 `[]`，没有命中固定规则。说明当前问题主要是信息架构、认知负荷和交互节奏，不是它那套静态 slop 规则能直接抓到的类型。

**Visual overlays**：没有可用的用户可见 overlay。本轮尝试了 `chrome-devtools`，但 `http://localhost:9222/json/version` 无法连接，无法走 live overlay 注入链路。最终浏览器证据改用 Playwright 对 Storybook 中 `Pages/Users` 的 `users / invites / registration` 三个状态截图作为 fallback signal。

#### Overall Impression

基础是稳的，完成度不是。`用户` 和 `邀请` 已经有像样的后台骨架，但 `注册` 页明显还停在“把字段摆出来”的阶段；整个系统模块最需要的不是换皮，而是把语言、层级和决策顺序收紧。

#### What's Working

- 暗色基底和克制的边框体系是成立的。它不会抢任务注意力，做后台比花哨方案可靠得多。
- `用户 / 邀请 / 注册` 三个局部子页已经分开，信息架构方向是对的；至少没有把系统管理塞进一个巨大长页。
- 邀请页把“批量生成”与“列表管理”放在同一视图，且已有分页，日常操作路径比注册页成熟得多。

#### Priority Issues

- **[P1] 语言系统不统一**
  Why it matters: 后台界面最怕术语漂移。同一个模块里左侧是“用户 / 邀请 / 注册”，内容标题却是 `Users / Invites / Registration`，再叠加 `Passkeys / Client ID / Client Secret / Scopes`，会持续制造“这套界面还没收口”的感受，直接伤害信任。
  Fix: 把系统模块定成一套明确语言策略。若主界面面向中文 owner，就统一成中文标题与说明；确实要保留 OAuth 术语，也应使用“中文主标签 + 英文技术词副标”的方式，而不是整块混写。
  Suggested command: `$impeccable clarify /users`
  References: [users-page.tsx](/Users/ivan/.codex/worktrees/8ebe/cf-mail/apps/web/src/pages/users-page.tsx:124), [user-table.tsx](/Users/ivan/.codex/worktrees/8ebe/cf-mail/apps/web/src/components/users/user-table.tsx:549), [user-table.tsx](/Users/ivan/.codex/worktrees/8ebe/cf-mail/apps/web/src/components/users/user-table.tsx:919), [user-table.tsx](/Users/ivan/.codex/worktrees/8ebe/cf-mail/apps/web/src/components/users/user-table.tsx:1100)

- **[P1] 注册页把主决策和高级配置一次性摊开，认知负荷过高**
  Why it matters: 管理员在这个页面上并不是想“填写一份长表单”，而是想回答几个更高层的问题：这个渠道开不开、限额多少、OAuth 是否已配置。现在三个 provider 全量字段纵向铺开，导致核心决策被高级字段淹没。
  Fix: 每个 provider 先做成“摘要 + 展开配置”的两层结构。首层只显示 `模式 / 今日配额 / 是否已配置`；展开后再看 `Client ID / Secret / Scopes / Base URL`。保存动作应尽量靠近当前编辑区，或者做底部 sticky save bar。
  Suggested command: `$impeccable distill /users registration`
  References: [user-table.tsx](/Users/ivan/.codex/worktrees/8ebe/cf-mail/apps/web/src/components/users/user-table.tsx:1103), [user-table.tsx](/Users/ivan/.codex/worktrees/8ebe/cf-mail/apps/web/src/components/users/user-table.tsx:1110), [user-table.tsx](/Users/ivan/.codex/worktrees/8ebe/cf-mail/apps/web/src/components/users/user-table.tsx:1191), [user-table.tsx](/Users/ivan/.codex/worktrees/8ebe/cf-mail/apps/web/src/components/users/user-table.tsx:1272)

- **[P1] 系统子导航与主内容层级过于接近，定位感不够强**
  Why it matters: 当前顶部全局导航和左侧系统子导航都用了相近的按钮语言，用户需要先分辨“我是在跨模块导航，还是在系统内部切页”。这是纯粹的 extraneous load。
  Fix: 让系统子导航更安静、更像局部目录，而不是第二套主导航。可以减轻边框感、缩小按钮体量、加强 active 标识，并把当前子页标题与子导航 active 状态做更明显联动。
  Suggested command: `$impeccable layout /users`
  References: [users-page.tsx](/Users/ivan/.codex/worktrees/8ebe/cf-mail/apps/web/src/pages/users-page.tsx:146), [users-page.tsx](/Users/ivan/.codex/worktrees/8ebe/cf-mail/apps/web/src/pages/users-page.tsx:148)

- **[P2] 用户列表可扫描性不够，扩展到更多账号后会明显变慢**
  Why it matters: 当前用户页把 `昵称 / 用户名 / 创建时间 / 外部绑定 / passkeys / 状态 / 操作` 全部平铺在一个表里，但没有搜索、过滤、排序或主次压缩。12 个用户还能撑住，继续增长就会进入“只能靠眼睛逐行找”的状态。
  Fix: 为用户页增加搜索与角色/状态过滤；把 `创建于` 与 `更新于` 压成更次级的一行；当前管理员应有更稳定、更强的视觉锚点；非主动作考虑收进行内菜单。
  Suggested command: `$impeccable harden /users users-table`
  References: [user-table.tsx](/Users/ivan/.codex/worktrees/8ebe/cf-mail/apps/web/src/components/users/user-table.tsx:630), [user-table.tsx](/Users/ivan/.codex/worktrees/8ebe/cf-mail/apps/web/src/components/users/user-table.tsx:709)

- **[P2] 邀请与注册的操作反馈仍然过轻**
  Why it matters: `批量生成邀请码`、`删除邀请码`、`保存注册策略` 都是会改系统状态的动作，但当前页面上几乎没有明确的“进行中 / 成功 / 失败后怎么恢复”表达。静态界面看起来像是能点，但不够让人放心。
  Fix: 给这三类动作补齐按钮 loading、成功 toast 或内联确认、失败后的字段级或区块级错误提示。注册页尤其需要一个“上次保存于 xx:xx / 当前有未保存变更”的状态条。
  Suggested command: `$impeccable harden /users system-actions`
  References: [user-table.tsx](/Users/ivan/.codex/worktrees/8ebe/cf-mail/apps/web/src/components/users/user-table.tsx:923), [user-table.tsx](/Users/ivan/.codex/worktrees/8ebe/cf-mail/apps/web/src/components/users/user-table.tsx:1048), [user-table.tsx](/Users/ivan/.codex/worktrees/8ebe/cf-mail/apps/web/src/components/users/user-table.tsx:1313)

#### Persona Red Flags

**Alex (Power User)**
- 用户页没有搜索、过滤、批量操作；当成员数继续增长时，Alex 只能翻页加逐行扫描。
- 注册页三个 provider 全量展开，Alex 想快速确认“GitHub open / LinuxDO invite-only / Passkey invite-only”时，必须穿过一整页高级字段。
- 邀请页删除动作逐行分散在表格最右，缺少批量撤销或批量回收路径。

**Jordan (First-Timer)**
- `Users / Invites / Registration` 和中文侧栏并存，会让 Jordan 误以为它们是不同层级或不同产品残留。
- 注册页里的 `Client ID / Client Secret / Scopes / OAuth Base URL` 没有任何上下文说明；Jordan 不知道哪些是必填，哪些只是“如果要启用这个 provider 才需要”。
- 系统模块首页描述“用户、邀请与注册设置。”过于抽象，对第一次进入这里的人没有解释“我现在可以在这里做什么”。

**Sam (Accessibility-Dependent User)**
- 用户表格列很多，且右侧操作列距离主体信息太远；在高缩放或窄视口下，行内关系会变得更难跟踪。
- 注册页的 slider 数值依赖小尺寸数字和低对比轨道表达，读取与微调成本偏高。
- 局部导航和全局导航样式相近，Sam 在键盘线性导航时需要更强的区域区分才能快速建立页面结构。

#### Minor Observations

- `Passkeys` 一词在用户页仍是英文，但侧栏和页头都已中文化，这种半切换状态很伤完整度。
- 邀请页的“批量生成”区块已经够用了，但 `数量` 输入看起来像普通表单字段，不像高频控制，权重略低。
- 注册页三个 provider 卡片虽然已经纵向化，但卡片内部节奏几乎完全相同，读起来有轻微模板感。
- 用户页右侧操作列的按钮重复过多，视觉上像一整列“印章”，信息密度不高但注意力占用很大。
