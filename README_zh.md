# Class Memories API (中文文档)

这是一个为 "Class Memories" 应用构建的后端 API，使用 [Hono](https://hono.dev/) 框架并部署在 [Cloudflare Workers](https://workers.cloudflare.com/) 上。本项目利用 Cloudflare 的生态系统，包括 D1 (SQL 数据库), R2 (对象存储), 和 KV (键值存储)，以提供可扩展的无服务器基础设施。

**注意:** 这是一个 Class Memories 应用的私有项目。

## 技术栈

- **运行环境**: Cloudflare Workers
- **框架**: Hono
- **数据库**: Cloudflare D1 (SQLite)
- **存储**: Cloudflare R2 (图片存储)
- **会话/缓存**: Cloudflare KV
- **语言**: TypeScript

## 项目结构

```text
src/
├── index.ts          # 应用入口点和主路由
├── type.ts           # 类型定义 (Bindings, Variables)
├── lib/              # 工具库
│   ├── auth.ts       # 密码哈希和验证
│   └── s3.ts         # S3/R2 预签名 URL 生成
├── middleware/       # Hono 中间件
│   └── auth.ts       # 认证中间件 (Token 验证)
└── routes/           # API 路由定义
    ├── account.ts    # 用户认证和个人资料管理
    ├── images.ts     # 图片上传 (预签名 URL) 和获取
    ├── likes.ts      # 点赞功能
    ├── posts.ts      # 帖子的创建、获取和删除
    └── timeline.ts   # 时间轴数据聚合
```

## 功能特性

### 认证 (`/v1/*`)
- **注册 (Signup)**: 支持邀请码验证的用户注册。
- **登录 (Login)**: 基于密码的认证，返回刷新令牌 (Refresh Token)。
- **刷新 (Refresh)**: 使用刷新令牌换取短期的访问令牌 (Access Token)。
- **登出 (Logout)**: 注销令牌。
- **个人资料 (Profile)**: 获取用户个人资料信息（包含头像图片 ID）。

> 📖 **API 文档**: 关于详细的 API 接口定义和使用说明，请参考 [API_DOCUMENTATION_ZH.md](docs/API_DOCUMENTATION_ZH.md)。

### 帖子 (`/v1/posts`)
- **创建帖子**: 创建包含文本和可选图片附件的帖子。
- **获取帖子**: 获取帖子详情。
- **信息流 (Feed)**: 获取分页的帖子信息流。
- **删除帖子**: 删除帖子 (仅限作者或管理员)。
- **评论/回复**: 通过帖子 API 对帖子或图片进行回复。

### 点赞 (`/v1/likes`)
- **点赞/取消**: 对帖子、图片或评论进行点赞或取消点赞。
- **批量状态**: 批量获取点赞状态和数量。

### 图片 (`/v1/images`)
- **上传**: 生成预签名 URL，用于直接上传图片 (原始图片 & 预览/WebP) 到 R2。
- **获取图片**: 获取图片 (预览图或原图)，包含安全头信息和缓存控制。
- **时间轴**: 获取按日期分组的图片统计数据。

## 设置与开发

### 前置要求
- Node.js
- npm
- Cloudflare Wrangler CLI (`npm install -g wrangler`)

### 安装

```bash
npm install
```

### 本地开发

启动开发服务器:

```bash
npm run dev
```

### 配置

项目使用 `wrangler.jsonc` 进行配置。你需要在你的 Cloudflare 账户中设置以下绑定 (Bindings):

- **KV Namespace**: `KV` (用于存储 refresh/access tokens)
- **D1 Database**: `D1_DB` (数据库名称: `class-memories`)
- **R2 Bucket**: `R2_BUCKET` (存储桶名称: `class-memories-images`)
- **环境变量 (Vars)**:
  - `R2_ENDPOINT`: 你的 R2 S3 API 端点。
  - `R2_BUCKET_NAME`: 你的 R2 存储桶名称。

你还需要设置以下 **Secrets** 以支持 S3 兼容性 (用于生成预签名 URL):
- `R2_ACCESS_KEY_ID`: Cloudflare R2 Access Key ID.
- `R2_SECRET_ACCESS_KEY`: Cloudflare R2 Secret Access Key.

### 数据库 Schema (D1)

应用依赖 D1 数据库中存在以下表:
- `users`: 存储用户凭据和个人资料。
- `posts`: 存储帖子内容和元数据。
- `images`: 存储关联 R2 的图片元数据。
- `comments`: 存储用户对帖子/图片的评论。
- `likes`: 存储用户对帖子/图片的点赞。

## 部署

部署 Worker 到 Cloudflare:

```bash
npm run deploy
```

## 许可证

本项目基于 **GNU Affero General Public License v3.0 (AGPL-3.0)** 许可。

