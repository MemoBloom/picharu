# Git、版本与流水线规范

更新：2026-10-20。状态：已在当前 picjp-workspace 根目录初始化本地 Git，主分支 main；本轮建立首次代码基线、配置本地 pre-push 和 GitHub Actions。remote 由用户稍后添加，未推送 GitHub，未创建远程仓库、分支保护、云部署或正式版本标签。

## 1. 管理范围

整个项目共用一个仓库，包含现有前端页面、Web API、共享契约/配置、数据库迁移、测试、脚本和文档；不是仅在 server 子目录建立仓库。Worker/GPU 推荐服务仍遵循原授权边界，设计状态不因进入 Git 而改变。

.gitignore 排除 node_modules、.next、真实 .env、.vercel 本地配置、测试输出、日志和常见密钥文件。只提交不含凭据的 .env.example。原始 ZIP 和当前必要的站点图片作为项目资料纳入基线，不提交用户照片或模型权重。

## 2. 日常版本管理

- main 保存可验证基线。后续功能在 feat/<主题>、修复在 fix/<主题>、工程调整在 chore/<主题> 分支完成。
- AI 按明确任务范围开发、验证和提交；提交前检查 git diff 与文件归属，不能将其他并行任务的未完成改动随意混入自己的提交。
- 首次提交是当前整个工作区的快照，包含此前其他任务已有的前端代码；它不等于全部页面或模型效果已通过 evaluation。
- 建议提交消息使用 feat:、fix:、docs:、test:、chore: 前缀，说明具体问题或行为。提交历史提供版本追溯，不依赖文件名 final2 等副本。
- 推送和合并不会由本地后台程序定时执行。已授权任务可由 AI 完成对应提交；GitHub 检查在推送/PR 后触发，正式版本流程见下文。

## 3. 统一检查与本地 hook

Node 版本基线写在 .node-version（22）。安装依赖后：

```sh
npm ci
npm run verify
npm run hooks:install
```

verify 依次执行：

1. contracts:check：校验已提交 OpenAPI 与实际 Schema/HTTP 描述一致，检查不改写文件。
2. typecheck：TypeScript 类型检查。
3. test：契约、HTTP 业务、图片与 R2 签名测试。
4. test:db：临时 PGlite 中运行真实 SQL 迁移、事务与权限检查。
5. build：现有 Next.js 应用的生产构建。

本机已配置 core.hooksPath=.githooks，pre-push 自动运行 verify；新 clone 的开发环境需执行 hooks:install，Git 不会自动启用仓库中的 hook。安装脚本只修改本仓库配置，遇到其他已配置的 hooksPath 会拒绝覆盖。原生 PostgreSQL 并发另由 CI 独立执行，不要求每位开发者本机常驻数据库。

## 4. GitHub CI

[ci.yml](../../.github/workflows/ci.yml) 在 main push、目标为 main 的 PR 更新以及手动触发时运行，也供版本工作流复用：

| Job | 检查 |
|---|---|
| Verify | Node 22、npm ci、npm run verify |
| PostgreSQL concurrency | PostgreSQL 17 临时容器、真实独立连接竞态测试 |

数据库只暴露临时 Unix socket，不开放 TCP 端口，使用合成 Auth/套餐/资金 fixture；不接真实 Supabase、不读取生产 .env。脚本只允许 OS 临时目录下 picjp-* /socket，解析真实路径后检查，拒绝任意 socket、路径逃逸和 TCP。测试创建随机数据库并清理，CI 最后删除容器。

Actions 固定官方提交 SHA，CI 默认只有 contents:read；不需要 Supabase、Stripe、R2 或 GPU 密钥。GitHub Actions 依赖更新由 Dependabot 提 PR，不自动合并。CI 检查不代表真实云端登录、付款、图片生成或效果评价通过。

## 5. 正式版本标签

[version.yml](../../.github/workflows/version.yml) 提供手动触发的 Version tag 流水线：

1. 在 GitHub Actions 选择 Version tag，分支选择 main。
2. 输入版本号，例如 0.1.0（不含 v）。
3. 工作流验证分支/版本格式，并对该提交完整运行上述两个 CI job。
4. 全部成功后自动创建并推送注释标签 v0.1.0；标签已存在时拒绝覆盖。

只有打标签的 job 获得 contents:write。该流程自动化检查和标签创建；不会每次提交擅自递增版本，不发布 npm 包、不创建 GitHub Release、不修改 package.json 或执行 Vercel 部署。标签是整个仓库的交付标识，模块 package.json 版本及 HTTP contract_version 分别维护。按变更语义选 major/minor/patch，不因实现修复随意升级接口主版本。

## 6. 用户添加 remote 后

在本项目根目录执行，先将 OWNER/REPOSITORY 替换为实际仓库地址：

```sh
git remote add origin https://github.com/OWNER/REPOSITORY.git
git push -u origin main
```

第一次推送会自动执行本地 pre-push 检查；成功上传后 GitHub 才能读取工作流并运行 CI。当前没有配置或测试你的远程身份、权限与账单，不声称远程流水线已运行。

建议创建空的私有仓库，避免初始化 README/license 造成无共同历史。若远端已有内容，先 fetch、比较再合并，不直接 force push。GitHub 首轮检查结束后，在仓库规则中要求 PR 合并及 Verify、PostgreSQL concurrency 两个检查成功；代码文件本身无法替你启用远程分支规则。

Vercel 自动预览/部署需另行连接 GitHub 仓库、配置环境并验证；此流水线仅做测试与版本标记，不部署云服务。[GitHub 工作流参考](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)、[Vercel GitHub 集成](https://vercel.com/docs/git/vercel-for-github)。

## 7. 本轮验证与限制

本地 verify 已通过：OpenAPI 一致、类型检查、84 项测试、90 项 SQL 断言、现有前端及 API 生产构建。跨平台临时目录防护已在本机隔离 PostgreSQL 17 中通过103项并发断言；测试实例已停止。3份Actions/Dependabot YAML、8段工作流shell与pre-push语法已检查；候选提交文件经过敏感文件名和常见密钥模式检查，未发现匹配项。GitHub Ubuntu/Docker runner 和实际标签推送需要添加 remote 并上传后验证。本地 Node 为26，CI固定Node22；本地成功不冒充远程Node22 runner已运行。
