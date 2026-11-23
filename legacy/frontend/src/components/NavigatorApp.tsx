"use client";

import { useState, useSyncExternalStore } from "react";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { AppHeader } from "@/components/layout/AppHeader";
import { ProvenanceLegend } from "@/components/layout/ProvenanceLegend";
import { ProfileStrip, ProfileSummary } from "@/components/onboarding/ProfileSummary";
import { StudentProfileForm } from "@/components/onboarding/StudentProfileForm";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { ChatServiceError, getChatService } from "@/lib/chat/chatService";
import { DATA_MODE } from "@/lib/config";
import {
  clearProfile,
  getProfileServerSnapshot,
  getProfileSnapshot,
  saveProfile,
  subscribeProfile,
} from "@/lib/storage/profileStore";
import type {
  AssistantMessage,
  ChatMessage,
  ConversationTurn,
  MessageFeedback,
  UserMessage,
} from "@/lib/types/message";
import { EMPTY_PROFILE } from "@/lib/types/profile";

const chatService = getChatService();
const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function toHistory(messages: ChatMessage[]): ConversationTurn[] {
  return messages.flatMap((m): ConversationTurn[] => {
    if (m.role === "user") return [{ role: "user", text: m.text }];
    if (m.status !== "ok" || !m.answer) return [];
    return [{ role: "assistant", text: m.answer.direct_answer, course_ids: m.answer.course_options.map((c) => c.course_id) }];
  });
}

export default function NavigatorApp() {
  const stored = useSyncExternalStore(subscribeProfile, getProfileSnapshot, getProfileServerSnapshot);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [sessionDialog, setSessionDialog] = useState(false);

  const isMock = chatService.mode === "mock";

  // Server render / first paint before localStorage is readable.
  if (!stored) {
    return (
      <div className="flex h-dvh flex-col overflow-hidden">
        <AppHeader mode={DATA_MODE} />
      </div>
    );
  }

  const { profile, onboarded } = stored;

  const ask = async (question: string, base: ChatMessage[]) => {
    setBusy(true);
    try {
      const answer = await chatService.ask({ question, profile, history: toHistory(base) });
      const reply: AssistantMessage = {
        id: newId(),
        role: "assistant",
        createdAt: new Date().toISOString(),
        inReplyTo: question,
        status: "ok",
        answer,
      };
      setMessages((prev) => [...prev, reply]);
    } catch (err) {
      const reply: AssistantMessage = {
        id: newId(),
        role: "assistant",
        createdAt: new Date().toISOString(),
        inReplyTo: question,
        status: "error",
        error: err instanceof ChatServiceError ? err.message : "Something went wrong. Try again.",
      };
      setMessages((prev) => [...prev, reply]);
    } finally {
      setBusy(false);
    }
  };

  const send = (question: string) => {
    if (busy) return;
    const user: UserMessage = { id: newId(), role: "user", text: question, createdAt: new Date().toISOString() };
    const base = messages;
    setMessages([...base, user]);
    void ask(question, base);
  };

  const retry = (failed: AssistantMessage) => {
    if (busy) return;
    const idx = messages.findIndex((m) => m.id === failed.id);
    const kept = messages.filter((m) => m.id !== failed.id);
    setMessages(kept);
    // History = everything before the user question that produced the error.
    void ask(failed.inReplyTo, kept.slice(0, Math.max(0, idx - 1)));
  };

  const setFeedback = (id: string, feedback: MessageFeedback) => {
    setMessages((prev) => prev.map((m) => (m.id === id && m.role === "assistant" ? { ...m, feedback } : m)));
  };

  const header = <AppHeader mode={DATA_MODE} onNewSession={onboarded ? () => setSessionDialog(true) : undefined} />;

  if (!onboarded) {
    return (
      <div className="flex h-dvh flex-col overflow-hidden">
        {header}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-xl px-4 py-8 sm:py-12">
            <h1 className="font-serif text-2xl leading-snug text-ink sm:text-[1.75rem]">Tell Navigator about your studies</h1>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">
              This helps tailor answers to where you are. Every field can be skipped, and you can change it any time.
            </p>
            <div className="mt-6 rounded-lg border border-line bg-surface p-5 sm:p-6">
              <StudentProfileForm
                initial={profile}
                onSave={saveProfile}
                onCancel={() => saveProfile(EMPTY_PROFILE)}
                submitLabel="Start asking"
                cancelLabel="Skip for now"
              />
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {header}
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-72 shrink-0 space-y-4 overflow-y-auto border-r border-line p-4 lg:block" aria-label="Profile and guide">
          <ProfileSummary profile={profile} onEdit={() => setEditing(true)} />
          <ProvenanceLegend />
        </aside>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <ProfileStrip profile={profile} onEdit={() => setEditing(true)} />
          <ChatWindow
            messages={messages}
            busy={busy}
            isMock={isMock}
            onSend={send}
            onRetry={retry}
            onFeedback={setFeedback}
          />
        </main>
      </div>

      <Dialog open={editing} onClose={() => setEditing(false)} title="Edit your profile" wide>
        <StudentProfileForm
          key={editing ? "open" : "closed"}
          initial={profile}
          onSave={(p) => {
            saveProfile(p);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
          submitLabel="Save profile"
          cancelLabel="Cancel"
        />
      </Dialog>

      <Dialog open={sessionDialog} onClose={() => setSessionDialog(false)} title="Start a new session">
        <p className="text-sm leading-relaxed text-muted">
          Clearing the conversation also clears any feedback given on its answers.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <Button
            onClick={() => {
              setMessages([]);
              setSessionDialog(false);
            }}
          >
            Clear conversation, keep profile
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setMessages([]);
              clearProfile();
              setSessionDialog(false);
            }}
          >
            Clear conversation and profile
          </Button>
          <Button variant="ghost" onClick={() => setSessionDialog(false)}>
            Cancel
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
