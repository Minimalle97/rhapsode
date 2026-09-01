// lib/repertoire/archives.ts
//
// Var texterna finns.
//
// Repertoaren for ingen dikttext sjalv — se data.ts for skalet. Den pekar
// i stallet ut arkiv, och varje lank ar en FORIFYLLD SOKNING, inte en
// direktadress till en sida.
//
// Det ar ett medvetet val och det ar samma val som listan sjalv gor.
// Direktlankar till enskilda sidor gar sonder sa fort ett arkiv lagger om
// sina adresser, och det gor de. En sokning overlever det. Priset ar att
// forsta traffen inte alltid ar ratt — vid en vanlig titel far man titta
// ned nagra rader — och det ar ett battre pris an dod lank.
//
// Alla adresser nedan ar provade. Aozoras eget sokgranssnitt fanns inte
// kvar (404), sa den gar via en sajtbegransad sokning i stallet; det ar
// arligare an att lanka till nagot som inte svarar.

export type ArchiveCode =
  | "WS" | "LA" | "FR" | "DE" | "ES" | "IT" | "RU" | "SV"
  | "PG" | "PF" | "PO" | "CT" | "AZ" | "GJ" | "CV" | "LB" | "OS" | "WEB";

export interface Archive {
  code:  ArchiveCode;
  /** Vad lanken heter i granssnittet. */
  label: string;
  /** En rad om vad arkivet ar bra pa. Blir lankens title-attribut. */
  note:  string;
  /** Sant nar arkivet erbjuder nedladdning, inte bara text att kopiera. */
  downloads: boolean;
  build: (title: string, author: string) => string;
}

const q = (...parts: string[]) => encodeURIComponent(parts.filter(Boolean).join(" "));

/** Wikisource pa ett sprak. Samma MediaWiki-sokning overallt. */
function wikisource(code: ArchiveCode, lang: string, label: string, note: string): Archive {
  return {
    code, label, note, downloads: true,
    build: (title, author) =>
      `https://${lang}.wikisource.org/w/index.php?search=${q(title, author)}&fulltext=1`,
  };
}

/**
 * Sajtbegransad sokning. Reservvagen for arkiv utan brukbart eget
 * sokgranssnitt — den hittar sidan, och den slutar aldrig fungera.
 */
function siteSearch(code: ArchiveCode, host: string, label: string, note: string, downloads: boolean): Archive {
  return {
    code, label, note, downloads,
    build: (title, author) =>
      `https://duckduckgo.com/?q=${encodeURIComponent(`site:${host} ${title} ${author}`)}`,
  };
}

export const ARCHIVES: Record<ArchiveCode, Archive> = {
  WS: wikisource("WS", "en", "Wikisource",    "Public-domain verse, transcribed. Copy or download."),
  LA: wikisource("LA", "la", "Wikisource LA", "The Latin original."),
  FR: wikisource("FR", "fr", "Wikisource FR", "The French original."),
  DE: wikisource("DE", "de", "Wikisource DE", "The German original."),
  ES: wikisource("ES", "es", "Wikisource ES", "The Spanish original."),
  IT: wikisource("IT", "it", "Wikisource IT", "The Italian original."),
  RU: wikisource("RU", "ru", "Wikisource RU", "The Russian original."),
  SV: wikisource("SV", "sv", "Wikisource SV", "The Swedish original."),

  PG: {
    code: "PG", label: "Gutenberg", downloads: true,
    note: "Whole collections. Plain text, EPUB and HTML downloads.",
    build: (title, author) =>
      `https://www.gutenberg.org/ebooks/search/?query=${q(title, author)}`,
  },

  PF: {
    code: "PF", label: "Poetry Foundation", downloads: false,
    note: "Licensed modern poetry. Text can be copied; no file download.",
    build: (title, author) =>
      `https://www.poetryfoundation.org/search?query=${q(title, author)}`,
  },

  PO: {
    code: "PO", label: "Poets.org", downloads: false,
    note: "Licensed modern poetry, strong on American poets.",
    build: (title, author) =>
      `https://poets.org/search?combine=${q(title, author)}`,
  },

  CT: {
    code: "CT", label: "Chinese Text Project", downloads: true,
    note: "Classical Chinese originals with parallel English.",
    build: (title) => `https://ctext.org/searchbooks.pl?searchu=${q(title)}`,
  },

  // Aozoras cgi-bin/search.cgi svarar 404 sedan en omlaggning. Sajtsokning
  // i stallet — den hittar ratt kort, och den gar inte sonder igen.
  AZ: siteSearch("AZ", "aozora.gr.jp", "Aozora Bunko",
                 "The Japanese public-domain library. Plain text and downloads.", true),

  GJ: {
    code: "GJ", label: "Ganjoor", downloads: false,
    note: "The standard free corpus of classical Persian poetry.",
    build: (title, author) => `https://ganjoor.net/search?s=${q(title, author)}`,
  },

  CV: {
    code: "CV", label: "Cervantes Virtual", downloads: true,
    note: "Spanish and Latin American texts.",
    build: (title, author) =>
      `https://www.cervantesvirtual.com/buscador/?q=${q(title, author)}`,
  },

  LB: {
    code: "LB", label: "Litteraturbanken", downloads: true,
    note: "Swedish and Nordic literature, with clean text and EPUB files.",
    build: (title, author) => `https://litteraturbanken.se/sok?q=${q(title, author)}`,
  },

  OS: {
    code: "OS", label: "Open Source Shakespeare", downloads: false,
    note: "Every play and poem, line-numbered and copyable.",
    build: (title) =>
      `https://www.opensourceshakespeare.org/search/search-results.php?keyword1=${q(title)}`,
  },

  WEB: {
    code: "WEB", label: "Web search", downloads: false,
    note: "A plain search, for where no single archive is reliable.",
    build: (title, author) =>
      `https://duckduckgo.com/?q=${encodeURIComponent(`${title} ${author} poem full text`)}`,
  },
};

export function archiveUrl(code: ArchiveCode, title: string, author: string): string {
  return ARCHIVES[code].build(title, author);
}
