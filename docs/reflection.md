# Brief Reflection

## What were the key limitations you faced in this challenge?

**1. Balancing strict constraints with natural conversation.** The linguistic constraints (exact phrases like "I understand", "What concerns you most about this?", the 3-item recommendation format) are necessary for safety and consistency, but they create a rigid feel. Getting an LLM to reliably produce these exact phrases while still sounding human required extensive prompt engineering. The system now uses LLM-generated responses with deterministic templates as fallback, providing a balance between natural language and constraint compliance.

**2. Triage accuracy and context.** Initially, the deterministic rule-based triage missed nuanced cases. Moving to AI-powered triage improved contextual understanding (e.g., detecting that "I feel like something is really wrong" needs attention), but required careful prompt engineering to ensure conservative, safe decisions. The three-layer approach (critical checks → AI → fallback) provides both safety and flexibility.

**3. Stage progression rigidity.** The original fixed stage machine (greeting → clarify → concern → recommendation) couldn't adapt when emergencies were detected early. The system now performs triage at every step and intelligently skips stages for true emergencies while allowing unclear cases (like broken bones) to go through the normal flow to gather more information.

**4. Hardcoded vs. dynamic responses.** Initial implementation used hardcoded templates for everything, which felt robotic. Integrating LLM response generation while maintaining constraint compliance required careful orchestration. The system now uses AI for natural responses with templates as a reliable fallback.

**5. No persistence or patient history.** Each conversation starts fresh. A real primary care system would track prior visits, medications, allergies, and chronic conditions—context that dramatically changes triage decisions.

## How would you enhance the system to address those limitations?

**1. Enhanced validation and feedback loop.** ✅ **IMPLEMENTED** - The system now includes a validation feedback loop that validates every LLM response, provides specific feedback on errors, and retries up to 5 times. This significantly improves constraint compliance while maintaining natural language. The validator acts as the "source of truth," encoding all requirements and enforcing them through validation and repair.

**2. Two-model architecture.** Use a fast, cheap model (GPT-4o-mini) for conversational turns and a slower, more capable model (GPT-4o or Claude) for final triage/recommendation decisions. The expensive model only runs once per consultation, reducing cost while improving decision quality.

**3. Structured symptom extraction.** Add a parallel extraction layer that pulls structured data (symptom, duration, severity, location, onset) from free text into a schema. This enables richer triage logic, better red flag detection, and integration with clinical decision support tools.

**4. Clinician-in-the-loop for unclear cases.** Instead of binary mild/emergency/unclear, add a "needs human review" pathway where the AI gathers comprehensive information but defers the final recommendation to a nurse or physician who reviews the transcript asynchronously. This provides safety while scaling human expertise.

**5. Patient history integration.** Connect to a FHIR-compatible EHR to pull relevant context. A headache in a patient with hypertension history is different from a headache in a healthy 25-year-old. This would dramatically improve triage accuracy.

**6. Multi-turn clarification.** Allow the system to ask follow-up questions based on triage uncertainty, rather than immediately escalating. For example, if triage is unclear, the system could ask targeted questions to refine the decision before making a recommendation.

**7. Confidence scoring.** Add confidence levels to triage decisions. High-confidence mild cases can proceed with self-care, while low-confidence cases (even if triaged as mild) could be flagged for human review.

## What surprised you about building this system?

**1. AI triage is more reliable than expected.** The AI-powered triage with structured JSON output proved to be quite reliable and conservative, often catching edge cases that rule-based patterns missed. The combination of critical emergency checks (instant) + AI (contextual) + fallback (reliable) creates a robust system.

**2. The power of triage at every step.** Running triage on every user message, not just at the end, dramatically improved the user experience. True emergencies are caught immediately and escalated without wasting time on unnecessary questions, while unclear cases still gather information through the normal flow.

**3. Dynamic red flag questions improve engagement.** Moving from generic "do you have chest pain?" questions to symptom-specific screening (e.g., "Is this the worst headache you've ever had?" for headache cases) made the conversation feel more natural and relevant, even though it's still systematic screening.

**4. LLM responses need careful prompting and validation.** Even with a comprehensive system prompt, the LLM sometimes generates responses that don't perfectly match the required format. The validation feedback loop addresses this by checking responses and providing specific feedback for retries. The fallback to deterministic templates ensures the system always works, and the validator serves as both a test suite and specification.

**5. The validator became the source of truth.** Once comprehensive validation was in place, it became easier to iterate—change prompts, test, and see what broke. The validator encoded the design requirements better than documentation alone, serving as both a test suite and a specification. The validation feedback loop extends this by automatically correcting non-compliant responses through structured feedback and retries, making the validator an active enforcement mechanism rather than just a check.

**6. Recommendation format refinement.** Initially, the system required "How does this sound to you?" after each numbered recommendation, which felt repetitive. Refining the format to include the check-in phrase only once at the end (after all recommendations and follow-up) improved readability while maintaining the required engagement check-in.

