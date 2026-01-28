# Brief Reflection

## What were the key limitations you faced in this challenge?

**1. Balancing strict constraints with natural conversation.** The linguistic constraints (exact phrases like "I understand", "What concerns you most about this?", the 3-item recommendation format) are necessary for safety and consistency, but they create a rigid feel. Getting an LLM to reliably produce these exact phrases while still sounding human required extensive prompt engineering and a retry loop.

**2. The staged flow limits flexibility.** Real consultations are non-linear—patients interrupt, circle back, or reveal critical information late. The fixed greeting → clarify → concern → recommendation pipeline handles the common case but can't gracefully adapt when a patient suddenly mentions chest pain after discussing a headache.

**3. Triage is pattern-based, not contextual.** The deterministic triage catches explicit red flags ("chest pain with shortness of breath") but misses nuanced presentations. A patient saying "I feel like something is really wrong" without specific symptoms won't trigger escalation, even though that gut feeling can be clinically significant.

**4. No persistence or patient history.** Each conversation starts fresh. A real primary care system would track prior visits, medications, allergies, and chronic conditions—context that dramatically changes triage decisions.

## How would you enhance the system to address those limitations?

**1. Hybrid conversation flow.** Replace the rigid stage machine with a goal-based architecture: the system tracks which required questions have been answered (timeline, red-flag screening, concerns) and dynamically asks missing ones rather than forcing a fixed order.

**2. Two-model architecture.** Use a fast, cheap model (GPT-4o-mini) for conversational turns and a slower, more capable model (GPT-4o or Claude) for final triage/recommendation decisions. The expensive model only runs once per consultation.

**3. Structured symptom extraction.** Add a parallel extraction layer that pulls structured data (symptom, duration, severity, location) from free text into a schema. This enables richer triage logic and integration with clinical decision support tools.

**4. Clinician-in-the-loop for unclear cases.** Instead of binary mild/emergency, add a "needs human review" pathway where the AI gathers information but defers the recommendation to a nurse or physician who reviews the transcript asynchronously.

**5. Patient history integration.** Connect to a FHIR-compatible EHR to pull relevant context. A headache in a patient with hypertension history is different from a headache in a healthy 25-year-old.

## What surprised you about building this system?

**1. How hard it is to get exact phrases from an LLM.** Even with explicit instructions, models paraphrase, add hedging, or subtly change wording. The validation + feedback + retry loop was necessary—prompting alone wasn't reliable. I ended up needing a fallback template system (`repair.ts`) as a safety net.

**2. The power of deterministic guardrails.** Running triage *before* the LLM call means emergency detection doesn't depend on the model's judgment. This separation of concerns—pattern matching for safety, LLM for natural language—felt like the right architecture for medical applications.

**3. How much the constraints shaped the UX.** The required empathy phrases ("That sounds really uncomfortable", "It's completely understandable that you're concerned") initially felt robotic, but in testing they actually made the AI feel more attentive than a free-form response. Constraints can improve, not just limit, the experience.

**4. The validator became the source of truth.** Once I had a comprehensive validator, I could iterate quickly—change the prompt, run validation, see what broke. The validator encoded the design doc requirements better than the prompt did, and became the real specification for correct behavior.
