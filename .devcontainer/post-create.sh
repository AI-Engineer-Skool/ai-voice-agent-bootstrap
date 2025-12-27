#!/bin/bash
set -e

echo "Setting up AI Voice Agent Bootstrap development environment..."

# Backend setup
echo "Setting up backend..."
cd /workspaces/ai-voice-agent-bootstrap/backend

# Create .env from example if it doesn't exist
if [ ! -f .env ] && [ -f .env.example ]; then
    cp .env.example .env
    echo "Created backend .env from .env.example"
fi

# Create virtual environment and install dependencies using uv
uv venv .venv --clear
source .venv/bin/activate
uv sync
deactivate

echo "Backend setup complete!"

# Frontend setup
echo "Setting up frontend..."
cd /workspaces/ai-voice-agent-bootstrap/frontend

# Create .env from example if it doesn't exist
if [ ! -f .env ] && [ -f .env.example ]; then
    cp .env.example .env
    echo "Created frontend .env from .env.example"
fi

# Install npm dependencies
npm install

echo "Frontend setup complete!"

echo ""
echo "Development environment ready!"
echo ""
echo "To start the backend:  cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --host 0.0.0.0"
echo "To start the frontend: cd frontend && npm run dev"
echo ""
echo "Remember to configure your Azure OpenAI OR OpenAI credentials in backend/.env"
