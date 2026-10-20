# 项目目录与文件管理规范

更新：2026-10-20。适用范围：整个 picjp-workspace，包含人工和 AI agent 新建、修改、移动的文件。项目入口为 [README](README.md)，完整文档导航见 [docs/README](docs/README.md)，逐文件用途见 [文件清单](docs/FILE_INVENTORY.md)。

## 1. 目录结构

```text
picjp-workspace/
├── README.md                   项目入口、当前状态、运行命令
├── DIRECTORY_GUIDE.md           本规范
├── AGENTS.md                    AI 协作入口，引用本规范
├── .github/                     CI、版本标签、PR 模板与 Actions 依赖更新
├── .githooks/                   可安装的本地 pre-push 检查
├── .node-version               CI/开发 Node 版本基线
├── .gitattributes              跨平台文本换行与二进制标记
├── package.json                npm workspaces 与统一命令
├── package-lock.json           根依赖锁文件
├── tsconfig.json               全局 TypeScript 配置
├── vitest.config.ts            测试配置
├── .env.example                环境变量名与安全示例
├── .gitignore                  忽略依赖、产物、密钥等
├── apps/
│   └── web/                    现有 Next.js 应用；前端与 Web API 共用
│       ├── src/app/            页面、布局、Route Handlers
│       │   └── api/[...path]/route.ts
│       └── src/server/         仅服务端的业务与云服务适配
├── packages/
│   ├── contracts/              模块字段、Zod 校验、共享类型
│   ├── tool-config/            初期 20 工具目录与参数规则
│   └── prompts/                服务端 Prompt 与推荐资料
├── supabase/migrations/        数据库结构、权限、事务 RPC
├── scripts/                    契约导出、独立数据库验证等命令脚本
├── tests/                      自动化契约、业务、媒体及适配器测试
├── docs/
│   ├── README.md               文档导航与阅读顺序
│   ├── FILE_INVENTORY.md       文件用途清单
│   ├── product/                当前需求基线与项目目标
│   ├── planning/               模块、milestone 与 AI 执行计划
│   ├── interfaces/             统一接口说明与生成的 OpenAPI
│   ├── architecture/           架构论证及 Worker/GPU 服务设计
│   ├── backend/                Web 后端实现、数据与配置说明
│   ├── research/               选型调查、协议核查及对应证据
│   ├── verification/           已执行验证和未验证范围
│   └── maintenance/            目录迁移与维护记录
├── references/
│   ├── product/                导入产品资料的工作副本
│   └── technical/              导入技术资料的工作副本
└── archive/source-packages/    两份原始 ZIP，保留来源
```

node_modules、apps/web/.next、*.tsbuildinfo 等为本地依赖或构建产物，不属于业务源码和文档目录。现有产物保留在本机并通过 .gitignore 排除；整理目录不等于删除依赖。

## 2. 文件放置规则

| 内容 | 放置位置 | 说明 |
|---|---|---|
| 首页、工具页、工作台、登录与支付页面 | apps/web/src/app/ | 在现有 Next.js 应用内开发，不另建第二套 Web 应用 |
| 页面复用组件 | apps/web/src/components/ | 当前已有页面和组件实现 |
| 浏览器 API 客户端与认证辅助 | apps/web/src/lib/ | 当前已有客户端和认证辅助 |
| Web 业务逻辑、密钥、云 SDK 调用 | apps/web/src/server/ | 不能由浏览器组件导入 |
| HTTP 入口 | apps/web/src/app/api/ | 保持入口薄，业务放 server；重构路由前保证既有公开协议兼容 |
| 跨模块请求、响应、校验 Schema | packages/contracts/src/ | 前后端共用，禁止复制出多份互不一致的定义 |
| 工具 ID、参数与能力配置 | packages/tool-config/src/ | 新效果优先配置化；20 是初期目录，不是永久上限 |
| 完整执行 Prompt | packages/prompts/src/ | 仅服务端使用，禁止导入浏览器 bundle 或公开完整内容 |
| 数据库变更 | supabase/migrations/ | 唯一的数据库结构和 RPC 迁移来源 |
| 可重复开发命令 | scripts/ | 执行入口登记在根 package.json，不散落根目录 |
| 自动化测试 | tests/ | 与运行代码区分；外部服务替身限于测试 |
| 当前规范、设计、实施说明 | docs 对应分类 | 每个主题优先维护现有主文档 |
| 调研与历史候选 | docs/research/ | 标注日期、来源、结论适用范围及替代文档 |
| 临时下载、一次性调查/迁移脚本 | 操作系统临时目录 | 不能把临时内容当正式依赖；需要复现的证据另存到 research/verification |
| 测试照片、评测样本、模型权重 | 不直接放入源码目录 | 获得数据使用授权后再设计专用存储与访问方式；不提交用户照片或大权重 |

apps/worker、apps/jev-service 目前不存在；Worker 和 GPU 推荐服务仍为设计状态。未来用户明确授权实现后，再按模块边界创建，不能为了目录整齐提前填入假服务。CI 已位于 .github/workflows；其他部署配置和评测数据目录按实际建设再建立，不以空目录表示已完成。

## 3. 命名与路径

- 新建目录用小写 kebab-case，如 tool-config；新增 TypeScript 模块优先 kebab-case.ts，React 组件使用 PascalCase.tsx；Next.js 约定的 page.tsx、layout.tsx、route.ts 等保持框架名称。
- 正式文档正文使用中文，文件名用 ASCII。保留现有已稳定的 UPPER_SNAKE_CASE.md 文档名；新规范/主文档沿用此格式，不建立 final、final2、最新版 等文件。
- 调查或维护快照需要区分日期时使用 YYYY-MM-DD；当前版本号写在文档内容或协议中，不为每次修订复制整份文件。
- 新数据库迁移使用唯一的 UTC 时间戳前缀，例如 YYYYMMDDHHMMSS_description.sql。现有已建迁移文件保留名称；迁移一旦应用到共享环境，通过追加迁移修改，不重写已执行历史。
- Markdown 文件之间使用相对链接，便于本机和未来 GitHub 浏览；对话中提供本地文件时使用绝对路径。
- 文件树、命令和代码中的仓库路径以项目根目录为起点，例如 docs/interfaces/openapi.json；移动文件后同时修复链接、脚本、测试和索引。
- 不移动 apps/packages 源码来满足文档分类；源码目录由运行与依赖边界决定。

## 4. 文档与契约的权威来源

| 问题 | 优先查阅 |
|---|---|
| 用户已确认的范围 | 最新用户决定，以及 docs/product/BASELINE_REQUIREMENTS.md |
| 整体目标 | docs/product/PROJECT_UNDERSTANDING.md |
| API 字段和校验 | packages/contracts/src/index.ts |
| HTTP 行为、认证、状态、幂等语义 | docs/interfaces/INTERFACE_SPEC_V1.md，并与实现核对 |
| 可导入的 HTTP 契约 | docs/interfaces/openapi.json，由导出脚本生成 |
| 实际 Web 实现和上线边界 | apps/web、SQL migration、docs/backend 与验证记录 |
| 后续 Worker/GPU 架构 | docs/architecture 中对应设计；设计不代表运行能力 |
| 优先级和 milestone | docs/planning/DEVELOPMENT_ROADMAP.md |
| 旧资料来源 | references；原始附件在 archive/source-packages |

发现 Schema、协议、代码、设计不一致时，记录具体差异并在对应修改中同步，不能通过忽略其中一份来声称完成。references 中的导入资料已有前期范围同步修订，属于工作副本，并非与原始 ZIP 逐字一致；与当前决定冲突时不作为新的实现依据。原始 ZIP 不覆盖、不重新打包为“原件”。

OpenAPI 禁止手工维护生成内容：先改实际 Schema/HTTP 注册，再运行 npm run contracts:export 并检查差异。迁移或移动后不得同时保留多份宣称当前有效的 OpenAPI。

## 5. 状态、证据与协作

正式设计和实施文档开头写明更新日期、状态、范围及未完成内容。使用“设计中、已实现待联调、已验证、已部署、历史研究”等明确表述；通过本地测试不等于线上可用，模型调查不等于效果 evaluation 通过。

每项 AI 任务明确文件/模块所有权，不同时覆盖共享文件。修改前阅读当前文件，保留其他任务的有效更改。优先在已有主题文档更新，不创建重复的平行主文档。前端可以消费共享契约，不能把服务端 Prompt、service role、R2 或 Stripe 密钥打入浏览器。

新增、移动、归档文件时：

1. 确认应放置的目录和当前主文档，检查重名与引用。
2. 修改实际文件；保留来源与必要迁移映射，不擅自删除资料。
3. 更新 docs/README.md 和受影响的文件清单；跨目录移动同步所有引用。
4. 根据改动运行相关检查。纯文档检查链接；契约导出路径变化运行导出、契约测试及类型检查；运行代码变更再执行相应构建/业务检查。
5. 记录已完成、未验证和外部依赖，避免把规划中的模块标记为完成。

## 6. 环境与版本管理

- 根目录仅保留入口、规范和项目级配置；业务设计文档不继续堆放根目录。
- 全仓 npm workspaces，使用根 package-lock.json；不要为子 workspace 随意生成独立锁文件。
- .env.example 只保存变量名和安全示例。真实本地 Web 配置放 apps/web/.env.local；云端配置进入平台环境变量，禁止提交密钥。
- node_modules、.next、coverage、*.tsbuildinfo、真实 .env 文件不纳入源码版本管理；测试报告若需要留存，将经过脱敏的结论放 docs/verification。
- 本地 Git 已初始化，主分支 main；remote 待用户添加。GitHub Actions、本地 pre-push 和版本标签规则见 [Git 与流水线规范](docs/maintenance/GIT_AND_CI.md)。远程分支保护、CI 实跑和 Vercel 部署需接入远程后验证。
