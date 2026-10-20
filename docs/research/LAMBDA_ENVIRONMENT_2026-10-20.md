# Lambda 推荐服务器只读核查

时间：2026-10-20，首次资源快照10:14:58（Asia/Shanghai，远端报告UTC 02:14:58），随后追加源码和托管条件核查。状态：已按用户明确授权加载SSH身份、连接并只读核查；未部署、安装、运行模型、写工作空间或scp文档。硬件空闲情况只代表观察时刻，不是资源预留。

## 服务器与工作空间

| 项目 | 实测 |
|---|---|
| SSH目标 | ubuntu@170.9.234.83；使用已有known_hosts严格校验 |
| 工作空间 | /data01/kanzhi/picjp-jev-server，已存在、可写、为空 |
| 系统 | Linux 6.8.0-87-generic，x86_64，glibc 2.35 |
| CPU/内存 | 240逻辑CPU；约1.73TiB内存；约1.61TiB MemAvailable |
| 工作空间所在文件系统 | 约2624.6GiB可用，总量19383.3GiB；不是项目独占配额 |
| GPU | 8×NVIDIA A100-SXM4-80GB；每卡81920MiB |
| 驱动 | 570.195.03；nvidia-smi报告CUDA最高兼容版本12.8，不代表已安装的CUDA toolkit版本 |
| Python | 系统Python3.10.12；未发现python3.11/3.12、uv、conda命令 |
| 系统Python包元数据 | torch2.7.0，FastAPI0.136.1，uvicorn0.47.0，Pillow11.3.0，safetensors0.8.0；未发现Transformers/vLLM。没有导入torch或初始化CUDA |
| 容器 | Docker CLI29.0.1，NVIDIA Container Toolkit CLI1.17.8；ubuntu访问docker.sock被拒绝，不能声称容器运行条件已满足 |
| 用户服务托管 | loginctl show-user ubuntu -p Linger返回Linger=no；长期用户服务所需条件待部署阶段落实，本轮未改设置 |

## GPU观察快照

| GPU index | 已用MiB | 大致剩余MiB | 结论 |
|---|---:|---:|---|
| 0 | 80046 | 1874 | 已被现有作业占用 |
| 1 | 77547 | 4373 | 已被现有作业占用 |
| 2 | 71021 | 10899 | 已被现有作业占用 |
| 3 | 71895 | 10025 | 已被现有作业占用 |
| 4 | 71895 | 10025 | 已被现有作业占用 |
| 5 | 22583 | 59337 | 有现有作业，不抢占 |
| 6 | 4 | 81916 | 当前可作为单卡候选，部署前重新核对 |
| 7 | 4 | 81916 | 当前空闲；本轮未分配、未运行评测 |

设计首选GPU6的UUID `GPU-4d43b912-b921-faf2-6111-375af2e51479`，通过CUDA_VISIBLE_DEVICES固定后进程内为cuda:0；不是直接在进程内选择cuda:6。GPU7留作未来可能的升级/评测资源，未预留。其他卡即使利用率瞬时0%也已有显存作业，不能据此判为空闲。

只查看了监听socket，不调用既有服务。8000已有监听，8088、8089、8091和部分809x亦占用。拟采用的18880/18881须部署时精确检查；本轮没有bind测试、代理配置或防火墙改动。

## 固定模型资料，只读取得

从官方Hub元数据及小型源码读取：`vllm-sr/d3-mini` revision `bd0090dd758d32ba59ef5c749910a8e87fc4391f`，lastModified=2026-10-17T15:02:32Z；cardData license=apache-2.0。仅在内存读取，不下载safetensors。

| 文件 | SHA256 |
|---|---|
| d3_runtime.py | adf7f7aa085674b5682e492d8b2e3cc4f11c67b0d153515c742e907e9b550917 |
| d3_format.py | 3badfbc70561bb3f5b8ec16a11d2c455b96ddb32caace0a8a54ca102eae1f3fa |
| d3_server.py | 766a20a69101e36ab0535a1ec683379db422380a83091f0eccd7e82edb6a02de |
| decision_config.json | 588bc0ac7644479b9adde0498d80b6fb7c576388992564ac67599c05d29add07 |
| preprocessor_config.json | 27225450ac9c6529872ee1924fcb0962ff5634834f817040f444118116f4e516 |

config.json声明BF16、Transformers5.17.0和自定义AutoModel；decision_config声明noncausal_full_attention、FP32 readout，max_length=null。本项目必须额外设置输入上限，不能把该null解释为安全的无限上下文。

源码_run_images按batch_size循环调用image_probabilities；后面的media_features“一次计算”注释用于视频请求。首版图片设计不承诺一次编码覆盖全请求。最后再次只读列出项目工作空间，仍为空；没有把该调查变成服务开发。

[固定revision文件目录](https://huggingface.co/vllm-sr/d3-mini/tree/bd0090dd758d32ba59ef5c749910a8e87fc4391f)。源文件读取证明协议与实现细节，不证明模型可运行、效果达标或依赖组合兼容。

## 尚未核查/执行

未执行pip、venv创建、模型下载/加载、GPU forward、容器运行、sudo、服务启动/重启、防火墙/DNS/TLS配置、scp或远端文件写入。未查看凭据、.env、现有服务请求内容或进程启动参数。Docker权限、GPU持续分配、依赖锁、网络线路、域名、TLS和真实evaluation属于后续开发/部署事项。
