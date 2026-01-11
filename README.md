# Class Memories API

A backend API for the "Class Memories" application, built with [Hono](https://hono.dev/) and deployed on [Cloudflare Workers](https://workers.cloudflare.com/). This project leverages Cloudflare's ecosystem including D1 (SQL database), R2 (Object Storage), and KV (Key-Value storage) to provide a scalable and serverless infrastructure.

**Note:** This is a private project for the Class Memories application.

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Framework**: Hono
- **Database**: Cloudflare D1 (SQLite)
- **Storage**: Cloudflare R2 (Images)
- **Session/Cache**: Cloudflare KV
- **Language**: TypeScript

## Project Structure

```text
src/
├── index.ts          # Application entry point and main router
├── type.ts           # Type definitions (Bindings, Variables)
├── lib/              # Utility libraries
│   ├── auth.ts       # Password hashing and verification
│   └── s3.ts         # S3/R2 presigned URL generation
├── middleware/       # Hono middlewares
│   └── auth.ts       # Authentication middleware (JWT/Token validation)
└── routes/           # API route definitions
    ├── account.ts    # User authentication and profile management
    ├── images.ts     # Image upload (presigned URLs) and retrieval
    ├── likes.ts      # Like/Unlike functionality
    ├── posts.ts      # Post creation, retrieval, and deletion
    └── timeline.ts   # Timeline data aggregation
```

## Features

### Authentication (`/v1/*`)
- **Signup**: User registration with invite code verification.
- **Login**: Password-based authentication returning Refresh Tokens.
- **Refresh**: Exchange Refresh Token for a short-lived Access Token.
- **Logout**: Invalidate tokens.
- **Profile**: Retrieve user profile information (including avatar image ID).

> 📖 **API Documentation**: For detailed API endpoints and usage, please refer to [API_DOCUMENTATION_EN.md](docs/API_DOCUMENTATION_EN.md).

### Posts (`/v1/posts`)
- **Create Post**: Create text-based posts with optional image attachments.
- **Get Post**: Retrieve post details.
- **Feed**: Retrieve paginated posts feed.
- **Delete Post**: Delete posts (Owner or Admin).
- **Comments/Replies**: Reply to posts or images via the posts API.

### Likes (`/v1/likes`)
- **Toggle Like**: Like or unlike a post, image, or comment.
- **Batch Status**: Get like status and counts for multiple items.

### Images (`/v1/images`)
- **Upload**: Generate presigned URLs for uploading images (Original & Preview/WebP) directly to R2.
- **Get Image**: Retrieve images (Preview or Original) with secure headers and caching.
- **Timeline**: Retrieve image distribution data by date.

## Setup & Development

### Prerequisites
- Node.js
- npm
- Cloudflare Wrangler CLI (`npm install -g wrangler`)

### Installation

```bash
npm install
```

### Local Development

To start the development server:

```bash
npm run dev
```

### Configuration

The project uses `wrangler.jsonc` for configuration. You need to have the following bindings set up in your Cloudflare account:

- **KV Namespace**: `KV` (for storing refresh/access tokens)
- **D1 Database**: `D1_DB` (database name: `class-memories`)
- **R2 Bucket**: `R2_BUCKET` (bucket name: `class-memories-images`)
- **Variables**:
  - `R2_ENDPOINT`: Your R2 S3 API endpoint.
  - `R2_BUCKET_NAME`: The name of your R2 bucket.

You also need to set the following **Secrets** for S3 compatibility (used for generating presigned URLs):
- `R2_ACCESS_KEY_ID`: Cloudflare R2 Access Key ID.
- `R2_SECRET_ACCESS_KEY`: Cloudflare R2 Secret Access Key.

### Database Schema (D1)

The application expects the following tables in your D1 database:
- `users`: Stores user credentials and profile info.
- `posts`: Stores post content and metadata.
- `images`: Stores image metadata linked to R2.
- `comments`: Stores user comments on posts/images.
- `likes`: Stores user likes on posts/images.

## Deployment

To deploy the worker to Cloudflare:

```bash
npm run deploy
```

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.
