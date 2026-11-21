import { addDaysKey, weekdayOf } from "../time";
import type { Service, Staff } from "../types";

/**
 * Reads a customer's message: what they want, which service, who, when.
 * In demo mode this is rule-based so it runs free, offline and the same every
 * time. With an LLM key, the same slots are filled by the model instead.
 */

export type Intent =
  | "book"
  | "reschedule"
  | "cancel"
  | "human"
  | "hours"
  | "location"
  | "price"
  | "services"
  | "policy"
  | "greet"
  | "thanks"
  | "yes"
  | "no"
  | "unknown";

export type PartOfDay = "morning" | "afternoon" | "evening";

export interface Understood {
  intent: Intent;
  serviceId?: string;
  ambiguousCut?: boolean;
  staffId?: string;
  date?: string;
  partOfDay?: PartOfDay;
  /** Minutes after midnight */
  time?: number;
  code?: string;
  email?: string;
  phone?: string;
  otp?: string;
  ordinal?: number;
}

const SERVICE_WORDS: [RegExp, string][] = [
  [/balayage|highlights?|ombre/, "svc_balayage"],
  [/roots?|regrowth|touch[- ]?up/, "svc_roots"],
  [/colou?r|dye|tint my hair|grey|gray/, "svc_full"],
  [/fringe|bangs/, "svc_fringe"],
  [/blow[- ]?dry|blowout|blow out|wash/, "svc_blow"],
  [/men'?s|male|gents|beard|fade|my son|boy/, "svc_mcut"],
  [/women'?s|ladies|female|layers|bob/, "svc_wcut"],
  [/mani|nails?|gel/, "svc_gel"],
  [/facial|skin|face/, "svc_facial"],
  [/brows?|eyebrows?/, "svc_brows"],
];

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const ORDINALS: Record<string, number> = { first: 1, "1st": 1, second: 2, "2nd": 2, third: 3, "3rd": 3, last: -1 };
const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

export function understand(raw: string, ctx: { services: Service[]; staff: Staff[]; today: string }): Understood {
  // Normalise speech-to-text quirks: "p.m." -> "pm", "two pm" -> "2 pm"
  let text = ` ${raw.toLowerCase().replace(/[’']/g, "'").replace(/a\.m\./g, "am").replace(/p\.m\./g, "pm")} `;
  text = text.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b(?=\s*(am|pm|o'?clock|thirty|fifteen|forty))/g, (w) =>
    String(WORD_NUMBERS[w]),
  );
  text = text.replace(/(\d{1,2}) thirty/g, "$1:30").replace(/(\d{1,2}) fifteen/g, "$1:15").replace(/(\d{1,2}) forty[- ]five/g, "$1:45");

  const u: Understood = { intent: "unknown" };

  const code = raw.toUpperCase().match(/SL-?([A-Z0-9]{6})\b/);
  if (code) u.code = `SL-${code[1]}`;
  const email = raw.match(/[^\s@,;<>]+@[^\s@,;<>]+\.[a-z]{2,}/i);
  if (email) u.email = email[0].toLowerCase();
  const otp = raw.match(/\b(\d{6})\b/);
  if (otp && !code) u.otp = otp[1];
  const phone = raw.match(/\+?\d[\d\s().-]{6,}\d/);
  if (phone && !otp) u.phone = phone[0].trim();

  for (const [re, id] of SERVICE_WORDS) {
    if (re.test(text) && ctx.services.some((s) => s.id === id)) {
      u.serviceId = id;
      break;
    }
  }
  if (!u.serviceId && /\b(hair ?cut|cut|trim)\b/.test(text)) u.ambiguousCut = true;

  for (const s of ctx.staff) {
    const first = s.name.split(" ")[0].toLowerCase();
    if (new RegExp(`\\b${first}\\b`).test(text)) u.staffId = s.id;
  }
  if (/\b(anyone|any one|whoever|doesn'?t matter|no preference|any(body)?)\b/.test(text)) u.staffId = "any";

  u.date = parseDate(text, ctx.today);
  if (/\bmorning\b|\bearly\b/.test(text)) u.partOfDay = "morning";
  else if (/\bafternoon\b|\blunch\b|\bmidday\b/.test(text)) u.partOfDay = "afternoon";
  else if (/\bevening\b|after work|\blate\b|\btonight\b/.test(text)) u.partOfDay = "evening";
  u.time = parseTime(text);

  for (const [w, n] of Object.entries(ORDINALS)) if (new RegExp(`\\b${w}\\b`).test(text)) u.ordinal = n;

  // Intent, strongest signals first
  if (/\b(human|person|someone|real|staff member|manager|receptionist|call me|speak to|talk to)\b/.test(text)) u.intent = "human";
  else if (/\bcancel\b/.test(text)) u.intent = "cancel";
  else if (/reschedul|\bmove\b|change (my|the) (booking|appointment|time|day)|different (time|day)|another (time|day)|push it/.test(text))
    u.intent = "reschedule";
  else if (/^\s*(yes|yeah|yep|yup|sure|ok|okay|please|correct|confirm|sounds good|perfect|great|that works|do it|go ahead)\b/.test(text))
    u.intent = "yes";
  else if (/^\s*(no|nope|nah|not really|don'?t)\b/.test(text)) u.intent = "no";
  else if (/how much|price|cost|\bfee\b|charge/.test(text)) u.intent = "price";
  else if (/cancellation policy|\bdeposit\b|refund|no[- ]show/.test(text)) u.intent = "policy";
  else if (/what (services|do you (do|offer))|services do|your menu|treatments/.test(text)) u.intent = "services";
  else if (/\bopen\b|\bclose|hours|opening/.test(text) && !u.serviceId) u.intent = "hours";
  else if (/where|address|located|location|parking|directions|find you/.test(text)) u.intent = "location";
  else if (
    u.serviceId ||
    u.ambiguousCut ||
    /\bbook|appointment|available|availability|free|slot|get in|come in|schedule|reserve|need a|want a|can i get/.test(text)
  )
    u.intent = "book";
  else if (/^\s*(hi|hello|hey|good (morning|afternoon|evening)|salam|assalam)/.test(text)) u.intent = "greet";
  else if (/\b(thanks|thank you|cheers|bye)\b/.test(text)) u.intent = "thanks";

  return u;
}

export function parseDate(text: string, today: string): string | undefined {
  if (/day after tomorrow/.test(text)) return addDaysKey(today, 2);
  if (/\b(tomorrow|tmrw|tmr)\b/.test(text)) return addDaysKey(today, 1);
  if (/\b(today|tonight)\b/.test(text)) return today;
  if (/\b(this )?weekend\b/.test(text)) return nextWeekday(today, 6, false);

  for (let i = 0; i < 7; i++) {
    const full = WEEKDAYS[i];
    if (new RegExp(`\\b(${full}|${full.slice(0, 3)})\\b`).test(text)) {
      return nextWeekday(today, i, new RegExp(`next (${full}|${full.slice(0, 3)})`).test(text));
    }
  }

  const [ty, tm, td] = today.split("-").map(Number);
  const monthFirst = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? (\d{1,2})(st|nd|rd|th)?\b/);
  const dayFirst = text.match(/\b(\d{1,2})(st|nd|rd|th)? (of )?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/);
  if (monthFirst || dayFirst) {
    const month = MONTHS.indexOf((monthFirst ? monthFirst[1] : dayFirst![4]).slice(0, 3)) + 1;
    const day = Number(monthFirst ? monthFirst[2] : dayFirst![1]);
    const year = month < tm || (month === tm && day < td) ? ty + 1 : ty;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const ordinal = text.match(/\b(?:the )?(\d{1,2})(st|nd|rd|th)\b/);
  if (ordinal) {
    const day = Number(ordinal[1]);
    if (day >= 1 && day <= 31) {
      let y = ty;
      let m = tm;
      if (day < td) m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
      return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  return undefined;
}

function nextWeekday(today: string, target: number, forceNextWeek: boolean): string {
  const diff = (target - weekdayOf(today) + 7) % 7;
  return addDaysKey(today, forceNextWeek && diff === 0 ? 7 : diff);
}

export function parseTime(text: string): number | undefined {
  if (/\bnoon\b|\bmidday\b/.test(text)) return 12 * 60;
  const m =
    text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/) ??
    text.match(/\b(\d{1,2}):(\d{2})\b/) ??
    text.match(/\bat (\d{1,2})\b(?!\s*(st|nd|rd|th))/);
  if (!m) return undefined;
  let h = Number(m[1]);
  const min = m[2] && /^\d{2}$/.test(m[2]) ? Number(m[2]) : 0;
  const suffix = m[3];
  if (h > 23 || min > 59) return undefined;
  if (suffix === "pm" && h < 12) h += 12;
  if (suffix === "am" && h === 12) h = 0;
  if (!suffix && h >= 1 && h <= 7) h += 12; // "at 3" in a salon means 3 pm
  return h * 60 + min;
}
