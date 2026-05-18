import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bold, CheckCircle2, Inbox, List, MailPlus, Send } from "lucide-react";
import { fetchExamSessionPulse, getApiErrorMessage, markExamIssueDone, submitExamIssueResponse } from "../api/client";
import type { ExamIssue, ExamPulseResponse } from "../api/client";

function formatTimer(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function difficultyLabel(issue: ExamIssue) {
  return issue.difficulty.charAt(0) + issue.difficulty.slice(1).toLowerCase();
}

function formatChatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function isIssueDone(issue?: ExamIssue | null) {
  return issue?.status === "DONE";
}

export default function ExamPage() {
  const { sessionId } = useParams();
  const queryClient = useQueryClient();
  const chatThreadRef = useRef<HTMLDivElement | null>(null);
  const [selectedIssueId, setSelectedIssueId] = useState("");
  const [seenIssueIds, setSeenIssueIds] = useState<Set<string>>(() => new Set());
  const [toastIssue, setToastIssue] = useState<ExamIssue | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [nowMs, setNowMs] = useState(Date.now());
  const pulseQueryKey = ["exam-session-pulse", sessionId] as const;
  const {
    data: pulse,
    error,
    isError,
    isLoading
  } = useQuery({
    queryKey: pulseQueryKey,
    queryFn: () => fetchExamSessionPulse(sessionId || ""),
    enabled: Boolean(sessionId),
    refetchInterval: 2000
  });

  const issues = pulse?.issues ?? [];
  const selectedIssue = useMemo(
    () => issues.find((issue) => issue.issueId === selectedIssueId) || issues[0] || null,
    [issues, selectedIssueId]
  );
  const remainingSeconds = pulse
    ? Math.max(0, Math.ceil((Date.parse(pulse.session.endsAt) - nowMs) / 1000))
    : 0;
  const isEnded = Boolean(pulse && (pulse.session.status === "ENDED" || remainingSeconds <= 0));
  const draft = selectedIssue ? drafts[selectedIssue.issueId] ?? "" : "";
  const selectedResponses = selectedIssue?.responses ?? [];
  const selectedIssueDone = isIssueDone(selectedIssue);
  const canWriteResponse = Boolean(selectedIssue && !isEnded && !selectedIssueDone);

  function applyIssueUpdate(issue: ExamIssue) {
    queryClient.setQueryData<ExamPulseResponse>(pulseQueryKey, (current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        issues: current.issues.map((currentIssue) => (currentIssue.issueId === issue.issueId ? issue : currentIssue))
      };
    });
  }

  const submitResponseMutation = useMutation({
    mutationFn: ({ issueId, message }: { issueId: string; message: string }) =>
      submitExamIssueResponse(sessionId || "", issueId, { message }),
    onSuccess: (issue) => {
      applyIssueUpdate(issue);
      setDrafts((current) => ({
        ...current,
        [issue.issueId]: ""
      }));
      void queryClient.invalidateQueries({ queryKey: pulseQueryKey });
    }
  });

  const markDoneMutation = useMutation({
    mutationFn: (issueId: string) => markExamIssueDone(sessionId || "", issueId),
    onSuccess: (issue) => {
      applyIssueUpdate(issue);
      void queryClient.invalidateQueries({ queryKey: pulseQueryKey });
    }
  });

  const actionError =
    submitResponseMutation.error || markDoneMutation.error
      ? getApiErrorMessage(submitResponseMutation.error || markDoneMutation.error, "Exam action failed.")
      : "";

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const incomingIssues = issues.filter((issue) => !seenIssueIds.has(issue.issueId));
    if (!incomingIssues.length) {
      return;
    }

    const nextSeenIssueIds = new Set(seenIssueIds);
    incomingIssues.forEach((issue) => nextSeenIssueIds.add(issue.issueId));
    setSeenIssueIds(nextSeenIssueIds);
    setSelectedIssueId((current) => current || incomingIssues[0].issueId);
    setToastIssue(incomingIssues[incomingIssues.length - 1]);
  }, [issues, seenIssueIds]);

  useEffect(() => {
    if (!toastIssue) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setToastIssue(null), 3800);
    return () => window.clearTimeout(timeout);
  }, [toastIssue]);

  useEffect(() => {
    const thread = chatThreadRef.current;
    if (!thread) {
      return;
    }

    thread.scrollTop = thread.scrollHeight;
  }, [selectedIssue?.issueId, selectedResponses.length]);

  if (!sessionId) {
    return <Navigate to="/exam/start" replace />;
  }

  function handleDraftChange(value: string) {
    if (!selectedIssue) {
      return;
    }

    setDrafts((current) => ({
      ...current,
      [selectedIssue.issueId]: value
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const message = draft.trim();
    if (!selectedIssue || !sessionId || !canWriteResponse || !message || submitResponseMutation.isPending) {
      return;
    }

    submitResponseMutation.mutate({ issueId: selectedIssue.issueId, message });
  }

  function handleMarkDone() {
    if (!selectedIssue || !sessionId || !canWriteResponse || !selectedResponses.length || markDoneMutation.isPending) {
      return;
    }

    markDoneMutation.mutate(selectedIssue.issueId);
  }

  if (isLoading) {
    return (
      <section className="exam-layout">
        <div className="inbox-column">
          <div className="section-title-row">
            <div>
              <span className="eyebrow">Active exam</span>
              <h2>Inbox</h2>
            </div>
          </div>
          <p className="empty-state">Loading exam session...</p>
        </div>
      </section>
    );
  }

  if (isError) {
    return (
      <section className="exam-layout">
        <div className="inbox-column">
          <div className="section-title-row">
            <div>
              <span className="eyebrow">Active exam</span>
              <h2>Inbox</h2>
            </div>
          </div>
          <p className="form-error">{getApiErrorMessage(error, "Exam session could not load.")}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="exam-layout">
      {toastIssue ? (
        <div className="exam-toast" role="status" aria-live="polite">
          <MailPlus aria-hidden="true" size={20} />
          <div>
            <strong>New issue arrived</strong>
            <span>{toastIssue.subject}</span>
          </div>
        </div>
      ) : null}

      <div className="inbox-column">
        <div className="section-title-row">
          <div>
            <span className="eyebrow">Active exam</span>
            <h2>Inbox</h2>
          </div>
          <span className="count-badge">{issues.length}</span>
        </div>

        <div className="exam-session-strip">
          <Inbox aria-hidden="true" size={18} />
          <div>
            <strong>{pulse?.session.title}</strong>
            <span>{isEnded ? "Exam ended" : "Issues arrive during session"}</span>
          </div>
        </div>

        {issues.length ? (
          <div className="inquiry-list">
            {issues.map((issue) => {
              const isDone = isIssueDone(issue);
              return (
                <button
                  className={`inquiry-item ${isDone ? "submitted" : "pending"} ${
                    selectedIssue?.issueId === issue.issueId ? "selected" : ""
                  }`}
                  type="button"
                  key={issue.issueId}
                  onClick={() => setSelectedIssueId(issue.issueId)}
                >
                  <span>{isDone ? "Done" : difficultyLabel(issue)}</span>
                  <strong>{issue.subject}</strong>
                  <small>{issue.customerName}</small>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="empty-state">Waiting for first issue...</p>
        )}
      </div>

      <div className="response-column">
        <div className="section-title-row">
          <div>
            <span className="eyebrow">Selected inquiry</span>
            <h2>{selectedIssue?.subject || "No issue selected"}</h2>
          </div>
          <span className={`timer-badge ${isEnded ? "ended" : ""}`}>{formatTimer(remainingSeconds)}</span>
        </div>

        <div className="chat-thread" ref={chatThreadRef} aria-live="polite">
          {selectedIssue ? (
            <>
              <article className="chat-bubble customer">
                <span>{selectedIssue.customerName}</span>
                <p>{selectedIssue.message}</p>
              </article>

              {selectedResponses.map((response) => (
                <article className="chat-bubble rep" key={response.responseId}>
                  <span>{formatChatTime(response.createdAt)}</span>
                  <p>{response.message}</p>
                </article>
              ))}
            </>
          ) : (
            <p className="empty-state">New customer messages appear here as they arrive.</p>
          )}
        </div>

        <form className="editor-shell" onSubmit={handleSubmit}>
          <div className="editor-toolbar" aria-label="Response formatting">
            <button type="button" title="Bold" disabled={!canWriteResponse}>
              <Bold aria-hidden="true" size={16} />
            </button>
            <button type="button" title="Bulleted list" disabled={!canWriteResponse}>
              <List aria-hidden="true" size={16} />
            </button>
          </div>
          {actionError ? <p className="form-error">{actionError}</p> : null}
          <textarea
            placeholder={
              selectedIssueDone ? "Issue marked done." : isEnded ? "Exam ended." : "Draft representative response..."
            }
            value={draft}
            onChange={(event) => handleDraftChange(event.target.value)}
            disabled={!canWriteResponse || submitResponseMutation.isPending || markDoneMutation.isPending}
          />
          <div className="composer-actions">
            <button
              type="submit"
              className="primary-button"
              disabled={!canWriteResponse || !draft.trim() || submitResponseMutation.isPending}
            >
              {submitResponseMutation.isPending ? "Submitting..." : "Submit response"}
              <Send aria-hidden="true" size={18} />
            </button>
            <button
              type="button"
              className="secondary-button done-button"
              disabled={
                !canWriteResponse || !selectedResponses.length || submitResponseMutation.isPending || markDoneMutation.isPending
              }
              onClick={handleMarkDone}
            >
              {markDoneMutation.isPending ? "Marking..." : "Done"}
              <CheckCircle2 aria-hidden="true" size={18} />
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
