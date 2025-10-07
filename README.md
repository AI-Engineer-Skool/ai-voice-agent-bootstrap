# AI Voice Agent Bootstrap

Video Tutorial:
https://youtu.be/kU4L-JXq9sM

Lightweight teaching environment that mirrors a realtime customer-satisfaction survey agent working alongside a human moderator. The backend issues short-lived Azure OpenAI realtime sessions, while the frontend guides a workshop participant through connecting their microphone, monitoring the conversation, and following moderator prompts to keep the agent on track. No database or background services are required, making it easy to demo end-to-end voice flows in minutes.

## Architecture

- **FastAPI backend (`backend/`)** – exposes `/api/sessions` to mint realtime WebRTC credentials, `/api/moderator/guidance` for checklist feedback, and `/api/health` for readiness checks.
- **React + Vite frontend (`frontend/`)** – single-page UI that starts and stops voice sessions, renders a transcript, and polls the moderator guidance endpoint.
- **Shell helpers (`scripts/`)** – wrapper scripts that install dependencies on demand and launch the dev servers.

## Prerequisites

- Python **3.12**
- Node.js **18+** (or a compatible npm release)
- Optional but recommended: [`uv`](https://github.com/astral-sh/uv) for backend dependency management
- Azure OpenAI resource with both realtime (e.g. `gpt-realtime`) and chat-capable deployments (e.g. `gpt-5-chat`)

## Setup

1. **Backend environment**
   ```bash
   cp backend/.env.example backend/.env
   ```
   Populate the Azure variables with your resource endpoint, API key, chat deployment name (for moderator prompts), and realtime WebRTC gateway URL. Adjust `VOICE_NAME`, `REALTIME_MODEL`, or `CORS_ORIGINS` if you need non-default values.

2. **Backend dependencies**
   ```bash
   cd backend
   uv sync --frozen  # or: python -m venv .venv && .venv/bin/pip install -r requirements.txt
   ```

3. **Frontend environment & dependencies**
   ```bash
   cp frontend/.env.example frontend/.env
   cd frontend
   npm install
   ```
   Update `VITE_API_BASE_URL` if the backend runs on a non-default host or port, and tweak `VITE_MODERATOR_INTERVAL_SECONDS` to control how often moderator guidance is refreshed.

## Running Locally

From the repository root:

```bash
./scripts/run_backend.sh      # starts uvicorn on http://localhost:8000
./scripts/run_frontend.sh     # installs packages (if needed) and launches Vite on http://localhost:5173
```

The backend script prefers `uv` and reuses `.venv/`; it falls back to a standard virtualenv + `pip install -r requirements.txt` if `uv` is unavailable. The frontend script runs `npm install` before `npm run dev -- --host` so the UI is reachable from other devices on your LAN.

## Demo Flow

1. Open `http://localhost:5173`, accept the microphone permission prompt, and press **Start Survey**.
2. The frontend requests a session from `/api/sessions`, obtains a short-lived WebRTC credential, and connects to the Azure realtime endpoint.
3. Audio and transcript updates stream back into the UI; checklist items from the bootstrap prompt populate the moderator card.
4. The UI polls `/api/moderator/guidance` with the running transcript. Use the guidance text and tone alerts to coach the agent.
5. Press **End Survey** to complete the flow. This clears the frontend stores, stops media tracks, and releases the ephemeral session.

## API Reference (workshop-friendly)

- `POST /api/sessions` → returns `session_id`, `webrtc_url`, `ephemeral_key`, current checklist, and the chosen realtime model/voice.
- `POST /api/moderator/guidance` → accepts `{ session_id, transcript[] }` and responds with guidance text, tone alerts, and checklist completion state.
- `GET /api/health/ping` → simple liveness probe used by deployment scripts.

The backend keeps minimal in-memory session state (_no persistence layer_) and assumes a single workshop facilitator will run the demo.

## Troubleshooting

- **Missing realtime key** – double-check `AZURE_OPENAI_KEY` and that the resource has the Realtime API enabled. The backend logs the Azure response body on failure.
- **WebRTC cannot connect** – ensure `AZURE_OPENAI_REALTIME_ENDPOINT` matches the WebRTC gateway for your region; the value usually ends with `/openai/realtime`.
- **Moderator never updates** – confirm your chat deployment name in `AZURE_OPENAI_MODERATOR_DEPLOYMENT` and that `VITE_MODERATOR_INTERVAL_SECONDS` is reasonable (default 60s).

With the prerequisites in place you can clone the project, fill the `.env` files, run the two scripts, and have a repeatable voice-agent + moderator demo ready for workshops.
