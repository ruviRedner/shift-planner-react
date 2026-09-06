import { flags, gematriya, getHolidaysOnDate, getSedra, HDate, ParshaEvent } from "@hebcal/core";

export const PARASHOT_BY_BOOK = {
  "בראשית": [
    "בראשית", "נח", "לך לך", "וירא", "חיי שרה", "תולדות", "ויצא",
    "וישלח", "וישב", "מקץ", "ויגש", "ויחי",
  ],
  "שמות": [
    "שמות", "וארא", "בא", "בשלח", "יתרו", "משפטים", "תרומה", "תצוה",
    "כי תשא", "ויקהל", "פקודי",
  ],
  "ויקרא": [
    "ויקרא", "צו", "שמיני", "תזריע", "מצורע", "אחרי מות", "קדושים",
    "אמור", "בהר", "בחוקותי",
  ],
  "במדבר": [
    "במדבר", "נשא", "בהעלותך", "שלח", "קרח", "חקת", "בלק", "פינחס",
    "מטות", "מסעי",
  ],
  "דברים": [
    "דברים", "ואתחנן", "עקב", "ראה", "שופטים", "כי תצא", "כי תבוא",
    "נצבים", "וילך", "האזינו", "וזאת הברכה",
  ],
} as const;

export type TorahBook = keyof typeof PARASHOT_BY_BOOK;

export type JewishDayInfo = {
  hebrewDate: string;
  holidays: string[];
};

export type JewishWeekInfo = {
  parasha: string;
  book: TorahBook | "";
  shabbatHoliday: string;
};

const HOLIDAY_MASK =
  flags.CHAG |
  flags.MINOR_HOLIDAY |
  flags.CHOL_HAMOED |
  flags.MODERN_HOLIDAY |
  flags.MAJOR_FAST |
  flags.MINOR_FAST;

function stripNikud(value: string): string {
  return value.normalize("NFD").replace(/[\u0591-\u05C7]/g, "");
}

function holidaysFor(date: Date): string[] {
  const events = getHolidaysOnDate(date, true) ?? [];
  return [...new Set(
    events
      .filter((event) => (event.getFlags() & HOLIDAY_MASK) !== 0)
      .map((event) =>
        stripNikud(event.render("he")).replace(/\b(5\d{3})\b/g, (_, year: string) =>
          gematriya(Number(year)),
        ),
      ),
  )];
}

export function getJewishDayInfo(date: Date): JewishDayInfo {
  const hebrewDate = new HDate(date).renderGematriya(true);
  return { hebrewDate, holidays: holidaysFor(date) };
}

export function getJewishWeekInfo(shabbatDate: Date): JewishWeekInfo {
  const hdate = new HDate(shabbatDate);
  const sedra = getSedra(hdate.getFullYear(), true).lookup(hdate);
  const shabbatHoliday = holidaysFor(shabbatDate).join(" · ");
  const parasha = sedra.chag
    ? ""
    : stripNikud(new ParshaEvent(sedra).render("he").replace(/^פרשת\s+/, ""));
  const firstParasha = parasha.split(/[־-]/)[0].trim();
  const book = (Object.entries(PARASHOT_BY_BOOK).find(([, names]) =>
    (names as readonly string[]).includes(firstParasha),
  )?.[0] ?? "") as TorahBook | "";

  return { parasha, book, shabbatHoliday };
}
