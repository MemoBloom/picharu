# picmoko 邮件公开品牌素材 v1

沿用用户确认的云朵角色和A1专属字标，WebP解码后无损保存为PNG，alpha像素逐字节一致；没有重画或换色。原图SHA、输出SHA和尺寸见manifest.json。PNG用于兼容收件客户端。

字体为官网同款Zen Kaku Gothic New 400/700正文与控件、Zen Maru Gothic 700重点标题。通过Google Fonts官方text接口生成两份静态邮件文案的字符子集，自托管WOFF2共83,636字节，并附两份OFL许可证。未使用不同字体或合成字重。未来增加字符时须重新生成版本，不把该限字子集用于整个网站或动态姓名。

公开路径/email-assets/v1/仅静态图片/字体及来源信息，允许匿名GET与跨域字体访问（Access-Control-Allow-Origin:*）；没有用户照片、凭据或追踪。版本目录不可覆盖修订，后续使用v2；设置immutable缓存。email-fonts.css供说明，Supabase模板已将三个font-face内联，避免邮件依赖外部stylesheet。

邮件客户端对web fonts支持不一致，忽略时使用Hiragino/Yu Gothic/Meiryo等系统日文字体；图片可在允许远程图片的客户端保留设计。此资产发布不修改站点全局字体/Logo、认证逻辑、origin或生成开关。
