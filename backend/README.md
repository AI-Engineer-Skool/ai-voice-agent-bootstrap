# AI Voice Agent Bootstrap – Backend

FastAPI service that powers the realtime voice agent demo. It mints Azure OpenAI realtime sessions, stores minimal in-memory state for the active workshop run, and surfaces moderator guidance based on transcript snippets.

## Quickstart

```bash
cp .env.example .env                # fill in Azure credentials
uv sync --frozen                    # or: python -m venv .venv && .venv/bin/pip install -r requirements.txt
uv run uvicorn app.main:app --reload
```

When working from the repository root you can instead run `../scripts/run_backend.sh`, which wraps the same flow and manages the `.venv/` automatically.

## Runtime Configuration

All settings are loaded from environment variables defined in `.env`:

| Variable | Purpose |
| --- | --- |
| `PROVIDER` | Realtime provider. Only `azure` is currently supported. |
| `AZURE_OPENAI_ENDPOINT` | Base endpoint for your Azure OpenAI resource (e.g. `https://my-resource.openai.azure.com`). |
| `AZURE_OPENAI_KEY` | API key for the resource. |
| `AZURE_OPENAI_API_VERSION` | API version used for moderator completions (default `2025-04-01-preview`). |
| `AZURE_OPENAI_MODERATOR_DEPLOYMENT` | Chat-capable deployment that generates moderator guidance. |
| `AZURE_OPENAI_REALTIME_ENDPOINT` | WebRTC gateway URL exposed by your realtime deployment. |
| `REALTIME_MODEL` | Optional override for the realtime deployment name (`gpt-realtime` by default). |
| `VOICE_NAME` | Azure neural voice to use for the agent (`alloy` by default). |
| `CORS_ORIGINS` | JSON list of allowed frontend origins. |

## Project Layout

- `app/main.py` – application factory, CORS policy, and router wiring.
- `app/api/` – versionless endpoints: health probe, realtime session minting, moderator guidance.
- `app/services/` – integrations and orchestration (`azure_realtime`, `moderator_engine`, `prompt_builder`).
- `app/prompts/` – markdown files that define the agent persona, moderator instructions, and survey checklist.
- `app/schemas/` – Pydantic models shared between the API and services layers.

## API Surface

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health/ping` | Liveness probe. |
| `POST` | `/api/sessions` | Creates a session, returning a WebRTC URL, ephemeral client secret, checklist, and metadata. |
| `POST` | `/api/moderator/guidance` | Analyses the transcript and returns coaching text, checklist status, and tone classification. |

Sessions are ephemeral: the service keeps them in memory for the length of the workshop and does not persist transcript data.

## Development Notes

- The moderator engine requires all Azure environment variables (`AZURE_*`) to be present; otherwise the API responds with `500` so you notice misconfiguration early.
- `uv` is the preferred dependency manager and will reuse `.venv/`. If you use another environment manager, make sure `fastapi`, `uvicorn[standard]`, `aiohttp`, and `openai` match the versions in `pyproject.toml`.
- There is no database; restarts clear the in-memory session store. This is intentional for workshop simplicity.
