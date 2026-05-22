# 企业 AI 工作台

一个从零搭建的企业内部 AI 网页，支持账号登录、管理员后台、多模型 API 接入、智能体工作流构建，并预留办公软件机器人 API。

## 功能

- 普通用户：登录后像 ChatGPT 一样聊天，可在顶部快速切换可用模型。
- 对话：聊天内容只保留在当前浏览器页面里，后台不再保存聊天记录，也不提供对话审计。
- 智能体：用户可以像写文档一样创建智能体，发布后出现在左侧“智能体”板块。
- 工作流智能体：文档里可以插入多个模型块，每个模型块的输出会保存成变量，后续文本可以用 `{{变量名}}` 引用。
- 独立页面：发布后的智能体可复制 `/agent/{shareId}` 独立链接打开。
- 管理员：开通/停用账号，管理模型接入。
- 管理员后台：管理员登录后左侧会出现独立“管理后台”页面入口。
- 模型接入：支持 OpenAI Chat Completions 兼容接口，国内模型网关只要提供兼容的 `/chat/completions` 即可接入。
- 机器人 API：支持用 Bearer Token 调用 `/api/integrations/chat`，后续可接入钉钉、飞书、企业微信等办公软件。

## 本地运行

```bash
npm install
npm run dev
```

前端地址：http://localhost:5173，如果端口被占用 Vite 会自动换到 5174/5175。

后端地址：http://localhost:3001

初始管理员：

```text
账号：IHD2025
密码：15658855442
```

首次部署后请立即修改管理员密码，或者删除 `data/db.json` 后调整 `server/db.ts` 中的初始化逻辑再启动。

只有管理员账号，即 `role=admin` 的账号，登录后会看到左侧“管理后台”入口。普通用户只能进入 AI 对话。

修改管理员密码：用管理员登录后，进入“管理后台 -> 账号”，点管理员账号这一行的“编辑”，在“新密码，留空不改”里填新密码并保存。普通用户看不到管理后台入口。

## 配置模型

进入“管理后台 -> 模型”，新增模型：

- 展示名称：给用户看的名称，如“通义千问 Plus”
- Base URL：兼容 OpenAI 的 API 根地址，如 `https://api.openai.com/v1`
- API Key：供应商密钥
- 模型 ID：真实模型名，如 `gpt-4o-mini`、`qwen-plus`
- System Prompt：这个模型的默认系统提示词，可留空

系统会调用：

```text
POST {Base URL}/chat/completions
Authorization: Bearer {API Key}
```

## yylx 接入

yylx 的 OpenAI 兼容地址填写：

```text
https://app.yylx.io/v1
```

已内置三个模型配置：

| 展示名称 | 类型 | 模型 ID |
| --- | --- | --- |
| Claude 4.7 | 聊天模型 | `claude4.7` |
| GPT 5.5 | 聊天模型 | `gpt5.5` |
| Image 2 | 图片模型 | `gpt-image-2` |

如果启动前设置了环境变量 `YYLX_API_KEY`，这三个模型会自动写入 API Key 并启用。否则进入后台逐个填写 API Key 后启用。

用户聊天页只会显示“已启用且已配置 API Key”的模型。后台已有模型可以点“编辑”补充 API Key、修改名称、Base URL、模型 ID、类型和启用状态。

图片模型会调用：

```text
POST https://app.yylx.io/v1/images/generations
Authorization: Bearer {API Key}
```

## 机器人 API

进入“管理后台 -> API Token”生成 Token。

API Token 用于钉钉、飞书、企业微信等办公软件机器人服务端调用本系统接口，不是网页登录账号密码。后台会默认用星号隐藏 Token，可以点“显示”查看，也可以一键复制。

调用示例：

```bash
curl -X POST http://localhost:3001/api/integrations/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer bot_xxx" \
  -d '{"content":"帮我总结这段话","modelId":"可选模型ID"}'
```

返回：

```json
{
  "reply": "模型回复内容",
  "imageUrl": "图片模型返回时存在",
  "modelId": "实际使用的模型ID"
}
```

## 上线部署

上线部署说明在 [deploy/README.md](/Users/machao/Desktop/小象G计划/deploy/README.md)。

核心步骤：

1. 在阿里云 RDS 创建 `gplan` 数据库和应用账号
2. RDS 白名单加入 ECS 私网 IP
3. ECS 安装 Node.js、Git、Nginx、PM2
4. 拉取 GitHub 仓库
5. 配置 `.env`
6. `npm ci && npm run build`
7. `pm2 start ecosystem.config.cjs`
8. Nginx 反向代理到 `127.0.0.1:3001`

## 智能体构建

进入左侧“构建智能体”，填写名称、说明，并在文档编辑区编排文本块和模型块。

- 文本块：编写提示词，可输入 `/` 插入模型块，输入 `@` 引用上方变量
- 模型块：在文档里以紧凑模块显示，点击后在右侧编辑模型、模块名和输出变量名
- 拖拽：文本块和模型块左侧都有拖拽把手，可调整顺序
- 变量：`{{input}}` 表示用户输入，模型块输出会形成类似 `{{output_1}}` 的变量

勾选“发布到左侧智能体列表”并保存后会弹出发布结果和独立页面链接。运行时不会展示构建文档，只展示用户输入和最终输出。构建页提供“试运行”，可以用当前未保存的文档结构预览效果。

## 数据存储

默认使用 `data/db.json` 做本地持久化。上线设置 `DB_PROVIDER=mysql` 后会使用 MySQL 的 `app_state` 表保存业务数据。

当前 MySQL 版本采用单表 JSON 状态，适合快速上线和从本地 JSON 平滑迁移。后续用户量稳定后，建议再拆成 `users`、`models`、`conversations`、`messages`、`workspaces`、`settings` 等标准表。

当前版本不持久化聊天记录；持久化数据包括账号、模型配置、智能体配置、工作空间、机器人 Token 和系统设置。
