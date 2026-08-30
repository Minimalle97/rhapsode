// app/legal/privacy/page.tsx
//
// Integritetspolicy.
//
// Innehallet beskriver vad appen FAKTISKT gor — det ar skrivet mot
// koden, inte hamtat ur en mall. Varje pastaende nedan gar att verifiera:
// rostinspelningar namns som "lamnar aldrig enheten" for att det ar sant
// (det finns ingen endpoint som tar emot ljud), och listan over
// underbitraden ar de tjanster som faktiskt anropas.
//
// Det som MASTE fyllas i av en manniska ar markerat [FYLL I]. En policy
// med platshallare kvar ar samre an ingen alls.

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy" };

const UPDATED = "30 August 2026";

export default function PrivacyPage() {
  return (
    <article>
      <p style={eyebrow}>Last updated {UPDATED}</p>
      <h1 style={h1}>Privacy</h1>

      <p style={lede}>
        Rhapsode is a tool for committing texts to memory. It needs very little
        about you to do that, and this page says exactly what it keeps, why, and
        for how long.
      </p>

      <Section title="Who is responsible">
        <p style={p}>
          The controller of your personal data is <strong>[FYLL I: företagsnamn
          eller ditt namn]</strong>, <strong>[FYLL I: adress]</strong>, reachable
          at <strong>[FYLL I: kontakt-e-post]</strong>. If you are in the EU or
          UK you may also complain to your national data protection authority —
          in Sweden, Integritetsskyddsmyndigheten.
        </p>
      </Section>

      <Section title="What is stored">
        <Row term="Account">
          A username, an optional handle, an optional avatar, and an identifier
          from our sign-in provider. Your email address is held by Clerk, our
          sign-in provider, and by Stripe if you subscribe. Rhapsode&apos;s own
          database does not store it.
        </Row>
        <Row term="Your texts">
          The works you add, their sections, and any edits you make. Kept until
          you delete them or close your account.
        </Row>
        <Row term="Practice history">
          For each session: the score, which words were missed, the mode, how
          long it took, and the resulting review schedule. This is what makes
          the app able to tell you whether you are improving.
        </Row>
        <Row term="Performances">
          Accuracy, hesitation counts, duration and dates for each performance.
        </Row>
        <Row term="Payment">
          If you subscribe, a Stripe customer and subscription identifier, your
          plan, its status and the renewal date. <strong>Card details never
          reach Rhapsode</strong> — they are entered on Stripe&apos;s own pages
          and held by Stripe.
        </Row>
        <Row term="Usage records">
          A log of generated-content requests: which feature, which model, token
          counts and estimated cost. Used to keep the service affordable and to
          enforce monthly allowances.
        </Row>
        <Row term="Product events">
          A small internal log of events such as &quot;checkout started&quot; or
          &quot;paywall shown&quot;, holding an account identifier and an event
          name. No names, no email addresses, no text you are learning.
        </Row>
      </Section>

      <Section title="Voice recordings">
        <p style={p}>
          Recitation and performance mode turn your speech into text in your own
          browser. <strong>Audio is never uploaded, and there is no endpoint that
          could receive it.</strong> You may download a recording to your own
          device; otherwise it is discarded when you move on.
        </p>
        <p style={p}>
          The <em>transcript</em> is sent to our server so it can be compared
          with the text you were reciting. That comparison is arithmetic, done
          on our own server, and the transcript is not kept afterwards.
        </p>
      </Section>

      <Section title="Generated features">
        <p style={p}>
          Some features — deep cleanup, glossaries, translation, study sessions,
          analysis of a recitation — send the relevant passage to Anthropic&apos;s
          Claude API to be processed. Only the text needed for that request is
          sent. Your name, email address and practice history are not.
        </p>
        <p style={p}>
          Anthropic does not use data submitted through the API to train its
          models. Results for public-domain texts may be cached and reused
          between accounts; results that depend on your own history are never
          shared.
        </p>
      </Section>

      <Section title="Who else processes your data">
        <Row term="Clerk">Sign-in and account identity, including your email address.</Row>
        <Row term="Supabase">Database hosting, and storage for avatar images.</Row>
        <Row term="Vercel">Application hosting and request logs.</Row>
        <Row term="Stripe">Payments, invoices and subscription management.</Row>
        <Row term="Anthropic">Processing text for the generated features above.</Row>
        <p style={{ ...p, marginTop: "14px" }}>
          Some of these process data outside the EU. Transfers rely on the
          European Commission&apos;s standard contractual clauses.
        </p>
      </Section>

      <Section title="What is not done">
        <p style={p}>
          No advertising. No selling or sharing of personal data. No third-party
          analytics or tracking scripts. No profiling that produces legal effects.
          Cookies are limited to what sign-in requires — there is no advertising
          or tracking cookie to consent to.
        </p>
      </Section>

      <Section title="How long it is kept">
        <p style={p}>
          Your texts and practice history are kept while your account exists.
          Delete a work and its sections and history go with it. Ask us to close
          your account and everything is removed, except records we are required
          to keep — chiefly invoices, which tax law obliges us to retain for
          seven years.
        </p>
      </Section>

      <Section title="Your rights">
        <p style={p}>
          You may request a copy of your data, have it corrected, have it
          deleted, object to processing, or ask for it in a portable form. The
          export in the app already gives you your library and history as a file
          you can keep. For anything else, write to{" "}
          <strong>[FYLL I: kontakt-e-post]</strong> and we will answer within one
          month.
        </p>
      </Section>

      <Section title="Changes">
        <p style={p}>
          If this policy changes in a way that affects you, we will say so in the
          app before the change takes effect.
        </p>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: "34px" }}>
      <h2 style={h2}>{title}</h2>
      {children}
    </section>
  );
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "minmax(120px, 22%) 1fr",
      gap: "6px 20px", padding: "10px 0", borderBottom: "1px solid var(--bord)",
    }}>
      <span style={{ fontSize: "13px", color: "var(--gold)" }}>{term}</span>
      <span style={{ fontSize: "13.5px", lineHeight: 1.7, color: "var(--parch2)" }}>
        {children}
      </span>
    </div>
  );
}

const eyebrow: React.CSSProperties = {
  fontSize: "10px", letterSpacing: "0.2em", textTransform: "uppercase",
  color: "var(--muted)", marginBottom: "10px",
};
const h1: React.CSSProperties = {
  fontFamily: "var(--fd)", fontSize: "40px", fontWeight: 300,
  color: "var(--parch)", letterSpacing: "0.03em", marginBottom: "16px",
};
const h2: React.CSSProperties = {
  fontFamily: "var(--fd)", fontSize: "22px", fontWeight: 400,
  color: "var(--parch)", marginBottom: "12px",
};
const lede: React.CSSProperties = {
  fontFamily: "var(--fd)", fontSize: "18px", fontStyle: "italic",
  lineHeight: 1.7, color: "var(--parch2)", marginBottom: "38px",
};
const p: React.CSSProperties = {
  fontSize: "13.5px", lineHeight: 1.8, color: "var(--parch2)",
  marginBottom: "12px", maxWidth: "68ch",
};
