# AI Voice Agent Bootstrap

Video Tutorial:
https://youtu.be/kU4L-JXq9sM

Lightweight teaching environment for a realtime customer-satisfaction survey agent with a human moderator. The backend issues short-lived realtime sessions, while the frontend handles microphone input, conversation monitoring, and moderator prompts. No database or background services required.

## Getting Started

### 🚀 Dev Container (Recommended)

**This project is devcontainer-first. The easiest way to get started:**

#### 1. Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [VS Code](https://code.visualstudio.com/)
- [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
- OpenAI API key with Realtime API access ([get one here](https://platform.openai.com/api-keys))

#### 2. Open in Dev Container

- Click **"Reopen in Container"** in VS Code
- Or: `Cmd/Ctrl+Shift+P` → **"Dev Containers: Reopen in Container"**
- Wait ~2-3 minutes for initial build

VS Code automatically:

1. Builds the container with Python 3.12 and Node.js 24
2. Installs backend and frontend dependencies
3. Forwards ports 8000 (backend) and 5173 (frontend)

#### 3. Add your API key

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and set your OpenAI API key:
```bash
OPENAI_API_KEY=sk-your-openai-api-key
```

Skip to [Running the App](#running-the-app).

---

### 💻 Local Setup (Without Dev Container)

#### Prerequisites

- Python **3.12**
- Node.js **24+**
- OpenAI API key with Realtime API access ([get one here](https://platform.openai.com/api-keys))
- Optional: [`uv`](https://github.com/astral-sh/uv) for faster Python dependency management

#### Setup

1. **Configure the backend**
   ```bash
   cp backend/.env.example backend/.env
   ```
   Edit `backend/.env` and add your OpenAI API key:
   ```bash
   OPENAI_API_KEY=sk-your-openai-api-key
   ```

2. **Install backend dependencies**
   ```bash
   cd backend
   uv sync --frozen  # or: python -m venv .venv && .venv/bin/pip install -r requirements.txt
   ```

3. **Install frontend dependencies**
   ```bash
   cp frontend/.env.example frontend/.env
   cd frontend
   npm install
   ```

---

## Running the App

```bash
# Terminal 1:
./scripts/run_backend.sh      # http://localhost:8000

# Terminal 2:
./scripts/run_frontend.sh     # http://localhost:5173
```

Open http://localhost:5173, allow microphone access, and click **Start Survey**.

## Configuration

### Backend Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | Yes | - | Your OpenAI API key |
| `OPENAI_MODERATOR_MODEL` | No | `gpt-5-chat-latest` | Model for moderator guidance |

### Frontend Environment Variables

Set these in `frontend/.env`:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_MODERATOR_INTERVAL_SECONDS` | No | `60` | How often (in seconds) to poll for moderator guidance. Minimum: 5 seconds. |

## Demo Flow

1. Open the app and accept microphone permission
2. Click **Start Survey** - the agent will greet you
3. Have a conversation - the moderator card shows guidance and checklist progress
4. Click **End Survey** when done

## API Reference

- `POST /api/sessions` - creates a new realtime session
- `POST /api/moderator/guidance` - analyzes transcript and returns coaching
- `GET /api/health/ping` - health check

## Troubleshooting

- **No audio** - check browser microphone permissions and audio output device
- **Connection fails** - verify your `OPENAI_API_KEY` is valid and has Realtime API access
- **CORS errors** - ensure `CORS_ORIGINS` includes your frontend URL

---

## Alternative: Azure OpenAI

If you prefer Azure OpenAI over OpenAI, you can configure the backend to use Azure instead.

### Azure Prerequisites

- Azure subscription with an Azure OpenAI resource
- Realtime deployment (e.g., `gpt-4o-realtime-preview` or `gpt-realtime`)
- Chat deployment for moderator (e.g., `gpt-4o`)
- See: [Azure OpenAI Realtime Audio Quickstart](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/realtime-audio-quickstart)

### Azure Configuration

Edit `backend/.env`:
```bash
PROVIDER=azure
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_KEY=your-azure-key
AZURE_OPENAI_MODERATOR_DEPLOYMENT=your-chat-deployment-name
AZURE_OPENAI_REALTIME_ENDPOINT=https://your-resource.openai.azure.com/openai/realtime
```

### Azure Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PROVIDER` | Yes | `openai` | Set to `azure` |
| `AZURE_OPENAI_ENDPOINT` | Yes | - | Azure resource endpoint |
| `AZURE_OPENAI_KEY` | Yes | - | Azure API key |
| `AZURE_OPENAI_MODERATOR_DEPLOYMENT` | Yes | - | Chat deployment name |
| `AZURE_OPENAI_REALTIME_ENDPOINT` | Yes | - | WebRTC gateway URL |
| `AZURE_OPENAI_API_VERSION` | No | `2025-04-01-preview` | API version |
