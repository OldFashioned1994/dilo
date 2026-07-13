import React, { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  FileText,
  Mic,
  Pencil,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { commands, type MeetingEntry, type MeetingStatus } from "@/bindings";
import { formatDateTime } from "@/utils/dateFormat";
import { Button } from "../../ui/Button";

const IDLE_STATUS: MeetingStatus = {
  active: false,
  meeting_id: null,
  started_at: null,
  segments_done: 0,
  finishing: false,
};

const formatElapsed = (totalSecs: number): string => {
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

const meetingDuration = (meeting: MeetingEntry): string | null => {
  if (meeting.ended_at === null) return null;
  return formatElapsed(Math.max(0, meeting.ended_at - meeting.started_at));
};

export const MeetingsSettings: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<MeetingStatus>(IDLE_STATUS);
  const [elapsed, setElapsed] = useState(0);
  const [lastText, setLastText] = useState("");
  const [meetings, setMeetings] = useState<MeetingEntry[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"minutes" | "transcript">(
    "minutes",
  );
  const [generatingId, setGeneratingId] = useState<number | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const confirmTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const errorMessage = useCallback(
    (code: string) =>
      t(`meetings.errors.${code}`, {
        defaultValue: t("meetings.errors.unknown", { defaultValue: code }),
      }),
    [t],
  );

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await commands.getMeetingStatus());
    } catch (e) {
      console.error("Failed to fetch meeting status:", e);
    }
  }, []);

  const refreshMeetings = useCallback(async () => {
    const result = await commands.listMeetings();
    if (result.status === "ok") {
      setMeetings(result.data);
    } else {
      console.error("Failed to list meetings:", result.error);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    refreshMeetings();

    const unlistenProgress = listen<{
      meeting_id: number;
      segments_done: number;
      last_text: string;
    }>("meeting-progress", (event) => {
      setStatus((prev) =>
        prev.active
          ? { ...prev, segments_done: event.payload.segments_done }
          : prev,
      );
      setLastText(event.payload.last_text);
    });

    const unlistenFinished = listen<{ meeting_id: number; cancelled: boolean }>(
      "meeting-finished",
      (event) => {
        setStatus(IDLE_STATUS);
        setLastText("");
        refreshMeetings();
        if (event.payload.cancelled) {
          toast.info(t("meetings.discarded"));
        } else {
          toast.success(t("meetings.saved"));
          setExpandedId(event.payload.meeting_id);
          setActiveTab("transcript");
        }
      },
    );

    const unlistenError = listen<string>("meeting-error", (event) => {
      toast.error(errorMessage(event.payload));
      refreshStatus();
    });

    return () => {
      unlistenProgress.then((fn) => fn());
      unlistenFinished.then((fn) => fn());
      unlistenError.then((fn) => fn());
    };
  }, []);

  // Timer while a meeting is active
  useEffect(() => {
    if (!status.active || status.started_at === null) {
      setElapsed(0);
      return;
    }
    const startedAt = status.started_at;
    const tick = () =>
      setElapsed(Math.max(0, Math.floor(Date.now() / 1000) - startedAt));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [status.active, status.started_at]);

  const handleStart = async () => {
    const title = `${t("meetings.defaultTitle")} ${formatDateTime(String(Math.floor(Date.now() / 1000)), i18n.language)}`;
    const result = await commands.startMeeting(title);
    if (result.status === "ok") {
      setLastText("");
      await refreshStatus();
    } else {
      toast.error(errorMessage(result.error));
    }
  };

  const handleStop = async () => {
    const result = await commands.stopMeeting();
    if (result.status === "ok") {
      await refreshStatus();
    } else {
      toast.error(errorMessage(result.error));
    }
  };

  const handleCancel = async () => {
    if (!confirmingCancel) {
      setConfirmingCancel(true);
      if (confirmTimeout.current) clearTimeout(confirmTimeout.current);
      confirmTimeout.current = setTimeout(
        () => setConfirmingCancel(false),
        4000,
      );
      return;
    }
    setConfirmingCancel(false);
    const result = await commands.cancelMeeting();
    if (result.status === "error") {
      toast.error(errorMessage(result.error));
    }
    await refreshStatus();
  };

  const handleGenerateMinutes = async (meetingId: number) => {
    setGeneratingId(meetingId);
    try {
      const result = await commands.generateMeetingMinutes(meetingId);
      if (result.status === "ok") {
        toast.success(t("meetings.minutesReady"));
        setActiveTab("minutes");
        await refreshMeetings();
      } else {
        toast.error(errorMessage(result.error));
      }
    } finally {
      setGeneratingId(null);
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("meetings.copied"));
    } catch (e) {
      console.error("Clipboard write failed:", e);
    }
  };

  const handleExport = async (meeting: MeetingEntry) => {
    const safeTitle = meeting.title.replace(/[\\/:*?"<>|]/g, "-");
    const path = await save({
      defaultPath: `${safeTitle}.md`,
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (!path) return;
    const parts = [`# ${meeting.title}`, ""];
    if (meeting.minutes) {
      parts.push(meeting.minutes, "");
    }
    parts.push(`## ${t("meetings.transcript")}`, "", meeting.transcript, "");
    await writeTextFile(path, parts.join("\n"));
    toast.success(t("meetings.exported"));
  };

  const handleDelete = async (meetingId: number) => {
    const result = await commands.deleteMeeting(meetingId);
    if (result.status === "ok") {
      if (expandedId === meetingId) setExpandedId(null);
      await refreshMeetings();
      toast.success(t("meetings.deleted"));
    } else {
      toast.error(errorMessage(result.error));
    }
  };

  const handleRename = async (meetingId: number) => {
    const title = renameDraft.trim();
    setRenamingId(null);
    if (!title) return;
    const result = await commands.renameMeeting(meetingId, title);
    if (result.status === "ok") {
      await refreshMeetings();
    } else {
      toast.error(errorMessage(result.error));
    }
  };

  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      {/* Session panel */}
      <div className="border border-mid-gray/20 rounded-lg p-6 space-y-4">
        {status.active ? (
          <>
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-60"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
              <p className="font-semibold">
                {status.finishing
                  ? t("meetings.finishing")
                  : t("meetings.recording")}
              </p>
              <span className="ml-auto font-mono text-lg tabular-nums">
                {formatElapsed(elapsed)}
              </span>
            </div>
            <p className="text-sm text-mid-gray">
              {t("meetings.segments", { count: status.segments_done })}
            </p>
            {lastText && (
              <p className="text-sm text-mid-gray italic line-clamp-2">
                “{lastText}”
              </p>
            )}
            <div className="flex gap-3">
              <Button
                variant="primary"
                size="md"
                onClick={handleStop}
                disabled={status.finishing}
              >
                <Square size={16} className="me-2" />
                {t("meetings.stop")}
              </Button>
              <Button
                variant="danger-ghost"
                size="md"
                onClick={handleCancel}
                disabled={status.finishing}
              >
                <X size={16} className="me-2" />
                {confirmingCancel
                  ? t("meetings.cancelConfirm")
                  : t("meetings.cancel")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="font-semibold">{t("meetings.title")}</p>
                <p className="text-sm text-mid-gray">
                  {t("meetings.subtitle")}
                </p>
              </div>
              <Button variant="primary" size="md" onClick={handleStart}>
                <Mic size={16} className="me-2" />
                {t("meetings.start")}
              </Button>
            </div>
            <p className="text-xs text-mid-gray">
              {t("meetings.privacyNote")} {t("meetings.micNote")}
            </p>
          </>
        )}
      </div>

      {/* Meetings list */}
      {meetings.length === 0 && !status.active ? (
        <p className="text-sm text-mid-gray text-center py-8">
          {t("meetings.empty")}
        </p>
      ) : (
        <div className="space-y-3">
          {meetings.map((meeting) => {
            const isExpanded = expandedId === meeting.id;
            const duration = meetingDuration(meeting);
            const isGenerating = generatingId === meeting.id;
            return (
              <div
                key={meeting.id}
                className="border border-mid-gray/20 rounded-lg"
              >
                <div
                  className="flex items-center gap-3 p-4 cursor-pointer hover:bg-mid-gray/10 rounded-lg"
                  onClick={() => setExpandedId(isExpanded ? null : meeting.id)}
                >
                  <FileText size={18} className="shrink-0 text-mid-gray" />
                  <div className="min-w-0 flex-1">
                    {renamingId === meeting.id ? (
                      <input
                        autoFocus
                        className="w-full bg-transparent border-b border-logo-primary outline-none text-sm font-medium"
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRename(meeting.id);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        onBlur={() => handleRename(meeting.id)}
                      />
                    ) : (
                      <p className="text-sm font-medium truncate">
                        {meeting.title}
                      </p>
                    )}
                    <p className="text-xs text-mid-gray">
                      {formatDateTime(
                        String(meeting.started_at),
                        i18n.language,
                      )}
                      {duration ? ` · ${duration}` : ""}
                      {meeting.minutes ? ` · ${t("meetings.hasMinutes")}` : ""}
                    </p>
                  </div>
                  <ChevronDown
                    size={18}
                    className={`shrink-0 text-mid-gray transition-transform ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                  />
                </div>

                {isExpanded && (
                  <div className="border-t border-mid-gray/20 p-4 space-y-4">
                    {/* Tabs */}
                    <div className="flex gap-2 text-sm">
                      <button
                        className={`px-3 py-1 rounded-md cursor-pointer ${
                          activeTab === "minutes"
                            ? "bg-logo-primary/20 font-medium"
                            : "hover:bg-mid-gray/10"
                        }`}
                        onClick={() => setActiveTab("minutes")}
                      >
                        {t("meetings.minutes")}
                      </button>
                      <button
                        className={`px-3 py-1 rounded-md cursor-pointer ${
                          activeTab === "transcript"
                            ? "bg-logo-primary/20 font-medium"
                            : "hover:bg-mid-gray/10"
                        }`}
                        onClick={() => setActiveTab("transcript")}
                      >
                        {t("meetings.transcript")}
                      </button>
                    </div>

                    {activeTab === "minutes" ? (
                      meeting.minutes ? (
                        <div className="prose prose-sm max-w-none text-text text-sm max-h-96 overflow-y-auto [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-1 [&_table]:text-xs [&_td]:border [&_td]:border-mid-gray/30 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-mid-gray/30 [&_th]:px-2 [&_th]:py-1 [&_ul]:list-disc [&_ul]:ps-5">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {meeting.minutes}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <div className="text-sm text-mid-gray space-y-2">
                          <p>{t("meetings.noMinutes")}</p>
                          <p className="text-xs">
                            {t("meetings.needsProvider")}
                          </p>
                        </div>
                      )
                    ) : (
                      <pre className="text-xs font-mono whitespace-pre-wrap max-h-96 overflow-y-auto bg-mid-gray/10 rounded-md p-3">
                        {meeting.transcript || t("meetings.emptyTranscript")}
                      </pre>
                    )}

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2 items-center">
                      <Button
                        variant="primary-soft"
                        size="sm"
                        disabled={isGenerating || !meeting.transcript.trim()}
                        onClick={() => handleGenerateMinutes(meeting.id)}
                      >
                        {isGenerating ? (
                          t("meetings.generating")
                        ) : meeting.minutes ? (
                          t("meetings.regenerateMinutes")
                        ) : (
                          <>
                            <Check size={14} className="me-1" />
                            {t("meetings.generateMinutes")}
                          </>
                        )}
                      </Button>
                      {meeting.minutes && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleCopy(meeting.minutes!)}
                        >
                          <Copy size={14} className="me-1" />
                          {t("meetings.copyMinutes")}
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!meeting.transcript.trim()}
                        onClick={() => handleCopy(meeting.transcript)}
                      >
                        <Copy size={14} className="me-1" />
                        {t("meetings.copyTranscript")}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleExport(meeting)}
                      >
                        <Download size={14} className="me-1" />
                        {t("meetings.export")}
                      </Button>
                      <span className="ms-auto flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setRenamingId(meeting.id);
                            setRenameDraft(meeting.title);
                          }}
                        >
                          <Pencil size={14} />
                        </Button>
                        <Button
                          variant="danger-ghost"
                          size="sm"
                          onClick={() => handleDelete(meeting.id)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
