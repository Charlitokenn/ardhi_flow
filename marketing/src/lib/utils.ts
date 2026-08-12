import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function NormalizeEmail(email: string): string {
  const [local, domain] = email.toLowerCase().trim().split("@");

  if (domain === "gmail.com" || domain === "googlemail.com") {
    // Gmail: dots ignored, + aliases ignored
    return local.replace(/\./g, ".").split("+")[0] + "@gmail.com";
  }

  // All other providers: preserve dots and +, only normalize case
  return local + "@" + domain;
}

export function Capitalize(str: string): string {
  if (!str || typeof str !== "string") return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function GetInitials(firstName?: string | null, lastName?: string | null): string {
  const f = firstName?.trim().charAt(0).toUpperCase() ?? "";
  const l = lastName?.trim().charAt(0).toUpperCase() ?? "";
  return `${f}${l}`;
}

interface GreetingProps {
  title: string;
  subtitle: string;
  timeOfDay: "morning" | "afternoon" | "evening";
}

export function GetGreetingProps(name?: string | null | undefined): GreetingProps {
  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const displayName = name?.trim() || "there";

  // Titles: standard, warm, welcoming, encouraging
  const titles: Record<string, string[]> = {
    morning: [
      "Good morning",
      "Morning",
    ],
    afternoon: [
      "Good afternoon",
      "Afternoon",
    ],
    evening: [
      "Good evening",
      "Evening",
    ],
  };

  // Subtitles: quirky, playful, energetic
  const subtitles: Record<string, string[]> = {
    morning: [
      "Coffee's brewing, your books are behaving",
      "Ledgers balanced, ego intact",
      "Today's forecast: 0% chance of mystery expenses",
      "Your invoices called, they're feeling optimistic",
      "Debits and credits, in perfect morning harmony",
      "Rise and reconcile",
      "Cash flow status: flowing, not fleeing",
      "Another day, another chance to categorize that one weird expense",
      "Morning mood: audit-proof and proud",
      "Your P&L woke up looking good today",
      "Receipts filed, conscience clear",
      "Start the day debit-side up",
      "Today's goal: fewer spreadsheets, more sanity",
      "Your accountant would be so proud right now",
      "Fresh books, fresh start, zero red flags",
    ],
    afternoon: [
      "Still reconciling? Respect",
      "Afternoon slump, but your balance sheet is thriving",
      "You're closer to closing the books than closing your eyes",
      "Invoices sent, dignity intact",
      "Halfway through the day, fully through your receipts",
      "Afternoon mood: caffeinated and TRA-compliant",
      "Numbers add up, unlike your lunch order",
      "You're basically a spreadsheet whisperer by now",
      "Midday check: still no unexplained variances",
      "Chasing payments, not your tail",
      "You're the reason this quarter isn't a disaster",
      "Snack time = journal entry time",
      "Your cash flow is doing better than your Wi-Fi",
      "Afternoon energy: 100% reconciled, 100% ready",
    ],
    evening: [
      "Books closed, conscience clear",
      "Evening mode: calculator retired for the day",
      "Your ledger missed you, go say hi",
      "Day complete, zero unreconciled transactions",
      "Evening status: offline and off the hook",
      "You adulted hard today, even the taxman would nod",
      "Evening forecast: 100% chance of a tidy balance sheet",
      "Your receipts are finally where they belong, filed",
      "You closed it out, now let the couch close in",
      "Evening ritual: pretend next month's TRA deadline doesn't exist yet",
      "Today's plot twist: everything actually balanced",
      "Evening vibe: human-shaped profit margin",
      "You've earned the right to stop thinking about invoices",
      "Evening report: reconciled, invoiced, now horizontal",
      "Time to switch from bookkeeping mode to do-nothing mode",
    ],
  };

  const titlePool = titles[timeOfDay];
  const subtitlePool = subtitles[timeOfDay];

  const title = `${titlePool[Math.floor(Math.random() * titlePool.length)]}, ${displayName}`;
  const subtitle = subtitlePool[Math.floor(Math.random() * subtitlePool.length)];

  return { title, subtitle, timeOfDay };
}