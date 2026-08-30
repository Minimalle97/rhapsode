// app/legal/terms/page.tsx
//
// Anvandarvillkor.
//
// Utkast, skrivet mot hur appen faktiskt fungerar. Det ar INTE juridisk
// radgivning och det ar inte granskat av nagon jurist. Delarna som ar
// bindande for en svensk narngsidkare som saljer till konsumenter i EU
// — angerratt, moms, uppsagning — ar med for att de MASTE vara med, men
// de behover las igenom av nagon som kan omradet innan skarp drift.
//
// [FYLL I]-markeringarna maste bort innan lansering.

import type { Metadata } from "next";
import { PRICES, formatPrice } from "@/lib/billing/plans";

export const metadata: Metadata = { title: "Terms" };

const UPDATED = "30 August 2026";

export default function TermsPage() {
  return (
    <article>
      <p style={eyebrow}>Last updated {UPDATED}</p>
      <h1 style={h1}>Terms</h1>

      <p style={lede}>
        Rhapsode helps you learn texts by heart. These terms describe what you
        can expect from it, and what it expects from you.
      </p>

      <Section title="Who you are contracting with">
        <p style={p}>
          Rhapsode is operated by <strong>[FYLL I: företagsnamn och
          organisationsnummer]</strong>, <strong>[FYLL I: adress]</strong>,
          contactable at <strong>[FYLL I: kontakt-e-post]</strong>.
        </p>
      </Section>

      <Section title="Your account">
        <p style={p}>
          You need an account to use Rhapsode. Keep your sign-in details to
          yourself; you are responsible for what happens under your account. You
          must be 13 or older, and if you are under 18 you need a parent or
          guardian&apos;s permission.
        </p>
      </Section>

      <Section title="Your texts">
        <p style={p}>
          Anything you upload stays yours. We do not claim ownership of it, we
          do not publish it, and we do not use it to train anything. We store and
          process it only to run the service for you — which includes sending
          the relevant passage to our processors when you ask for a generated
          feature.
        </p>
        <p style={p}>
          You are responsible for having the right to upload what you upload.
          Public-domain works are safe; a copyrighted text is your own copy for
          your own study, and you should not upload material you have no right
          to use.
        </p>
        <p style={p}>
          A work is private unless you mark it public. Public means its title
          and author are visible to people you have accepted as friends — never
          the text, your attempts or your scores.
        </p>
      </Section>

      <Section title="Free and Pro">
        <p style={p}>
          Rhapsode is free to use, with limits on how many works you may keep
          and how much generated material you may request each month. Rhapsode
          Pro raises or removes those limits and adds the advanced features. The
          current limits are always shown in the app.
        </p>
        <p style={p}>
          Pro costs {formatPrice(PRICES.month.amountMinor, PRICES.month.currency)}{" "}
          per month or {formatPrice(PRICES.year.amountMinor, PRICES.year.currency)}{" "}
          per year, including VAT where it applies. It renews automatically until
          you cancel. Prices may change, but never for a period you have already
          paid for, and we will tell you before a change takes effect.
        </p>
      </Section>

      <Section title="Cancelling">
        <p style={p}>
          Cancel at any time from Settings → Subscription, which opens Stripe&apos;s
          billing portal. Your subscription then runs to the end of the period
          you have paid for and stops — you keep everything until that date. We
          do not refund part-months.
        </p>
      </Section>

      <Section title="Right of withdrawal">
        <p style={p}>
          If you are a consumer in the EU you normally have fourteen days to
          withdraw from a distance contract. Because Rhapsode Pro is digital
          content supplied immediately, that right ends once the service has
          begun — and by subscribing you agree to it beginning at once and
          acknowledge losing the right of withdrawal.
        </p>
        <p style={p}>
          If something goes wrong in those first fourteen days, write to us
          anyway. We would rather refund someone who is unhappy than argue about
          it.
        </p>
      </Section>

      <Section title="What the service is, and is not">
        <p style={p}>
          Rhapsode is a practice tool. It is provided as it is, and we do not
          promise it will be free of faults or available without interruption.
          Some features depend on third parties — sign-in, payments, speech
          recognition in your browser, and a language model for the generated
          features — and may be unavailable when those are.
        </p>
        <p style={p}>
          Generated material can be wrong. Cleanup, glossaries, translations and
          analysis are aids, not authorities. Your original text is never
          overwritten without you approving the change first.
        </p>
        <p style={p}>
          <strong>Keep your own copy of anything you cannot afford to lose.</strong>{" "}
          The app can export your whole library, and you should use it.
        </p>
      </Section>

      <Section title="Fair use of the service">
        <p style={p}>
          Do not attempt to get around the limits, automate the service, resell
          access, or upload material that is unlawful. We may suspend an account
          that does. If we suspend yours for something other than a serious
          breach, we will refund the unused part of your subscription.
        </p>
      </Section>

      <Section title="Liability">
        <p style={p}>
          Nothing here limits liability that cannot be limited by law, including
          for death, personal injury, fraud, or your statutory rights as a
          consumer. Beyond that, our liability is limited to what you have paid
          in the twelve months before the claim.
        </p>
      </Section>

      <Section title="Governing law">
        <p style={p}>
          These terms are governed by <strong>[FYLL I: svensk rätt]</strong>. As
          a consumer you keep the protection of the mandatory rules of the
          country you live in, and you may bring a dispute to the EU&apos;s online
          dispute resolution platform or your national consumer board — in
          Sweden, Allmänna reklamationsnämnden.
        </p>
      </Section>

      <Section title="Changes">
        <p style={p}>
          We will tell you in the app before any material change to these terms.
          If you do not accept a change, cancel before it takes effect.
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
