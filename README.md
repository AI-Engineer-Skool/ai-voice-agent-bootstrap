# AI Voice Agent Bootstrap

Teaching sandbox that mirrors a realtime voice agent + moderator architecture in a lightweight, persistence-free package. Use it during workshops to demonstrate how a customer satisfaction survey agent stays on track with support from a realtime moderator. The bootstrap stays self-correcting thanks to the moderator endpoint, which delivers continuous guidance back to the agent.

## Getting Started

1. Copy `backend/.env.example` to `backend/.env` and fill in your Azure OpenAI credentials (endpoint, key, API version, and deployment names). The backend uses Azure OpenAI for both realtime and moderator flows, so no OpenAI API key is required.
2. Copy `frontend/.env.example` to `frontend/.env` and adjust the API URL or moderator poll interval if needed.
3. Install backend dependencies:
   ```bash
   cd backend
   pip install -r requirements.txt
   ```
4. Install frontend dependencies:
   ```bash
   cd frontend
   npm install
   ```

## Running Locally

- **Backend**: `./scripts/run_backend.sh` (starts FastAPI on `http://localhost:8000`).
- **Frontend**: `./scripts/run_frontend.sh` (starts Vite dev server on `http://localhost:5173`).

Ensure `backend/.env` contains valid Azure OpenAI credentials so the realtime call flow and moderator guidance can connect to your resource. `AZURE_OPENAI_MODERATOR_DEPLOYMENT` should point to a chat-capable deployment, and you can override `REALTIME_MODEL` if your realtime deployment name differs from the default `gpt-realtime`. Configure the polling cadence via `frontend/.env` (`VITE_MODERATOR_INTERVAL_SECONDS`); the frontend now owns the moderator refresh interval.

## Manual Demo Flow

1. Open the frontend and press **Start Survey**. Allow microphone access when prompted.
2. The agent engages in a realtime conversation powered by your configured provider, streaming audio and transcripts to the UI.
3. Watch the moderator card highlight missing checklist items; follow the generated guidance to steer the agent.
4. Use **End Survey** to reset the state and discuss how the checklist ensures coverage.

The current build targets Azure OpenAI exclusively; integrating another provider will require additional backend changes.
