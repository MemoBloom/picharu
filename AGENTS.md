# 项目协作入口

开始任务前先阅读 [README.md](README.md)、[DIRECTORY_GUIDE.md](DIRECTORY_GUIDE.md) 和对应模块文档。目录规范以 DIRECTORY_GUIDE.md 为准，文件用途及迁移位置见 docs/README.md 和 docs/FILE_INVENTORY.md。

- 新增文件按目录职责放置；当前主文档在 docs，导入工作资料在 references，原始 ZIP 在 archive/source-packages。
- 保留最新用户确认：20 工具仅为初期；架构支持模型迭代；AI 负责实现，人工负责架构与 evaluation。
- 按当前授权执行；Worker/GPU 推荐服务目前仅设计，后续明确授权前不把其设计写成运行服务。
- 公开 API 的字段与校验共享 packages/contracts；完整 Prompt 和密钥仅服务端可见。
- 移动文件必须同步链接、脚本、测试和文档索引；OpenAPI 在 docs/interfaces/openapi.json，由 npm run contracts:export 生成。
- 多人或多个 AI 同时工作时明确修改范围，保留他人有效变更，不以重写整个文件覆盖并发修改。
- 根据实际改动运行相关验证；报告时区分本地验证、云端联调、部署与真实效果 evaluation。
- Git 与 CI 遵循 docs/maintenance/GIT_AND_CI.md。后续任务按明确范围使用功能分支和小提交，提交前核对并行任务改动；推送前运行 npm run verify。remote 由用户提供，不自行创建远程仓库或更换地址。
