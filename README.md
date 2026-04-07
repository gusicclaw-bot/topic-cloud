# Topic Cloud

A local-first React + TypeScript workspace for organizing recurring topics as active rooms instead of dead folders.

## What it does

- Topic-based workspace navigation
- Resumable conversation threads
- Journal and pinned memory surfaces
- Import/export/reset for local data
- Archive-first cleanup for chats and notes
- Local model settings panel for OpenAI-compatible backends
- Live local-model replies using your saved Settings target

## Local model setup

Topic Cloud now sends real chat requests to the OpenAI-compatible endpoint you configure in **Settings**.

Expected fields:

- **Provider label** — just a friendly label for the UI
- **Base URL** — for example `http://localhost:1234/v1`
- **Model** — exact served model id, for example `google/gemma-4-26b-a4b`
- **API key** — optional for local servers like LM Studio; use the token your backend expects
- **Fallback model** — optional second model id to try if the primary fails

Request behavior:

- Topic Cloud tries `POST /responses` first
- if that returns no usable text, it falls back to `POST /chat/completions`
- assistant messages keep lightweight metadata about the model/endpoint used, and surface request errors inline

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Stack

- React
- TypeScript
- Vite

Built as a lightweight personal AI workspace prototype.
