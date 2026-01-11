# API Documentation

> [中文文档 (Chinese Documentation)](API_DOCUMENTATION_ZH.md)

This API service is built on the Hono framework and uses Bearer Token for authentication. The base path for all endpoints is `/v1`.

## 1. Overview

| Module | Method | Path | Description |
| :--- | :--- | :--- | :--- |
| **Account** | `POST` | `/v1/signup` | User Registration |
| | `POST` | `/v1/login` | User Login |
| | `POST` | `/v1/refresh` | Refresh Access Token |
| | `POST` | `/v1/logout` | User Logout |
| | `GET` | `/v1/profile/:username` | Get User Profile |
| **TOTP** | `POST` | `/v1/totp/setup` | Generate TOTP Secret |
| | `POST` | `/v1/totp/enable` | Enable TOTP |
| | `POST` | `/v1/totp/disable` | Disable TOTP |
| | `GET` | `/v1/totp/status` | Get TOTP Status |
| **Images** | `GET` | `/v1/images` | Get Image List |
| | `POST` | `/v1/images` | Upload Image (Get Presigned URL) |
| | `GET` | `/v1/images/:imageId` | Get Image Content (Preview/Origin) |
| | `DELETE` | `/v1/images/:imageId` | Delete Image |
| | `GET` | `/v1/images/:imageId/replies` | Get Image Replies |
| | `GET` | `/v1/images/timeline` | Get Timeline Data |
| **Posts** | `POST` | `/v1/posts` | Create Post/Reply |
| | `GET` | `/v1/posts` | Get Post Feed |
| | `GET` | `/v1/posts/:postId` | Get Post Details |
| | `DELETE` | `/v1/posts/:postId` | Delete Post |
| | `GET` | `/v1/posts/:postId/replies` | Get Post Replies |
| **Likes** | `PUT` | `/v1/likes/:targetType/:targetId` | Like |
| | `DELETE` | `/v1/likes/:targetType/:targetId` | Unlike |
| | `GET` | `/v1/likes/status` | Batch Get Like Status |

---

## 2. Detailed Documentation

### General
*   **Base URL**: `/v1`
*   **Response Format**: JSON, unified format `{ success: boolean, data?: T, error?: string }`
*   **Authentication**: 
    Except for public endpoints (like login/signup), an Access Token is required in the Header.
    ```http
    Authorization: Bearer <your_access_token>
    ```
*   **Rate Limiting**:
    *   `/signup`: 5 requests per hour
    *   `/login`: 10 requests per 10 minutes

---

### 2.1 Account Module (Auth)

#### Registration
*   **Endpoint**: `POST /signup`
*   **Description**: Register a new user. Requires an invite code.
*   **Auth**: None

**Body Parameters:**

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `username` | string | Yes | Username (3-32 chars, alphanumeric & underscore, not 'me') |
| `password` | string | Yes | Password (8-64 chars) |
| `nickname` | string | Yes | Nickname (1-16 chars) |
| `inviteCode` | string | Yes | Invite Code |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "User registered successfully"
}
```

#### Login
*   **Endpoint**: `POST /login`
*   **Description**: User login, returns Refresh Token. If TOTP is enabled, otpCode is required.
*   **Auth**: None

**Body Parameters:**

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `username` | string | Yes | Username |
| `password` | string | Yes | Password |
| `otpCode` | string | Conditional | TOTP code (required if 2FA is enabled) |

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "refreshToken": "uuid-refresh-token..."
  }
}
```

**Response (401 2FA Required):**
```json
{
  "success": false,
  "error": "2FA Required",
  "require2FA": true
}
```

#### Refresh Token
*   **Endpoint**: `POST /refresh`
*   **Description**: Use Refresh Token to get a new Access Token (Valid for 1 hour).
*   **Auth**: None

**Body Parameters:**

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `refreshToken` | string | Yes | Refresh Token from login |

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "accessToken": "uuid-access-token..."
  }
}
```

#### Get Profile
*   **Endpoint**: `GET /profile/:username`
*   **Description**: Get public profile of a user. Use `me` as username to get your own profile.
*   **Auth**: Required

**Response (200 OK):**
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

### 2.2 TOTP Two-Factor Authentication Module

#### Generate TOTP Secret
*   **Endpoint**: `POST /totp/setup`
*   **Description**: Generate TOTP secret and QR code URI. Secret is valid for 5 minutes and requires calling enable endpoint to activate.
*   **Auth**: Required

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "secret": "BASE32-ENCODED-SECRET",
    "uri": "otpauth://totp/ClassMemories:username?secret=...&issuer=ClassMemories"
  }
}
```

#### Enable TOTP
*   **Endpoint**: `POST /totp/enable`
*   **Description**: Verify TOTP code and enable two-factor authentication.
*   **Auth**: Required

**Body Parameters:**

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `code` | string | Yes | 6-digit TOTP code |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "TOTP enabled"
}
```

#### Disable TOTP
*   **Endpoint**: `POST /totp/disable`
*   **Description**: Verify current TOTP code and disable two-factor authentication.
*   **Auth**: Required

**Body Parameters:**

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `code` | string | Yes | 6-digit TOTP code |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "TOTP disabled"
}
```

#### Get TOTP Status
*   **Endpoint**: `GET /totp/status`
*   **Description**: Check if current user has TOTP enabled.
*   **Auth**: Required

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "enabled": true
  }
}
```

---

### 2.3 Images Module

#### Get Image List
*   **Endpoint**: `GET /images`
*   **Description**: Get paginated list of images, supports filtering by date.
*   **Auth**: Required

**Query Parameters:**

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `page` | number | No | Page number, default 1 |
| `limit` | number | No | Items per page, default 50 (max 100) |
| `date` | string | No | Date Filter (YYYY-MM-DD, UTC+8) |

**Response (200 OK):**
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

#### Upload Image (Presigned)
*   **Endpoint**: `POST /images`
*   **Description**: Submit image metadata to get presigned URLs for uploading to R2 bucket.
*   **Auth**: Required

**Body Parameters:**

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `originalExt` | string | Yes | Original file extension (e.g., .jpg) |
| `createdAt` | string | Yes | Image creation time (YYYY-MM-DD) |

**Response (200 OK):**
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

#### Get Image Content
*   **Endpoint**: `GET /images/:imageId`
*   **Description**: Get image file stream (returns binary file directly).
*   **Auth**: Required

**Query Parameters:**

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `type` | string | No | `preview` (WebP) or `origin` (Original), default `preview` |

**Response:**
*   **Content-Type**: `image/webp` or Original MIME type
*   **Body**: Binary Image Stream

#### Delete Image
*   **Endpoint**: `DELETE /images/:imageId`
*   **Description**: Delete image (owner or admin only).
*   **Auth**: Required

**Response (200 OK):**
```json
{
  "success": true
}
```

#### Get Image Replies
*   **Endpoint**: `GET /images/:imageId/replies`
*   **Description**: Get reply posts for an image.
*   **Auth**: Required

**Query Parameters:**

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `page` | number | No | Page number, default 1 |
| `limit` | number | No | Items per page, default 20 (max 100) |

**Response (200 OK):**
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

#### Get Timeline
*   **Endpoint**: `GET /images/timeline`
*   **Description**: Get dates with images and the count of images for that day (UTC+8).
*   **Auth**: Required

**Response (200 OK):**
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

### 2.4 Posts Module

#### Create Post/Reply
*   **Endpoint**: `POST /posts`
*   **Description**: Create a post or reply. If parentId and parentType are provided, creates a reply.
*   **Auth**: Required

**Body Parameters:**

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `content` | string | Yes | Post/reply content (Max 16384 chars) |
| `images` | string[] | No | Array of Image IDs (must belong to current user) |
| `parentId` | string | No | Parent ID (post or image) |
| `parentType` | string | No | Parent type: `post` or `image` |

> Note: `parentId` and `parentType` must both be provided or both omitted.

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "uuid-post-new"
  }
}
```

#### Get Post Feed
*   **Endpoint**: `GET /posts`
*   **Description**: Retrieve paginated top-level posts (excludes replies).
*   **Auth**: Required

**Query Parameters:**

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `page` | number | No | Page number (default 1) |
| `limit` | number | No | Items per page (default 20, max 100) |
| `userId` | string | No | Filter by User ID |

**Response (200 OK):**
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

#### Get Post Details
*   **Endpoint**: `GET /posts/:postId`
*   **Description**: Get details of a single post.
*   **Auth**: Required

**Response (200 OK):**
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

#### Delete Post
*   **Endpoint**: `DELETE /posts/:postId`
*   **Description**: Delete post (owner or admin only).
*   **Auth**: Required

**Response (200 OK):**
```json
{
  "success": true
}
```

#### Get Post Replies
*   **Endpoint**: `GET /posts/:postId/replies`
*   **Description**: Get replies for a post.
*   **Auth**: Required

**Query Parameters:**

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `page` | number | No | Page number, default 1 |
| `limit` | number | No | Items per page, default 20 (max 100) |

**Response (200 OK):**
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

### 2.5 Likes Module

#### Like
*   **Endpoint**: `PUT /likes/:targetType/:targetId`
*   **Description**: Like a post or image.
*   **Auth**: Required

**Path Parameters:**
*   `targetType`: `post` or `image`
*   `targetId`: Target ID

**Response (200 OK):**
```json
{
  "success": true,
  "liked": true
}
```

#### Unlike
*   **Endpoint**: `DELETE /likes/:targetType/:targetId`
*   **Description**: Unlike a post or image.
*   **Auth**: Required

**Path Parameters:**
*   `targetType`: `post` or `image`
*   `targetId`: Target ID

**Response (200 OK):**
```json
{
  "success": true,
  "liked": false
}
```

#### Batch Get Status
*   **Endpoint**: `GET /likes/status`
*   **Description**: Batch query like status and count for a user.
*   **Auth**: Required

**Query Parameters:**

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `targetType` | string | Yes | Target type: `post` or `image` |
| `targetIds` | string | Yes | Comma-separated list of target IDs |

**Response (200 OK):**
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

## 3. Common Errors

All failed requests return `success: false` and an `error` field.

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