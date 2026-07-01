"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AddWorkPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [type, setType] = useState("POEM");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!title || !author || !text) return;
    setLoading(true);

    const analyzeRes = await fetch("/api/agents/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, author, type, text }),
    });
    const analyzed = await analyzeRes.json();

    await fetch("/api/works", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, author, type, ...analyzed }),
    });

    setLoading(false);
    router.push("/library");
  }

  return (
    <div style={{ maxWidth: "600px", margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ fontFamily: "var(--fd)", fontSize: "32px", fontWeight: 300, marginBottom: "32px" }}>
        Add Work
      </h1>

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <input placeholder="Title" value={title} onChange={e => setTitle(e.target.value)}
          style={{ padding: "10px", background: "var(--bg2)", border: "1px solid var(--bord)", borderRadius: "var(--r3)", color: "var(--parch)", fontSize: "14px" }} />

        <input placeholder="Author" value={author} onChange={e => setAuthor(e.target.value)}
          style={{ padding: "10px", background: "var(--bg2)", border: "1px solid var(--bord)", borderRadius: "var(--r3)", color: "var(--parch)", fontSize: "14px" }} />

        <select value={type} onChange={e => setType(e.target.value)}
          style={{ padding: "10px", background: "var(--bg2)", border: "1px solid var(--bord)", borderRadius: "var(--r3)", color: "var(--parch)", fontSize: "14px" }}>
          <option value="POEM">Poem</option>
          <option value="EPIC">Epic</option>
          <option value="PLAY">Play</option>
          <option value="SPEECH">Speech</option>
          <option value="PHILOSOPHICAL">Philosophical</option>
          <option value="RELIGIOUS">Religious</option>
          <option value="PROFESSIONAL">Professional</option>
          <option value="OTHER">Other</option>
        </select>

        <textarea placeholder="Paste the text here..." value={text} onChange={e => setText(e.target.value)}
          rows={12}
          style={{ padding: "10px", background: "var(--bg2)", border: "1px solid var(--bord)", borderRadius: "var(--r3)", color: "var(--parch)", fontSize: "14px", resize: "vertical" }} />

        <button onClick={handleSubmit} disabled={loading}
          style={{ padding: "12px", background: "var(--gold)", border: "none", borderRadius: "var(--r3)", color: "var(--bg)", fontSize: "14px", cursor: loading ? "wait" : "pointer" }}>
          {loading ? "Analyzing..." : "Add Work"}
        </button>
      </div>
    </div>
  );
}