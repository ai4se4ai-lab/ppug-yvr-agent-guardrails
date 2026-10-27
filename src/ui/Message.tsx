import {
  Brain,
  CheckCircle,
  CircleNotch,
  Paperclip,
  ShieldCheck,
  Wrench,
  XCircle,
} from "@phosphor-icons/react";
import {
  getToolName,
  isToolUIPart,
  type DynamicToolUIPart,
  type ToolUIPart,
  type UIMessage,
} from "ai";
import { Streamdown } from "streamdown";
import { cx } from "./primitives";

export type ApprovalHandler = (id: string, approved: boolean) => void;

function ToolCard({
  part,
  onApproval,
}: {
  part: ToolUIPart | DynamicToolUIPart;
  onApproval: ApprovalHandler;
}) {
  const name = getToolName(part);
  const running =
    part.state === "input-streaming" || part.state === "input-available";
  const failed =
    part.state === "output-error" || part.state === "output-denied";
  return (
    <details className="group my-2 rounded-lg border border-line bg-raised/50 text-xs">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2">
        <Wrench size={14} className="text-faint" />
        <span className="font-mono">{name}</span>
        <span className="ml-auto flex items-center gap-1 text-faint">
          {running && <CircleNotch size={13} className="animate-spin" />}
          {part.state === "output-available" && (
            <CheckCircle size={13} weight="fill" className="text-allow" />
          )}
          {failed && <XCircle size={13} weight="fill" className="text-block" />}
          {part.state === "approval-requested" && (
            <ShieldCheck size={13} weight="fill" className="text-review" />
          )}
          <span className="font-mono">{part.state}</span>
        </span>
      </summary>
      <div className="space-y-2 border-t border-line px-3 py-2">
        <pre className="scrollbar-thin overflow-x-auto font-mono text-[11px] text-muted">
          {JSON.stringify(part.input, null, 2)}
        </pre>
        {part.state === "output-available" && (
          <pre className="scrollbar-thin max-h-56 overflow-auto font-mono text-[11px] text-muted">
            {JSON.stringify(part.output, null, 2)}
          </pre>
        )}
        {part.state === "output-error" && (
          <p className="text-block">{part.errorText}</p>
        )}
      </div>
      {part.state === "approval-requested" && (
        <div className="flex items-center gap-2 border-t border-line px-3 py-2">
          <span className="text-review">
            {part.approval.requestReason ??
              "This tool call needs your approval."}
          </span>
          <button
            type="button"
            onClick={() => onApproval(part.approval.id, true)}
            className="ml-auto rounded-md bg-allow/15 px-2.5 py-1 font-medium text-allow hover:bg-allow/25"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => onApproval(part.approval.id, false)}
            className="rounded-md bg-block/15 px-2.5 py-1 font-medium text-block hover:bg-block/25"
          >
            Deny
          </button>
        </div>
      )}
    </details>
  );
}

export function Message({
  message,
  streaming,
  onApproval,
}: {
  message: UIMessage;
  streaming: boolean;
  onApproval: ApprovalHandler;
}) {
  const isUser = message.role === "user";
  return (
    <div className={cx("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cx(
          "max-w-[85%] min-w-0",
          isUser
            ? "rounded-2xl rounded-br-md bg-brand/15 px-4 py-2.5 ring-1 ring-brand/25"
            : "w-full",
        )}
      >
        {message.parts.map((part, i) => {
          const key = `${message.id}-${i}`;
          if (part.type === "text") {
            return isUser ? (
              <p key={key} className="text-[15px] whitespace-pre-wrap">
                {part.text}
              </p>
            ) : (
              <Streamdown
                key={key}
                className="prose-chat"
                isAnimating={streaming}
              >
                {part.text}
              </Streamdown>
            );
          }
          if (part.type === "reasoning" && part.text.trim()) {
            return (
              <details key={key} className="my-1 text-xs text-faint">
                <summary className="flex cursor-pointer list-none items-center gap-1.5">
                  <Brain size={13} /> Reasoning
                </summary>
                <p className="mt-1 border-l-2 border-line pl-3 whitespace-pre-wrap">
                  {part.text}
                </p>
              </details>
            );
          }
          if (part.type === "file" && part.mediaType.startsWith("image/")) {
            return (
              <img
                key={key}
                src={part.url}
                alt={part.filename ?? "attachment"}
                className="my-2 max-h-56 rounded-lg"
              />
            );
          }
          if (part.type === "file") {
            return (
              <p
                key={key}
                className="my-1 flex items-center gap-1 font-mono text-xs text-muted"
              >
                <Paperclip size={12} /> {part.filename ?? part.mediaType}
              </p>
            );
          }
          if (isToolUIPart(part)) {
            return <ToolCard key={key} part={part} onApproval={onApproval} />;
          }
          return null;
        })}
      </div>
    </div>
  );
}
