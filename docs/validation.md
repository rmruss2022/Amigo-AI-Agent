# Validation Plan (Infinite Resources)

## Goals
- Maximize emergency detection sensitivity/recall
- Minimize false escalation rate
- Ensure constraint compliance and clarity
- Maintain patient satisfaction and trust

## Simulation at Scale
- Generate millions of synthetic patient profiles across ages, risks, and symptoms
- Include adversarial phrasing, slang, and multi-issue narratives
- Evaluate triage outcomes against a gold standard clinical label
- Automatically score constraint compliance and jargon rate

## Clinician Review + Adjudication
- Multi-clinician blind review of responses and triage labels
- Disagreements resolved by adjudication panels
- Measure clinical appropriateness, escalation correctness, and communication clarity

## Red Teaming and Safety
- Prompt injection attempts, jailbreaks, and misleading user inputs
- Evaluate refusal behavior and escalation safety
- Test robustness to contradictory or partial information

## Metrics
- Emergency sensitivity/recall (target: very high)
- False escalation rate (target: low but acceptable for safety)
- Constraint compliance rate (target: 99.9%+)
- Jargon rate (target: near zero)
- Patient satisfaction and clarity scores

## Prospective Trials
- Controlled pilot in a virtual primary care setting
- Collect real-world outcomes and follow-up data
- Measure user satisfaction, clarity, and safety incidents

## Hospital Admin Success Criteria
- Demonstrated emergency recall above clinical threshold
- Clear evidence of constraint compliance and safe escalation
- Operational readiness with auditability and monitoring
- Positive patient satisfaction without compromising safety
