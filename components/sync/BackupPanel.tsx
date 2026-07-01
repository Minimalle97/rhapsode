"use client";
// components/sync/BackupPanel.tsx
// Export/Import-panel för profilsidan eller en dedikerad settings-sida.
// Export: klicka → laddar ned .json-fil direkt från /api/export
// Import: välj fil → preview av antal verk → bekräfta → POST /api/import

import { useRef, useState } from "react";
import type { RhapsodeExport } from "@/types/export";

interface ImportResult {
  imported: number;
  skipped:  number;
  errors:   string[];
}

export function BackupPanel() {
  const fileRef = useRef<HTMLInputElement>(null);

  // Import state
  const [preview,   setPreview]   = useState<RhapsodeExport | null>(null);
  const [importing, setImporting] = useState(false);
  const [result,    setResult]    = useState<ImportResult | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  // ── Export ──────────────────────────────────────────────────────────
  function handleExport() {
    // Trigga nedladdning via vanlig länk — /api/export returnerar
    // Content-Disposition: attachment, så webbläsaren laddar ned direkt.
    window.location.href = "/api/export";
  }

  // ── Import: välj fil ────────────────────────────────────────────────
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileError(null);
    setResult(null);
    setPreview(null);

    if (!file.name.endsWith(".json")) {
      setFileError("Please select a .json backup file.");
      return;
    }

    try {
      const text    = await file.text();
      const payload = JSON.parse(text) as RhapsodeExport;

      if (payload.version !== "1.0" || !Array.isArray(payload.works)) {
        setFileError("Invalid backup format. Only Rhapsode v1.0 exports are supported.");
        return;
      }

      setPreview(payload);
    } catch {
      setFileError("Could not read file. Make sure it's a valid JSON backup.");
    }

    // Reset input so same file can be re-selected
    e.target.value = "";
  }

  // ── Import: bekräfta ────────────────────────────────────────────────
  async function handleConfirmImport() {
    if (!preview) return;
    setImporting(true);
    setResult(null);

    try {
      const res = await fetch("/api/import", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(preview),
      });

      const data: ImportResult = await res.json();

      if (!res.ok) {
        setFileError((data as { error?: string }).error ?? "Import failed");
        return;
      }

      setResult(data);
      setPreview(null);
    } catch {
      setFileError("Network error during import.");
    } finally {
      setImporting(false);
    }
  }

  function cancelImport() {
    setPreview(null);
    setFileError(null);
  }

  return (
    <div style={{
      background:   "var(--bg2)",
      border:       "1px solid var(--bord)",
      borderRadius: "var(--r)",
      padding:      "24px",
    }}>
      <p style={{
        fontSize:      "10px",
        letterSpacing: "0.2em",
        color:         "var(--gold)",
        textTransform: "uppercase",
        marginBottom:  "16px",
      }}>
        Backup & Restore
      </p>

      {/* Export */}
      <div style={{ marginBottom: "20px" }}>
        <p style={{ fontSize: "13px", color: "var(--parch2)", marginBottom: "8px" }}>
          Export all your works and progress as a JSON file.
        </p>
        <button onClick={handleExport} style={btnStyle("outlined")}>
          Download backup (.json)
        </button>
      </div>

      {/* Divider */}
      <div style={{ height: "1px", background: "var(--bord)", margin: "20px 0" }} />

      {/* Import */}
      <div>
        <p style={{ fontSize: "13px", color: "var(--parch2)", marginBottom: "4px" }}>
          Restore from a previous backup.
        </p>
        <p style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "12px" }}>
          Existing works with the same title and author will be skipped.
        </p>

        {/* Fil-knapp */}
        {!preview && (
          <button
            onClick={() => fileRef.current?.click()}
            style={btnStyle("ghost")}
          >
            Choose backup file…
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />

        {/* Filfel */}
        {fileError && (
          <p style={{ fontSize: "12px", color: "var(--red)", marginTop: "8px" }}>
            {fileError}
          </p>
        )}

        {/* Preview */}
        {preview && (
          <div style={{
            marginTop:    "14px",
            background:   "var(--bg3)",
            border:       "1px solid var(--bord)",
            borderRadius: "var(--r2)",
            padding:      "16px 18px",
          }}>
            <p style={{ fontSize: "13px", color: "var(--parch2)", marginBottom: "8px" }}>
              Found <strong style={{ color: "var(--parch)" }}>{preview.works.length}</strong> work{preview.works.length !== 1 ? "s" : ""} in backup
              {preview.user?.username && ` from ${preview.user.username}`}.
            </p>
            <p style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "14px" }}>
              Exported {new Date(preview.exportedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
            </p>

            {/* Work list preview */}
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "16px", maxHeight: "160px", overflowY: "auto" }}>
              {preview.works.map((w, i) => (
                <div key={i} style={{ display: "flex", gap: "8px", fontSize: "12px" }}>
                  <span style={{ color: "var(--parch2)", flex: 1 }}>{w.title}</span>
                  <span style={{ color: "var(--muted)" }}>{w.author}</span>
                  <span style={{ color: "var(--bg4)", fontSize: "11px" }}>{w.sections.length} sections</span>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={handleConfirmImport}
                disabled={importing}
                style={btnStyle("primary")}
              >
                {importing ? "Importing…" : "Import works"}
              </button>
              <button
                onClick={cancelImport}
                disabled={importing}
                style={btnStyle("ghost")}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Resultat */}
        {result && (
          <div style={{
            marginTop:    "14px",
            padding:      "14px 16px",
            background:   "var(--bg3)",
            border:       "1px solid var(--bord)",
            borderRadius: "var(--r2)",
          }}>
            <p style={{ fontSize: "13px", color: "var(--green)", marginBottom: "4px" }}>
              Import complete
            </p>
            <p style={{ fontSize: "12px", color: "var(--muted)" }}>
              {result.imported} imported · {result.skipped} skipped (already existed)
              {result.errors.length > 0 && ` · ${result.errors.length} error${result.errors.length > 1 ? "s" : ""}`}
            </p>
            {result.errors.length > 0 && (
              <ul style={{ marginTop: "8px", paddingLeft: "14px" }}>
                {result.errors.map((e, i) => (
                  <li key={i} style={{ fontSize: "11px", color: "var(--red)", marginBottom: "2px" }}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Stil-helper ────────────────────────────────────────────────────────
type BtnVariant = "primary" | "outlined" | "ghost";

function btnStyle(variant: BtnVariant): React.CSSProperties {
  const base: React.CSSProperties = {
    padding:      "8px 16px",
    borderRadius: "var(--r3)",
    fontSize:     "13px",
    cursor:       "pointer",
    fontFamily:   "var(--fb)",
    letterSpacing: "0.02em",
    transition:   "all .15s",
  };

  if (variant === "primary") return {
    ...base,
    background: "var(--gold)",
    border:     "1px solid var(--gold)",
    color:      "var(--bg)",
  };
  if (variant === "outlined") return {
    ...base,
    background: "transparent",
    border:     "1px solid rgba(200,164,80,0.4)",
    color:      "var(--gold)",
  };
  return {
    ...base,
    background: "transparent",
    border:     "1px solid var(--bord)",
    color:      "var(--muted)",
  };
}
