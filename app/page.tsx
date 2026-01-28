"use client";

import { useEffect, useMemo, useState } from "react";

type Stage = "greeting" | "clarify" | "concern" | "recommendation";
type ChatMessage = { role: "user" | "assistant"; content: string };

type TriageLog = {
  level: "mild" | "emergency" | "unclear";
  redFlags: string[];
  highRisk: string[];
  severeSignals: string[];
};

type ValidationLog = {
  ok: boolean;
  errors: string[];
  repaired: boolean;
  draftOk: boolean;
  llmError: string | null;
};

type Mode = "mock" | "openai";


export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [stage, setStage] = useState<Stage>("greeting");
  const [triageLog, setTriageLog] = useState<TriageLog | null>(null);
  const [validationLog, setValidationLog] = useState<ValidationLog | null>(null);
  const [mode, setMode] = useState<Mode>("mock");
  const [loading, setLoading] = useState(false);
  const [emergencyAction, setEmergencyAction] = useState<string | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);

  const isEscalated = useMemo(() => {
    return emergencyAction !== null;
  }, [emergencyAction]);

  const sendToApi = async (payload: { messages: ChatMessage[]; stage: Stage }) => {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error("Failed to reach chat service.");
    }
    return (await response.json()) as {
      message: string;
      nextStage: Stage;
      mode: Mode;
      triage: TriageLog;
      validation: ValidationLog;
      emergencyAction: string | null;
    };
  };

  useEffect(() => {
    if (messages.length > 0) return;
    setLoading(true);
    sendToApi({ messages: [], stage: "greeting" })
      .then((data) => {
        setMode(data.mode);
        setTriageLog(data.triage);
        setValidationLog(data.validation);
        setMessages([{ role: "assistant", content: data.message }]);
        setStage(data.nextStage);
      })
      .finally(() => setLoading(false));
  }, [messages.length]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading || isEscalated) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const data = await sendToApi({ messages: nextMessages, stage });
      setMode(data.mode);
      setTriageLog(data.triage);
      setValidationLog(data.validation);
      setMessages([...nextMessages, { role: "assistant" as const, content: data.message }]);
      setStage(data.nextStage);
      setEmergencyAction(data.emergencyAction);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold">Amigo Primary Care Prototype</h1>
          <p className="text-slate-600">
            A policy-guided AI consultation with deterministic safety checks.
          </p>
        </header>

        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong className="block text-base">Safety Notice</strong>
          This tool provides general guidance only. If you think you are in immediate danger,
          please call 911 now.
        </section>

        {isEscalated && (
          <section className="rounded-xl border border-red-200 bg-red-50 p-4">
            <div className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold text-red-800">Emergency Escalation</h2>
              <p className="text-red-700">{emergencyAction}</p>
              <div className="flex flex-wrap gap-3">
                <a
                  href="tel:911"
                  className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white"
                >
                  Call 911
                </a>
                <a
                  href="https://www.urgentcarelocations.org/"
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-red-300 px-4 py-2 text-sm font-semibold text-red-700"
                >
                  Find urgent care
                </a>
              </div>
            </div>
          </section>
        )}

        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-col gap-4 p-4">
            <div className="min-h-[320px] space-y-4">
              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                    message.role === "assistant"
                      ? "bg-slate-100 text-slate-800"
                      : "ml-auto bg-blue-600 text-white"
                  }`}
                >
                  {message.content.split("\n").map((line, lineIndex) => (
                    <p key={`${index}-${lineIndex}`}>{line}</p>
                  ))}
                </div>
              ))}
              {loading && (
                <div className="max-w-[85%] rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
                  Thinking...
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 border-t border-slate-100 pt-4">
              <textarea
                className="h-24 w-full resize-none rounded-lg border border-slate-200 p-3 text-sm focus:border-blue-500 focus:outline-none"
                placeholder={
                  isEscalated
                    ? "Escalation active. Further AI advice is disabled."
                    : "Describe your symptoms..."
                }
                value={input}
                onChange={(event) => setInput(event.target.value)}
                disabled={loading || isEscalated}
              />
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Stage: {stage}</span>
                <button
                  onClick={handleSend}
                  disabled={loading || isEscalated}
                  className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <button
            className="text-sm font-semibold text-slate-700"
            onClick={() => setLogsOpen((open) => !open)}
          >
            {logsOpen ? "Hide" : "Show"} decision logs
          </button>
          {logsOpen && (
            <div className="mt-3 grid gap-3 text-sm text-slate-600">
              <div>
                <strong className="text-slate-700">LLM mode:</strong> {mode}
              </div>
              <div>
                <strong className="text-slate-700">Triage decision:</strong>{" "}
                {triageLog ? triageLog.level : "Not available yet"}
              </div>
              <div>
                <strong className="text-slate-700">Red flags:</strong>{" "}
                {triageLog?.redFlags?.length ? triageLog.redFlags.join(", ") : "None"}
              </div>
              <div>
                <strong className="text-slate-700">High risk:</strong>{" "}
                {triageLog?.highRisk?.length ? triageLog.highRisk.join(", ") : "None"}
              </div>
              <div>
                <strong className="text-slate-700">Severe signals:</strong>{" "}
                {triageLog?.severeSignals?.length ? triageLog.severeSignals.join(", ") : "None"}
              </div>
              <div>
                <strong className="text-slate-700">Validation:</strong>{" "}
                {validationLog?.ok ? "Pass" : "Fail"}
                {validationLog?.repaired && " (repaired)"}
              </div>
              {validationLog?.errors?.length ? (
                <div>
                  <strong className="text-slate-700">Validation errors:</strong>{" "}
                  {validationLog.errors.join(" | ")}
                </div>
              ) : null}
              {validationLog?.llmError ? (
                <div>
                  <strong className="text-slate-700">LLM error:</strong> {validationLog.llmError}
                </div>
              ) : null}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
