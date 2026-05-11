/**
 * Mollie API client — singleton voor betalingen.
 */
import { createMollieClient } from "@mollie/api-client";

const apiKey = process.env.MOLLIE_API_KEY;
if (!apiKey) {
  console.warn("[mollie] MOLLIE_API_KEY niet ingesteld — betalingen uitgeschakeld.");
}

export const mollieClient = apiKey ? createMollieClient({ apiKey }) : null;

/** Prijzen in euro's */
export const PLAN_PRICES: Record<string, { amount: string; description: string; days: number }> = {
  pro_event: { amount: "9.95", description: "Plan je Kroegentocht — Pro Event", days: 30 },
  pro_year: { amount: "24.95", description: "Plan je Kroegentocht — Pro Jaar", days: 365 },
};
