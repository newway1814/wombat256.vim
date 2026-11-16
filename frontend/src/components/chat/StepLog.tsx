/* eslint-disable @typescript-eslint/no-explicit-any -- tool results are free-form JSON */
import { useState } from "react";
import type { Turn } from "../../hooks/useConversations";
import { useWorkspace } from "../../workspace";
import { DOING, finding, TOOL_LABEL } from "../thread/findings";

const secs = (ms: number) =>
  ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;

/** The agent's work, one quiet line per tool. Open while it runs, folded once it has answered. */
export function StepLog({
  convId,
  turn,
  running,
}: {
  convId: string;
  turn: Turn;
  running: boolean;
}) {
  const { open } = useWorkspace();
  const [shown, setShown] = useState<boolean | null>(null);
  const expanded = shown ?? running;
  const done = turn.steps.filter((s) => s.status !== "running").length;
  const ms = turn.steps.reduce((t, s) => t + (s.durationMs ?? 0), 0);
  const current = turn.steps.find((s) => s.status === "running");

  if (!turn.steps.length && !running) return null;

  return (
    <div className={`steplog${running ? " live" : ""}`}>
      <button
        type="button"
        className="steplog-head"
        aria-expanded={expanded}
        onClick={() => setShown(!expanded)}
      >
        {running ? (
          <span className="shimmer">
            {current
              ? `${DOING[current.name] ?? current.name}…`
              : done
                ? "Thinking about the next step…"
                : "Reading the question…"}
          </span>
        ) : (
          <span>
            Investigated in {done} step{done === 1 ? "" : "s"}
            <span className="muted"> · {secs(ms)} in tools</span>
          </span>
        )}
        <svg
          className="chev"
          width="10"
          height="10"
          viewBox="0 0 10 10"
          aria-hidden="true"
        >
          <path
            d="M3 2l3.5 3L3 8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          />
        </svg>
      </button>
      <div className="steplog-body" data-open={expanded} inert={!expanded}>
        <div>
          <ol>
            {turn.steps.map((s) => {
              const r = s.result as any;
              const text =
                s.status === "running"
                  ? "Working…"
                  : s.status === "error"
                    ? String(r?.error ?? "This step failed.")
                    : finding(s.name, r);
              return (
                <li key={s.id} className={s.status}>
                  <button
                    type="button"
                    disabled={s.status === "running"}
                    onClick={() =>
                      open({
                        kind: "step",
                        convId,
                        turnId: turn.id,
                        stepId: s.id,
                      })
                    }
                  >
                    <span className="steplog-tool">
                      {TOOL_LABEL[s.name] ?? s.name}
                    </span>
                    <span className="steplog-text">{text}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          {!running && (
            <button
              type="button"
              className="textlink"
              onClick={() => open({ kind: "trace", convId, turnId: turn.id })}
            >
              Open the full trace
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
