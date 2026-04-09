# PocketBase Backend Setup

This branch adds user authentication and server-side chat persistence using PocketBase.

## Quick Start

### 1. Download PocketBase

```bash
mkdir backend
cd backend

# Linux
wget https://github.com/pocketbase/pocketbase/releases/download/v0.22.0/pocketbase_linux_amd64.zip
unzip pocketbase_linux_amd64.zip
chmod +x pocketbase

# macOS
# wget https://github.com/pocketbase/pocketbase/releases/download/v0.22.0/pocketbase_darwin_amd64.zip

# Windows
# wget https://github.com/pocketbase/pocketbase/releases/download/v0.22.0/pocketbase_windows_amd64.zip
```

### 2. Start PocketBase

```bash
./pocketbase serve
```

Admin UI will be available at: http://127.0.0.1:8090/_/

### 3. Setup Collections

1. Open http://127.0.0.1:8090/_/ in your browser
2. Create an admin account
3. Create the following collections:

#### Collection: `chats`
Fields:
- `topicId` (Text, required) - Topic identifier
- `title` (Text, required) - Chat title
- `parentId` (Text, optional) - Parent chat ID for forks
- `branchPoint` (Number, optional) - Message index where fork occurred
- `tags` (JSON, optional) - Array of tags
- `isArchived` (Boolean, default: false)
- `user` (Relation → users, required)

#### Collection: `messages`
Fields:
- `chat` (Relation → chats, required)
- `role` (Text, required) - 'user' or 'assistant'
- `text` (Text, required) - Message content
- `model` (Text, optional) - Model name used
- `error` (Text, optional) - Error message if failed

#### Collection: `user_settings` (optional)
Fields:
- `user` (Relation → users, required)
- `settings` (JSON) - User preferences

### 4. Configure API Rules

For each collection, set these API Rules:

**Chats:**
- List: `@request.auth.id != "" && user = @request.auth.id`
- View: `@request.auth.id != "" && user = @request.auth.id`
- Create: `@request.auth.id != ""`
- Update: `@request.auth.id != "" && user = @request.auth.id`
- Delete: `@request.auth.id != "" && user = @request.auth.id`

**Messages:**
- List: `@request.auth.id != "" && chat.user = @request.auth.id`
- View: `@request.auth.id != "" && chat.user = @request.auth.id`
- Create: `@request.auth.id != "" && chat.user = @request.auth.id`
- Update: `@request.auth.id != "" && chat.user = @request.auth.id`
- Delete: `@request.auth.id != "" && chat.user = @request.auth.id`

### 5. Start the App

```bash
# In another terminal, from the topic-cloud directory
npm run dev -- --host
```

The app will now show a login/register screen before accessing chats.

## Features

- ✅ User registration and login
- ✅ Server-side chat persistence
- ✅ Fork conversations with history
- ✅ Cross-device access (run PocketBase on a server)
- ✅ Real-time sync (optional, can be enabled)
- ✅ Data ownership (users can only access their own data)

## Deployment

### Production Setup

For production, run PocketBase behind a reverse proxy with HTTPS:

```nginx
# nginx example
server {
    listen 443 ssl;
    server_name api.yourdomain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:8090;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Update `src/pocketbase.ts` with your production URL:
```typescript
export const pb = new PocketBase('https://api.yourdomain.com');
```

### Backup

PocketBase stores everything in the `pb_data` folder. Simply back up this folder:

```bash
cp -r backend/pb_data backup/pb_data_$(date +%Y%m%d)
```

## Merging to Main

After testing:

```bash
git checkout main
git merge feature/pocketbase-auth
```

Or create a pull request on GitHub/GitLab.
