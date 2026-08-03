// app/(app)/loading.tsx
// Visas automatiskt medan en serversida hämtar data.
// Utan den här filen fryser hela sidan tom under laddning.

export default function Loading() {
  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "48px 24px" }}>
      <div className="skeleton" style={{ height: "38px", width: "180px", marginBottom: "32px" }} />

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            className="skeleton"
            style={{ height: "78px", opacity: 1 - i * 0.18 }}
          />
        ))}
      </div>
    </div>
  );
}
