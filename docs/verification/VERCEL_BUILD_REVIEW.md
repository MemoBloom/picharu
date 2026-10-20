# Vercel 构建故障审查

日期：2026-10-20。目标：picjp-web 的 main 分支；失败部署的源码提交为 `5af9c60`。范围是 Web/API 的安装、类型检查与生产构建，不表示完成全部后端审计、云端联调或模型 evaluation。

## 发现与原因

**[P1] Web workspace 未声明自己的 TypeScript 构建依赖，导致 Vercel 构建失败。** `apps/web/package.json` 原来只有运行依赖，`typescript`、`@types/react`、`@types/react-dom`、`@types/node` 仅在仓库根的 devDependencies 中。只安装 Web workspace 时，不包含根项目的开发依赖；本地根目录完整安装和原 CI 因此未暴露此问题。

用户提供的 Vercel 日志显示：安装 86 个包，Next.js 16.4.2 编译成功，然后在 Running TypeScript 阶段报告缺少 `typescript` 和 `@types/react`；末尾 Lifecycle script build failed 是汇总结果。日志中的 cache-dir、sharp install-scripts 警告不是这次终止构建的直接原因。

在隔离的 `5af9c60` 源码副本中，以下操作同样安装 86 个包，并复现相同错误：

```sh
# 仓库根目录；隔离副本，无云凭据
npm ci --workspace @picjp/web --include-workspace-root=false --offline --ignore-scripts --no-audit --no-fund
cd apps/web
CI=1 NEXT_TELEMETRY_DISABLED=1 npm run build
```

这证明 workspace 依赖声明缺口足以触发故障；不推断 Vercel 控制台未提供的安装开关或环境变量值。

## 修复

- Web 自己声明四个构建开发依赖，保留根工程工具所需声明；同步根 package-lock.json，未升级依赖版本。
- `apps/web/vercel.json` 固定框架、安装和构建命令；从 `apps/web` 回仓库根执行 `npm ci --include=dev --workspaces --include-workspace-root`。即使安装环境为 NODE_ENV=production，也明确安装开发依赖。
- CI 的 Verify job 从 `apps/web` 读取并执行同一 installCommand，安装阶段设置 NODE_ENV=production，再执行完整 verify。Next 的类型检查保持开启。

## 本地验证

| 场景 | 结果 |
|---|---|
| 修复前隔离源码，只安装 Web workspace | 86 个包；编译成功，类型依赖缺失，build 退出 1 |
| 仅应用本次依赖/配置修复，再只安装 Web workspace | 90 个包；类型检查及全部 36 项页面/路由生成通过 |
| 从 apps/web 执行 vercel.json 的安装命令，NODE_ENV=production 且 npm_config_omit=dev | include=dev 正确覆盖省略设置；完整安装成功 |
| 上述安装后，在隔离源码执行 npm run verify | OpenAPI、类型检查、84 项测试、90 项 PGlite SQL 断言、Next.js 生产构建全部通过 |
| CI YAML 解析 | 成功；Verify 使用部署安装命令，独立 PostgreSQL job 保留 |

本次隔离验证基于已提交的 `5af9c60` 加本次修复，未带入现有未提交前端改动。测试使用本机 Node.js 26.8.1；GitHub CI 基线仍为 Node.js 22。未重新运行与此依赖变更无关的原生 PG 并发测试，未访问真实支付/存储/模型服务。

## Vercel 重部署

1. 推送包含修复的提交；Vercel 重部署必须选择该提交，重试旧的 `5af9c60` 不会取得新文件。
2. Root Directory 为 `apps/web`；允许访问 Root Directory 外的同仓库源码。Install Command / Build Command 使用 vercel.json；若控制台保留了自定义命令，确认与文件一致。
3. Node.js 使用项目基线 22.x。首次重部署可不使用旧 Build Cache。
4. 构建日志应完成 Running TypeScript 和页面生成。部署后再检查 `/api/health` 与 `/api/tools`，然后进行真实 Supabase/R2/Stripe 测试环境联调；GENERATION_ENABLED 保持 false。

这里的结果是本地复现与修复验证；修复后的 GitHub runner、Vercel 云构建和线上业务行为仍需推送后确认。

参考：[Vercel 构建设置](https://vercel.com/docs/builds/configure-a-build)、[Vercel workspace 依赖声明要求](https://vercel.com/docs/monorepos)、[npm ci 的 include/omit 与 workspace 规则](https://docs.npmjs.com/cli/commands/npm-ci/)。
