# API 文档

> [English Documentation](API_DOCUMENTATION_EN.md)

本 API 服务基于 Hono 框架构建，并使用 Bearer Token 进行身份验证。所有接口的基础路径为 `/v1`。

## 1. 概览

| 模块 | 方法 | 路径 | 描述 |
| :--- | :--- | :--- | :--- |
| **账户** | `POST` | `/v1/signup` | 用户注册 |
| | `POST` | `/v1/login` | 用户登录 |
| | `POST` | `/v1/refresh` | 刷新 Access Token |
| | `POST` | `/v1/logout` | 用户登出 |
| | `GET` | `/v1/profile/:username` | 获取用户资料 |
| **TOTP** | `POST` | `/v1/totp/setup` | 生成 TOTP 密钥 |
| | `POST` | `/v1/totp/enable` | 启用 TOTP |
| | `POST` | `/v1/totp/disable` | 禁用 TOTP |
| | `GET` | `/v1/totp/status` | 获取 TOTP 状态 |
| **图片** | `GET` | `/v1/images` | 获取图片列表 |
| | `POST` | `/v1/images` | 上传图片 (获取预签名 URL) |
| | `GET` | `/v1/images/:imageId` | 获取图片内容 (预览/原图) |
| | `DELETE` | `/v1/images/:imageId` | 删除图片 |
| | `GET` | `/v1/images/:imageId/replies` | 获取图片回复 |
| | `GET` | `/v1/images/timeline` | 获取时间轴数据 |
| **帖子** | `POST` | `/v1/posts` | 创建帖子/回复 |
| | `GET` | `/v1/posts` | 获取帖子流 |
| | `GET` | `/v1/posts/:postId` | 获取帖子详情 |
| | `DELETE` | `/v1/posts/:postId` | 删除帖子 |
| | `GET` | `/v1/posts/:postId/replies` | 获取帖子回复 |
| **点赞** | `PUT` | `/v1/likes/:targetType/:targetId` | 点赞 |
| | `DELETE` | `/v1/likes/:targetType/:targetId` | 取消点赞 |
| | `GET` | `/v1/likes/status` | 批量获取点赞状态 |

---

## 2. 详细文档

### 通用说明
*   **基础路径**: `/v1`
*   **响应格式**: JSON，统一格式为 `{ success: boolean, data?: T, error?: string }`
*   **身份验证**: 
    除公开接口（如登录/注册）外，需要在 Header 中携带 Access Token。
    ```http
    Authorization: Bearer <your_access_token>
    ```
*   **速率限制**:
    *   `/signup`: 每小时 5 次请求
    *   `/login`: 每 10 分钟 10 次请求

---

### 2.1 账户模块 (Auth)

#### 注册
*   **接口**: `POST /signup`
*   **描述**: 注册新用户。需要邀请码。
*   **验证**: 无

**Body 参数:**

| 参数名 | 类型 | 必填 | 描述 |
| :--- | :--- | :--- | :--- |
| `username` | string | 是 | 用户名 (3-32 字符，字母数字及下划线，不能为 'me') |
| `password` | string | 是 | 密码 (8-64 字符) |
| `nickname` | string | 是 | 昵称 (1-16 字符) |
| `inviteCode` | string | 是 | 邀请码 |

**响应 (200 OK):**
```json
{
  "success": true,
  "message": "User registered successfully"
}
```

#### 登录
*   **接口**: `POST /login`
*   **描述**: 用户登录，返回 Refresh Token。如果用户启用了 TOTP，需要提供 otpCode。
*   **验证**: 无

**Body 参数:**

| 参数名 | 类型 | 必填 | 描述 |
| :--- | :--- | :--- | :--- |
| `username` | string | 是 | 用户名 |
| `password` | string | 是 | 密码 |
| `otpCode` | string | 条件必填 | TOTP 验证码 (启用 2FA 时必填) |

**响应 (200 OK):**
```json
{
  "success": true,
  "data": {
    "refreshToken": "uuid-refresh-token..."
  }
}
```

**响应 (401 需要 2FA):**
```json
{
  "success": false,
  "error": "2FA Required",
  "require2FA": true
}
```

#### 刷新 Token
*   **接口**: `POST /refresh`
*   **描述**: 使用 Refresh Token 获取新的 Access Token (有效期 1 小时)。
*   **验证**: 无

**Body 参数:**

| 参数名 | 类型 | 必填 | 描述 |
| :--- | :--- | :--- | :--- |
| `refreshToken` | string | 是 | 登录时获取的 Refresh Token |

**响应 (200 OK):**
```json
{
  "success": true,
  "data": {
    "accessToken": "uuid-access-token..."
  }
}
```

#### 获取资料
*   **接口**: `GET /profile/:username`
*   **描述**: 获取用户公开资料。使用 `me` 作为用户名可获取自己的资料。
*   **验证**: 需要

**响应 (200 OK):**
```json
{
  "success": true,
  "data": {
    "userId": "uuid-user-id",
    "nickname": "MyNickname",
    "bio": "User Bio...",
    "avatar": "uuid-image-id",
    "role": "user"
  }
}
```

---

### 2.2 TOTP 两步验证模块

#### 生成 TOTP 密钥
*   **接口**: `POST /totp/setup`
*   **描述**: 生成 TOTP 密钥和二维码 URI。密钥有效期 5 分钟，需调用 enable 接口验证后生效。
*   **验证**: 需要

**响应 (200 OK):**
```json
{
  "success": true,
  "data": {
    "secret": "BASE32-ENCODED-SECRET",
    "uri": "otpauth://totp/ClassMemories:username?secret=...&issuer=ClassMemories"
  }
}
```

#### 启用 TOTP
*   **接口**: `POST /totp/enable`
*   **描述**: 验证 TOTP 码并启用两步验证。
*   **验证**: 需要

**Body 参数:**

| 参数名 | 类型 | 必填 | 描述 |
| :--- | :--- | :--- | :--- |
| `code` | string | 是 | 6 位 TOTP 验证码 |

**响应 (200 OK):**
```json
{
  "success": true,
  "message": "TOTP enabled"
}
```

#### 禁用 TOTP
*   **接口**: `POST /totp/disable`
*   **描述**: 验证当前 TOTP 码并禁用两步验证。
*   **验证**: 需要

**Body 参数:**

| 参数名 | 类型 | 必填 | 描述 |
| :--- | :--- | :--- | :--- |
| `code` | string | 是 | 6 位 TOTP 验证码 |

**响应 (200 OK):**
```json
{
  "success": true,
  "message": "TOTP disabled"
}
```

#### 获取 TOTP 状态
*   **接口**: `GET /totp/status`
*   **描述**: 查询当前用户是否启用了 TOTP。
*   **验证**: 需要

**响应 (200 OK):**
```json
{
  "success": true,
  "data": {
    "enabled": true
  }
}
```

---

### 2.3 图片模块

#### 获取图片列表
*   **接口**: `GET /images`
*   **描述**: 获取分页的图片列表，支持按日期筛选。
*   **验证**: 需要

**Query 参数:**

| 参数名 | 类型 | 必填 | 描述 |
| :--- | :--- | :--- | :--- |
| `page` | number | 否 | 页码，默认为 1 |
| `limit` | number | 否 | 每页数量，默认为 50 (最大 100) |
| `date` | string | 否 | 日期筛选 (YYYY-MM-DD, UTC+8) |

**响应 (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "imageId": "uuid-image-1",
      "originalExt": "jpg",
      "createdAt": "2024-01-01T12:00:00Z",
      "userId": "uuid-user-1"
    }
  ],
  "page": 1,
  "limit": 50
}
```

#### 上传图片 (预签名)
*   **接口**: `POST /images`
*   **描述**: 提交图片元数据以获取用于上传到 R2 存储桶的预签名 URL。
*   **验证**: 需要

**Body 参数:**

| 参数名 | 类型 | 必填 | 描述 |
| :--- | :--- | :--- | :--- |
| `originalExt` | string | 是 | 原始文件扩展名 (例如 .jpg) |
| `createdAt` | string | 是 | 图片创建时间 (YYYY-MM-DD) |

**响应 (200 OK):**
```json
{
  "success": true,
  "data": {
    "imageId": "uuid-image-new",
    "uploadUrls": {
      "preview": "https://r2.../put-url...",
      "original": "https://r2.../put-url..."
    }
  }
}
```

#### 获取图片内容
*   **接口**: `GET /images/:imageId`
*   **描述**: 获取图片文件流 (直接返回二进制文件)。
*   **验证**: 需要

**Query 参数:**

| 参数名 | 类型 | 必填 | 描述 |
| :--- | :--- | :--- | :--- |
| `type` | string | 否 | `preview` (WebP) 或 `origin` (原图)，默认为 `preview` |

**响应:**
*   **Content-Type**: `image/webp` 或 原始 MIME 类型
*   **Body**: 二进制图片流

#### 删除图片
*   **接口**: `DELETE /images/:imageId`
*   **描述**: 删除图片 (仅限作者或管理员)。
*   **验证**: 需要

**响应 (200 OK):**
```json
{
  "success": true
}
```

#### 获取图片回复
*   **接口**: `GET /images/:imageId/replies`
*   **描述**: 获取针对图片的回复帖子。
*   **验证**: 需要

**Query 参数:**

| 参数名 | 类型 | 必填 | 描述 |
| :--- | :--- | :--- | :--- |
| `page` | number | 否 | 页码，默认为 1 |
| `limit` | number | 否 | 每页数量，默认为 20 (最大 100) |

**响应 (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-post-1",
      "content": "Nice photo!",
      "images": [],
      "userId": "uuid-user-2",
      "createdAt": "2024-01-01T13:00:00Z"
    }
  ],
  "page": 1,
  "limit": 20
}
```

#### 获取时间轴
*   **接口**: `GET /images/timeline`
*   **描述**: 获取包含图片的日期及当天的图片数量 (UTC+8)。
*   **验证**: 需要

**响应 (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "date": "2024-01-01",
      "count": 12
    },
    {
      "date": "2023-12-31",
      "count": 5
    }
  ]
}
```

---

### 2.4 帖子模块

#### 创建帖子/回复
*   **接口**: `POST /posts`
*   **描述**: 创建帖子或回复。如果提供 parentId 和 parentType，则创建回复。
*   **验证**: 需要

**Body 参数:**

| 参数名 | 类型 | 必填 | 描述 |
| :--- | :--- | :--- | :--- |
| `content` | string | 是 | 帖子/回复内容 (最多 16384 字符) |
| `images` | string[] | 否 | 图片 ID 数组 (必须是当前用户的图片) |
| `parentId` | string | 否 | 父级 ID (帖子或图片) |
| `parentType` | string | 否 | 父级类型: `post` 或 `image` |

> 注意: `parentId` 和 `parentType` 必须同时提供或同时不提供。

**响应 (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "uuid-post-new"
  }
}
```

#### 获取帖子流
*   **接口**: `GET /posts`
*   **描述**: 获取分页的顶级帖子流 (不包括回复)。
*   **验证**: 需要

**Query 参数:**

| 参数名 | 类型 | 必填 | 描述 |
| :--- | :--- | :--- | :--- |
| `page` | number | 否 | 页码 (默认 1) |
| `limit` | number | 否 | 每页数量 (默认 20, 最大 100) |
| `userId` | string | 否 | 按用户 ID 筛选 |

**响应 (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-post-1",
      "content": "Hello World",
      "images": [],
      "userId": "uuid-user-1",
      "createdAt": "2024-01-01T12:00:00Z"
    }
  ],
  "page": 1,
  "limit": 20
}
```

#### 获取帖子详情
*   **接口**: `GET /posts/:postId`
*   **描述**: 获取单个帖子的详情。
*   **验证**: 需要

**响应 (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "uuid-post-1",
    "content": "Hello World",
    "images": ["uuid-image-1", "uuid-image-2"],
    "userId": "uuid-user-1",
    "parentId": null,
    "parentType": null,
    "createdAt": "2024-01-01T12:00:00Z"
  }
}
```

#### 删除帖子
*   **接口**: `DELETE /posts/:postId`
*   **描述**: 删除帖子 (仅限作者或管理员)。
*   **验证**: 需要

**响应 (200 OK):**
```json
{
  "success": true
}
```

#### 获取帖子回复
*   **接口**: `GET /posts/:postId/replies`
*   **描述**: 获取帖子的回复列表。
*   **验证**: 需要

**Query 参数:**

| 参数名 | 类型 | 必填 | 描述 |
| :--- | :--- | :--- | :--- |
| `page` | number | 否 | 页码，默认为 1 |
| `limit` | number | 否 | 每页数量，默认为 20 (最大 100) |

**响应 (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-reply-1",
      "content": "Great post!",
      "images": [],
      "userId": "uuid-user-2",
      "createdAt": "2024-01-01T13:00:00Z"
    }
  ],
  "page": 1,
  "limit": 20
}
```

---

### 2.5 点赞模块

#### 点赞
*   **接口**: `PUT /likes/:targetType/:targetId`
*   **描述**: 对帖子或图片点赞。
*   **验证**: 需要

**Path 参数:**
*   `targetType`: `post` 或 `image`
*   `targetId`: 目标 ID

**响应 (200 OK):**
```json
{
  "success": true,
  "liked": true
}
```

#### 取消点赞
*   **接口**: `DELETE /likes/:targetType/:targetId`
*   **描述**: 取消对帖子或图片的点赞。
*   **验证**: 需要

**Path 参数:**
*   `targetType`: `post` 或 `image`
*   `targetId`: 目标 ID

**响应 (200 OK):**
```json
{
  "success": true,
  "liked": false
}
```

#### 批量获取状态
*   **接口**: `GET /likes/status`
*   **描述**: 批量查询用户的点赞状态和数量。
*   **验证**: 需要

**Query 参数:**

| 参数名 | 类型 | 必填 | 描述 |
| :--- | :--- | :--- | :--- |
| `targetType` | string | 是 | 目标类型: `post` 或 `image` |
| `targetIds` | string | 是 | 目标 ID 列表，逗号分隔 |

**响应 (200 OK):**
```json
{
  "success": true,
  "data": {
    "uuid-target-1": {
      "count": 10,
      "isLiked": true
    },
    "uuid-target-2": {
      "count": 5,
      "isLiked": false
    }
  }
}
```

---

## 3. 通用错误

所有失败的请求都会返回 `success: false` 和 `error` 字段。

**400 Bad Request**
```json
{
  "success": false,
  "error": "Invalid request format"
}
```

**401 Unauthorized**
```json
{
  "success": false,
  "error": "Unauthorized: Invalid Token"
}
```

**403 Forbidden**
```json
{
  "success": false,
  "error": "Forbidden"
}
```

**404 Not Found**
```json
{
  "success": false,
  "error": "Resource not found"
}
```

**429 Too Many Requests**
```json
{
  "success": false,
  "error": "Too Many Requests"
}
```

**503 Service Unavailable**
```json
{
  "success": false,
  "error": "Service Temporarily Unavailable"
}
```