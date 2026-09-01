// tests/recording.test.ts
//
// Rostinspelningen i framforande- och tvekampslaget.
//
// Granskning av kallan, av samma skal som security.test.ts: det som ska
// bevisas ar att en viss form FINNS, och den formen gar inte att se i ett
// utfall — den syns bara i hur komponenten bestammer vad som ritas.
//
// ── Felet som provas ──────────────────────────────────────────────────
//
// Bada vyerna villkorades pa `speech.isActive`. `speech.stop()` satter
// det till falskt SYNKRONT, sa i samma ogonblick man tryckte Finish foll
// komponenten igenom till Begin-skarmen — medan anropet fortfarande var i
// luften. Det sag ut som att framforandet plotsligt tagit slut och att
// inspelningen kastats bort. Stod inspelningen tom hamnade man likaledes
// pa Begin, med ett felmeddelande ingen hann lasa.
//
// ReciteMode hade aldrig felet, for det laget skiljer pa att sluta tala
// och att skicka in. Det ar den skillnaden som proven nedan later.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

const VOICE = [
  ["performance", "components/practice/PerformanceMode.tsx"],
  ["duel",        "components/duels/DuelPerformance.tsx"],
] as const;

describe.each(VOICE)("%s mode: what decides the screen", (_name, file) => {
  const src = read(file);

  it("never branches the view on the speech engine", () => {
    // Karnan i felet. Motorn far inte avgora vad som visas — den stangs
    // av bade nar man ar klar och nar Chrome tappar sessionen mitt i en
    // andhamtning.
    expect(src).not.toMatch(/if \(speech\.isActive\) \{/);
    expect(src).not.toMatch(/if \(result\) \{/);
  });

  it("draws from an explicit phase instead", () => {
    // Vilket NAMN variabeln har spelar ingen roll — `shown` ar `phase`
    // med motorns haveri inraknat, uträknat i stallet for synkat i en
    // effekt. Det som provas ar att ett uttalat lage styr vyn.
    expect(src).toMatch(/type Phase =/);
    expect(src).toMatch(/(phase|shown) === "performing"/);
    expect(src).toMatch(/(phase|shown) === "review"/);
  });

  it("separates stopping from sending", () => {
    // Tva beslut, tva knappar. Att sluta tala ar inte att skicka in.
    expect(src).toMatch(/function stopSpeaking\(\)/);
    expect(src).toMatch(/setPhase\("review"\)/);

    const stop = src.slice(src.indexOf("function stopSpeaking()"));
    const body = stop.slice(0, stop.indexOf("\n  }"));
    expect(body).toMatch(/speech\.stop\(\)/);
    // Stoppet far inte skicka nagot.
    expect(body).not.toMatch(/fetch\(|submit\(/);
  });

  it("keeps what was said when the request fails", () => {
    // Tillbaka till granskningen, inte till borjan — annars ar ett
    // natverksfel detsamma som att tappa framforandet.
    expect(src).toMatch(/catch \(err\)[\s\S]{0,220}setPhase\("review"\)/);
  });

  it("shows what was heard before anything is sent", () => {
    // Ordantalet ar inte langre rubriken — det som horts ar det. Provet
    // haller pa egenskapen och inte pa den gamla etiketten: rutan ska
    // visa TEXTEN, och rakningen ska sta vid sidan av den.
    expect(src).toMatch(/Recorded/);
    expect(src).toMatch(/\{words\} words/);
    expect(src).toMatch(/liveText/);
  });

  it("keeps the word count small rather than making it the headline", () => {
    // Den stora siffran drog blicken till en rakning i stallet for till
    // om mikrofonen uppfattat orden ratt.
    expect(src).not.toMatch(/fontSize: "40px"/);
    expect(src).toMatch(/Heard/);
  });

  it("counts the trailing words the engine had not finalised", () => {
    // Chrome hinner inte alltid gora sista frasen slutgiltig innan
    // stop(). Utan interimtexten tappades slutet av varje forsok.
    expect(src).toMatch(/function spoken\(\)/);
    expect(src).toMatch(/speech\.transcript, speech\.interimTranscript/);
    // Och den gamla vagen — bara transcript — ska vara borta.
    expect(src).not.toMatch(/const transcript = speech\.transcript\.trim\(\)/);
  });

  it("takes what was said when the engine gives up on its own", () => {
    // Nekad mikrofon mitt i ett framforande ska inte kasta bort det man
    // redan sagt.
    expect(src).toMatch(/phase === "performing" && !speech\.isActive/);
  });
});

describe("the engine itself still survives a pause", () => {
  const src = read("hooks/useSpeechRecitation.ts");

  it("restarts when the browser ends the session by itself", () => {
    // Chrome avslutar efter en stunds tystnad. Utan omstarten dog
    // framforandet av en andhamtning.
    expect(src).toMatch(/if \(wantListening\.current\)/);
    expect(src).toMatch(/begin\(true\)/);
  });

  it("keeps the transcript across that restart", () => {
    expect(src).toMatch(/keepTranscript/);
  });
});

// ── Att en tvekamp gar att se ─────────────────────────────────────────
describe("a duel is visible where the opponent is", () => {
  it("marks the friend in the list", () => {
    // Gick tidigare bara att se pa verket. Man kunde sta och titta rakt
    // pa sin motstandare utan att fa veta att man slogs med dem.
    const lib = read("lib/friends.ts");
    expect(lib).toMatch(/duel: \{ id: string; status: "pending" \| "active"/);
    expect(lib).toMatch(/duelsWithPeople\(userId, ids\)/);

    const hub = read("components/friends/FriendsHub.tsx");
    expect(hub).toMatch(/const dueling = person\.duel !== null/);
    expect(hub).toMatch(/In a duel with you/);
  });

  it("says so on their profile instead of offering a fresh challenge", () => {
    const invite = read("components/duels/DuelInvite.tsx");
    expect(invite).toMatch(/You are in a duel with/);
    // Rutan for en ny inbjudan far inte ritas nar en kamp redan pagar.
    //
    // Provas pa ORDNINGEN mellan de tva grenarna i stallet for pa
    // blanktecknen mellan dem. Filen har CRLF, och ett prov som beror pa
    // radslut gar sonder pa nasta maskin utan att nagot faktiskt ar fel.
    const duelBranch = invite.indexOf("if (duel) {");
    const openBranch = invite.indexOf("if (!open) {");
    expect(duelBranch).toBeGreaterThan(-1);
    expect(openBranch).toBeGreaterThan(-1);
    expect(duelBranch).toBeLessThan(openBranch);
  });

  it("looks it up for the whole list in one query", () => {
    const src = read("lib/duels.ts");
    const fn  = src.slice(src.indexOf("export async function duelsWithPeople"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect((body.match(/await prisma\./g) ?? [])).toHaveLength(1);
  });
});

// ── Doda lankar ───────────────────────────────────────────────────────
describe("the repertoire says what to do about a dead link", () => {
  it("tells the reader to search the title themselves", () => {
    const src = read("components/repertoire/EntryList.tsx");
    expect(src).toMatch(/If a link is dead/);
    expect(src).toMatch(/search[\s\S]{0,60}the title and author yourself/);
    expect(src).toMatch(/fix\s+broken links/);
  });
});
