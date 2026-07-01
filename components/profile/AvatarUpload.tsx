"use client";
// components/profile/AvatarUpload.tsx

import { useRef, useState, useTransition } from "react";

interface AvatarUploadProps {
  username:  string;
  avatarUrl: string | null;
}

export function AvatarUpload({ username, avatarUrl }: AvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const displayUrl = preview ?? avatarUrl;

  function handleClick() {
    inputRef.current?.click();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Only image files are allowed.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Image must be under 2 MB.");
      return;
    }

    setError(null);
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/avatar", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "Upload failed");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
        setPreview(null);
      }
    });
  }

  const initials = username[0]?.toUpperCase() ?? "?";

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={handleClick}
        disabled={isPending}
        title="Change avatar"
        style={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          border: "1px solid var(--bord)",
          background: "var(--bg3)",
          cursor: isPending ? "wait" : "pointer",
          padding: 0,
          overflow: "hidden",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {displayUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={displayUrl}
            alt={username}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span style={{ fontFamily: "var(--fd)", fontSize: "26px", color: "var(--gold)", lineHeight: 1 }}>
            {initials}
          </span>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFile}
      />

      {error && (
        <p style={{
          position: "absolute",
          top: "calc(100% + 6px)",
          left: "50%",
          transform: "translateX(-50%)",
          fontSize: "11px",
          color: "var(--red)",
          whiteSpace: "nowrap",
          background: "var(--bg2)",
          padding: "4px 8px",
          borderRadius: "var(--r3)",
          border: "1px solid var(--bord)",
        }}>
          {error}
        </p>
      )}
    </div>
  );
}