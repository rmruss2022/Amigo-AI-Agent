# System Design

## Overview
This prototype is a policy-guided AI consultation system with a hybrid architecture: AI-powered triage and LLM-generated responses, controlled by deterministic policy layers that enforce safety constraints, validate outputs, and provide fallback templates.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         React Chat UI                           │
│  (Single-page chat interface with safety notice and logs)     │
└────────────────────────────┬────────────────────────────────────┘
                             │ POST /api/chat
                             │ { messages, stage }
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      /api/chat Route                            │
│  • Parses conversation history                                  │
│  • Determines effective stage based on triage                  │
│  • Orchestrates LLM response generation                         │
└───────────────┬─────────────────────────────────────────────────┘
                │
                ├─────────────────────────────────────┐
                │                                     │
                ▼                                     ▼
┌──────────────────────────────┐    ┌──────────────────────────────┐
│      Triage Layer            │    │     LLM Response Layer        │
│  (AI-Powered + Fallback)     │    │  (OpenAI GPT-4o-mini)        │
│                              │    │                              │
│  1. Critical Emergency       │    │  • Loads system prompt       │
│     Check (instant)          │    │  • Generates natural         │
│                              │    │    language response         │
│  2. AI Triage (OpenAI)       │    │  • Falls back to templates   │
│     - Structured JSON        │    │    if API fails              │
│     - Conservative           │    │                              │
│                              │    │  ┌──────────────────────┐   │
│  3. Rule-Based Fallback      │    │  │  Validation Loop     │   │
│     (if AI unavailable)      │    │  │  (if implemented)     │   │
│                              │    │  └──────────────────────┘   │
└───────────────┬──────────────┘    └───────────────┬──────────────┘
                │                                     │
                │ triage.level                       │ response text
                │                                     │
                ▼                                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Policy Layer                                 │
│  • Stage determination (skip emergency, normal flow unclear)  │
│  • Response validation (constraints, phrases, format)          │
│  • Repair templates (fallback for invalid/mock mode)           │
└───────────────┬─────────────────────────────────────────────────┘
                │
                │ { message, nextStage, triage, validation }
                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         React Chat UI                           │
│  • Displays response                                            │
│  • Shows emergency escalation if needed                         │
│  • Updates conversation state                                    │
└─────────────────────────────────────────────────────────────────┘
```

## LLM Response Generation Flow

```
User Message
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  Triage Check (Every Step)                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 1. Critical Emergency Patterns (instant regex)       │   │
│  │    → If match: return "emergency" immediately       │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 2. AI Triage (OpenAI API call)                       │   │
│  │    • Structured JSON output                          │   │
│  │    • Conservative triage decision                   │   │
│  │    • Returns: level, redFlags, highRisk, reasoning  │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 3. Rule-Based Fallback (if AI fails)                 │   │
│  │    • Pattern matching                                │   │
│  │    • Red flags, high risk, severe signals            │   │
│  └──────────────────────────────────────────────────────┘   │
└───────────────────────┬───────────────────────────────────────┘
                        │
                        ▼
            ┌───────────────────────┐
            │  Triage Decision      │
            │  • emergency          │
            │  • unclear            │
            │  • mild               │
            └───────────┬───────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        ▼               ▼               ▼
   Emergency      Unclear/High      Mild Case
   Detected       Risk Case        Normal Flow
        │               │               │
        │               │               │
        ▼               ▼               ▼
   Skip to        Normal Flow      Normal Flow
   Recommendation (clarify→concern→recommendation)
        │               │               │
        └───────────────┼───────────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │  Determine Effective Stage     │
        │  • emergency → recommendation  │
        │  • unclear → current stage     │
        │  • mild → current stage        │
        └───────────────┬───────────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │  LLM Response Generation       │
        │  ┌─────────────────────────┐  │
        │  │ Mode: OpenAI (if key)   │  │
        │  │ • Load system prompt    │  │
        │  │ • Include stage context │  │
        │  │ • Include triage level  │  │
        │  │ • Generate response     │  │
        │  └─────────────────────────┘  │
        │  ┌─────────────────────────┐  │
        │  │ Mode: Mock (fallback)   │  │
        │  │ • Use repair templates  │  │
        │  │ • Deterministic output │  │
        │  └─────────────────────────┘  │
        └───────────────┬───────────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │  Return Response              │
        │  • message                    │
        │  • nextStage                  │
        │  • triage info                │
        │  • emergencyAction (if any)   │
        └───────────────────────────────┘
```

## Conversation Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Greeting Stage                            │
│  • Safety disclaimer                                        │
│  • Consent                                                  │
│  • Timeline question                                        │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                    Clarify Stage                             │
│  • Acknowledge with "I understand"                          │
│  • Show empathy (pain/worry)                                │
│  • Dynamic red flag questions (based on symptoms)           │
│  • Triage check → if emergency, skip to recommendation      │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                    Concern Stage                            │
│  • "I understand"                                            │
│  • Empathy (if applicable)                                  │
│  • Ask: "What concerns you most about this?"                │
│  • Triage check → if emergency, skip to recommendation      │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                Recommendation Stage                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Mild Case:                                            │  │
│  │ • Exactly 3 numbered self-care recommendations       │  │
│  │ • Each ends with "How does this sound to you?"       │  │
│  │ • 3-day follow-up timeframe                          │  │
│  │ • Disclaimer                                          │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Emergency Case:                                       │  │
│  │ • "Based on what you've told me..."                  │  │
│  │ • "This is beyond what I can safely assess remotely" │  │
│  │ • Specific action (call 911 / urgent care)           │  │
│  │ • Disclaimer (no 3-day follow-up)                    │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Unclear/High Risk Case:                               │  │
│  │ • Similar to emergency but less urgent                │  │
│  │ • "Go to urgent care today" (not 911)                │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Triage System

### Three-Layer Architecture

**Layer 1: Critical Emergency Check (Instant)**
- Runs BEFORE any API calls
- Regex pattern matching for life-threatening symptoms
- Examples: chest pain + breathing trouble, stroke-like symptoms, severe bleeding
- Returns: `emergency` immediately

**Layer 2: AI Triage (OpenAI)**
- Uses GPT-4o-mini with structured JSON output
- Conservative approach: "when in doubt, escalate"
- Includes broken bones, fractures, dislocations as needing medical attention
- Returns: `{ level, redFlags, highRisk, severeSignals, reasoning }`
- Falls back to Layer 3 if API unavailable

**Layer 3: Rule-Based Fallback**
- Pattern matching for red flags, high risk, severe signals
- Used when AI unavailable or fails
- Ensures system always has triage capability

### Triage Levels

- **Emergency**: Life-threatening symptoms requiring immediate medical attention
  - Chest pain with breathing trouble
  - Stroke-like symptoms
  - Severe allergic reactions
  - Severe bleeding, seizures
  - Skips directly to recommendation stage

- **Unclear**: Needs medical evaluation but not immediately life-threatening
  - Broken bones, fractures, dislocations
  - High-risk patients (pregnant, infants, immunocompromised) with symptoms
  - Goes through normal flow: clarify → concern → recommendation

- **Mild**: Common, non-urgent symptoms manageable with self-care
  - Mild headaches, fatigue, minor cold symptoms
  - Goes through normal flow: clarify → concern → recommendation

## Policy Layer

The policy layer enforces safety and linguistic constraints:

### Stage Management
- Determines effective stage based on triage result
- Only TRUE emergencies skip to recommendation
- Unclear cases go through normal flow

### Response Validation
- Exact phrases: "I understand", "What concerns you most about this?"
- No banned phrases: "I see", "I hear", "don't worry"
- No medical jargon (uses lay terms)
- Format requirements (3 numbered recs for mild, emergency template structure)
- Empathy requirements (pain/worry detection)

### Repair Templates
- Deterministic fallback when LLM unavailable or fails
- Stage-specific templates
- Symptom-aware (dynamic red flag questions)
- Guarantees constraint compliance

## LLM Response Generation

### OpenAI Mode (when API key available)
1. Loads system prompt from `/prompts/system.md`
2. Includes conversation history
3. Adds stage and triage context
4. Generates natural language response
5. Falls back to repair templates on error

### Mock Mode (no API key)
- Uses deterministic repair templates
- Fully compliant with all constraints
- Suitable for local demos and testing

## Dynamic Features

### Context-Aware Red Flag Questions
Instead of generic questions, the system generates symptom-specific screening:
- **Headache** → "Is this the worst headache ever?", "Neck stiffness?", "Vision changes?"
- **Chest/Breathing** → "Chest pain?", "Blue lips?", "Lightheaded?"
- **Stomach** → "Vomiting blood?", "Severe pain?", "Keep fluids down?"
- **Dizziness** → "One-sided weakness?", "Trouble speaking?", "Fainted?"

### Triage at Every Step
- Triage runs on EVERY user message
- Emergency detection can happen at any stage
- Allows immediate escalation without wasting steps

## Frontend UX

- Single-page chat interface
- Persistent safety notice
- Emergency escalation banner with "Call 911" / "Find urgent care" CTAs
- Collapsible log panel showing:
  - LLM mode (openai/mock)
  - Triage decision and reasoning
  - Red flags, high risk factors, severe signals
  - Validation status

## Safety Guarantees

1. **Critical emergencies detected instantly** (before any API call)
2. **Conservative AI triage** (errs on side of caution)
3. **Deterministic fallbacks** (system works even if AI fails)
4. **Constraint validation** (all responses checked for compliance)
5. **Repair templates** (guaranteed compliant output)
