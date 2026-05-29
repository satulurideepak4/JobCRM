from typing import List, Dict, Optional
import llm_service

MAX_QUESTIONS = 10
MAX_JD_CHARS = 2200
MAX_TURNS_FOR_NEXT_Q = 14
MAX_MSG_CHARS_FOR_NEXT_Q = 550
MAX_QA_PAIRS_FOR_DEBRIEF = 12
MAX_Q_CHARS_FOR_DEBRIEF = 350
MAX_A_CHARS_FOR_DEBRIEF = 700


def build_system_prompt(mode: str, jd_text: str, concept: str, profile: dict) -> str:
    role = profile.get("role", "Software Engineer")
    skills_list = profile.get("skills", [])
    if isinstance(skills_list, list):
        skills = ", ".join(skills_list[:10])
    else:
        skills = str(skills_list)
    experience = profile.get("experience_years", "")

    context_parts = []
    if jd_text:
        context_parts.append(f"Job Description:\n{jd_text[:MAX_JD_CHARS]}")
    if concept:
        context_parts.append(f"Topic/Concept to test: {concept}")
    context = "\n\n".join(context_parts)

    total = profile.get("total_questions", MAX_QUESTIONS)

    return f"""You are an experienced technical interviewer conducting a mock interview.

Candidate profile:
- Target role: {role}
- Key skills: {skills}
- Experience: {experience} years

{context}

Interview rules:
- Ask ONE question at a time. Never ask multiple questions in one turn.
- Keep questions concise and clear (2-3 sentences max).
- Vary question types: technical, behavioral, situational, problem-solving.
- After each answer, give a VERY brief acknowledgment (one short sentence like "Got it." or "Interesting approach.") before the next question. Do not give detailed feedback mid-interview.
- Base questions on the JD/concept provided. Go deeper as interview progresses.
- Track what has been covered — do not repeat similar questions.
- When you receive a garbled or unclear answer, ask a gentle follow-up to clarify rather than ignoring it.
- After {total} questions have been asked, end with exactly this phrase: "That concludes our interview. Let me share your feedback now."
- Responses must be plain text only. No markdown, no bullet points, no JSON. Write as you would speak aloud.
- Keep responses short. The candidate needs to hear questions, not read essays.
- Do NOT respond in JSON format under any circumstances."""


async def get_next_response(conversation: List[Dict], system_prompt: str) -> str:
    """Send conversation history to LLM and get next interviewer response."""
    messages_text = ""
    for msg in conversation[-MAX_TURNS_FOR_NEXT_Q:]:
        role_label = "Interviewer" if msg["role"] == "assistant" else "Candidate"
        content = (msg.get("content") or "").strip()
        if len(content) > MAX_MSG_CHARS_FOR_NEXT_Q:
            content = content[:MAX_MSG_CHARS_FOR_NEXT_Q] + "..."
        messages_text += f"{role_label}: {content}\n\n"

    prompt = f"""{system_prompt}

Conversation so far:
{messages_text}

Now respond as the interviewer. One question or closing statement only. Plain text, no markdown, no JSON, no bullet points. Speak naturally."""

    result = await llm_service.generate(prompt)
    if isinstance(result, str):
        return result.strip()
    if isinstance(result, dict):
        # llm_service sometimes returns parsed JSON — fall back to string
        return str(result)
    return "Let's continue. Can you walk me through a challenging technical problem you solved recently?"


async def generate_debrief(conversation: List[Dict], profile: dict, jd_text: str, concept: str) -> str:
    role = profile.get("role", "Software Engineer")

    qa_pairs = []
    msgs = conversation
    for i, msg in enumerate(msgs):
        if msg["role"] == "assistant" and i + 1 < len(msgs) and msgs[i + 1]["role"] == "user":
            q = (msg.get("content") or "").strip()
            a = (msgs[i + 1].get("content") or "").strip()
            if len(q) > MAX_Q_CHARS_FOR_DEBRIEF:
                q = q[:MAX_Q_CHARS_FOR_DEBRIEF] + "..."
            if len(a) > MAX_A_CHARS_FOR_DEBRIEF:
                a = a[:MAX_A_CHARS_FOR_DEBRIEF] + "..."
            qa_pairs.append(f"Q: {q}\nA: {a}")

    qa_pairs = qa_pairs[-MAX_QA_PAIRS_FOR_DEBRIEF:]

    qa_text = "\n\n".join(qa_pairs)

    context = ""
    if jd_text:
        context += f"Job Description (first 1000 chars): {jd_text[:1000]}\n"
    if concept:
        context += f"Topic tested: {concept}\n"

    prompt = f"""You evaluated a mock interview for a {role} candidate.

{context}

Here are the question-answer pairs from the interview:
{qa_text}

Write a comprehensive debrief with these sections:
1. Overall Assessment (2-3 sentences, honest)
2. Strengths (3 bullet points of what they did well)
3. Areas to Improve (3 bullet points with specific advice)
4. Score (X/10 with one-line justification)
5. Recommended Next Steps (2-3 concrete actions)

Be honest and constructive. Plain text only, no markdown formatting, no JSON. Use simple numbered sections."""

    result = await llm_service.generate(prompt)
    if isinstance(result, str):
        return result.strip()
    if isinstance(result, dict):
        return str(result)
    return "Interview complete. Review your answers above for self-assessment."
