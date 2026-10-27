import { ArrowUp, Paperclip, Stop, X } from "@phosphor-icons/react";
import type { FileUIPart } from "ai";
import { useRef, useState, type KeyboardEvent } from "react";
import { cx } from "./primitives";

const MAX_FILE_BYTES = 4 * 1024 * 1024;

export async function fileToPart(
  file: Blob,
  filename: string,
): Promise<FileUIPart> {
  if (file.size > MAX_FILE_BYTES)
    throw new Error(`${filename} is larger than 4 MB`);
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () =>
      reject(reader.error ?? new Error(`Could not read ${filename}`)),
    );
    reader.readAsDataURL(file);
  });
  return {
    type: "file",
    mediaType: file.type || "application/octet-stream",
    filename,
    url,
  };
}

export function Composer({
  busy,
  onSend,
  onStop,
  accept = "image/png,image/jpeg,image/webp",
  placeholder = "Ask anything, or pick a scenario above…",
}: {
  busy: boolean;
  onSend: (text: string, files: FileUIPart[]) => void;
  onStop: () => void;
  accept?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<FileUIPart[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const submit = () => {
    if (busy || (!text.trim() && files.length === 0)) return;
    onSend(text.trim(), files);
    setText("");
    setFiles([]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    setError(null);
    try {
      const parts = await Promise.all(
        [...list].map((f) => fileToPart(f, f.name)),
      );
      setFiles((prev) => [...prev, ...parts].slice(0, 4));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="rounded-2xl border border-line bg-panel shadow-lg shadow-black/30 focus-within:border-brand/50">
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-3">
          {files.map((f, i) => (
            <span
              key={f.url}
              className="flex items-center gap-1 rounded-md bg-raised px-2 py-1 text-xs text-muted"
            >
              {f.mediaType.startsWith("image/") && (
                <img
                  src={f.url}
                  alt=""
                  className="h-5 w-5 rounded object-cover"
                />
              )}
              <span className="max-w-40 truncate">{f.filename}</span>
              <button
                type="button"
                onClick={() => setFiles(files.filter((_, j) => j !== i))}
                title="Remove"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={(e) =>
          e.clipboardData.files.length && void addFiles(e.clipboardData.files)
        }
        rows={2}
        placeholder={placeholder}
        className="block max-h-48 w-full resize-none bg-transparent px-4 pt-3 text-[15px] placeholder:text-faint focus:outline-none"
      />
      <div className="flex items-center gap-2 px-3 pb-3">
        <input
          ref={fileInput}
          type="file"
          accept={accept}
          multiple
          hidden
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="rounded-lg p-2 text-faint transition hover:bg-raised hover:text-ink"
          title="Attach file"
        >
          <Paperclip size={16} />
        </button>
        {error && <span className="text-xs text-block">{error}</span>}
        <button
          type="button"
          onClick={busy ? onStop : submit}
          className={cx(
            "ml-auto flex h-9 w-9 items-center justify-center rounded-xl transition",
            busy
              ? "bg-raised text-ink hover:bg-line"
              : "bg-brand text-black hover:brightness-110",
          )}
          title={busy ? "Stop" : "Send"}
        >
          {busy ? (
            <Stop size={16} weight="fill" />
          ) : (
            <ArrowUp size={16} weight="bold" />
          )}
        </button>
      </div>
    </div>
  );
}
