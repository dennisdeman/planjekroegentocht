import { NextResponse } from "next/server";
import { sendContactEmail } from "@lib/server/email";
import { checkRateLimit, getClientIp } from "@lib/server/rate-limit";

export async function POST(request: Request) {
  const rl = checkRateLimit(getClientIp(request), { prefix: "contact", maxRequests: 3, windowSeconds: 300 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Te veel verzoeken. Probeer het later opnieuw." }, { status: 429 });
  }

  try {
    const body = await request.json();
    const { naam, email, onderwerp, bericht } = body as {
      naam?: string;
      email?: string;
      onderwerp?: string;
      bericht?: string;
    };

    if (!naam?.trim() || !email?.trim() || !onderwerp?.trim() || !bericht?.trim()) {
      return NextResponse.json({ error: "Alle velden zijn verplicht." }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Ongeldig e-mailadres." }, { status: 400 });
    }
    if (naam.length > 100 || email.length > 255 || onderwerp.length > 200 || bericht.length > 5000) {
      return NextResponse.json({ error: "Een of meer velden zijn te lang." }, { status: 400 });
    }

    await sendContactEmail({
      name: naam.trim(),
      email: email.trim(),
      subject: onderwerp.trim(),
      message: bericht.trim(),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Versturen mislukt.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
