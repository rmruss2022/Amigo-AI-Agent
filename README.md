# Amigo Primary Care Prototype

Policy-guided AI chat prototype that conducts a primary-care-style consultation for mild and emergency symptoms, with deterministic triage, validation, and repair.

## Requirements
- Node.js 20+
- npm

## Quick start
```bash
npm install
npm run dev
```
Open `http://localhost:3000`.

## Environment variables
Create a `.env.local` file:
```
LLM_MODE=mock
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4o-mini
```
- `LLM_MODE=mock` runs without external API keys (default).
- `LLM_MODE=openai` uses OpenAI chat completions.

## Demo scripts
Use the scenario preset buttons:
- Mild Headache
- Fatigue
- Chest Pain
- Trouble Breathing

The log panel shows triage decisions, red flags, and validation status.

## Tests
```bash
npm run test
```

## Docs and prompts
- `docs/design.md` system design (includes mermaid diagrams)
- `docs/validation.md` validation plan
- `docs/reflection.md` brief reflection
- `docs/transcripts/` sample transcripts
- `prompts/system.md` system prompt (<= 500 words)

## Architecture highlights
- Policy layer: deterministic triage + constraint validation
- LLM layer: response generation (mock or OpenAI)
- Repair step: deterministic template if validation fails
