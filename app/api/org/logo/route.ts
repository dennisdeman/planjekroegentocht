import { NextResponse } from "next/server";
import { requireAuth, requireFeature } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { updateOrgLogo, findOrganizationById } from "@lib/server/db";

const MAX_LOGO_SIZE = 500 * 1024; // 500KB max

export async function GET() {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;

  await ensureMigrations();
  const client = getClient();
  const schema = getSchema();
  const org = await findOrganizationById(client, schema, authResult.session.orgId);

  return NextResponse.json({ logoData: org?.logo_data ?? null });
}

export async function POST(request: Request) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const featureResult = await requireFeature(authResult.session, "export");
  if (!featureResult.ok) return featureResult.response;

  try {
    const body = await request.json();
    const logoData = body.logoData as string | null;

    if (logoData) {
      // Valideer base64 image — alleen PNG en JPEG toestaan
      const allowedPrefixes = ["data:image/png;base64,", "data:image/jpeg;base64,", "data:image/jpg;base64,"];
      if (!allowedPrefixes.some((p) => logoData.startsWith(p))) {
        return NextResponse.json({ error: "Ongeldig bestandsformaat. Upload een PNG of JPG afbeelding." }, { status: 400 });
      }
      // Decode base64 en check werkelijke grootte
      const base64Part = logoData.split(",")[1];
      if (!base64Part) {
        return NextResponse.json({ error: "Ongeldig bestandsformaat." }, { status: 400 });
      }
      const actualSize = Math.ceil(base64Part.length * 3 / 4);
      if (actualSize > MAX_LOGO_SIZE) {
        return NextResponse.json({ error: `Bestand te groot (${Math.round(actualSize / 1024)}KB). Maximaal 500KB.` }, { status: 400 });
      }
    }

    await ensureMigrations();
    const client = getClient();
    const schema = getSchema();
    await updateOrgLogo(client, schema, authResult.session.orgId, logoData);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Logo opslaan mislukt." }, { status: 500 });
  }
}

export async function DELETE() {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;

  await ensureMigrations();
  const client = getClient();
  const schema = getSchema();
  await updateOrgLogo(client, schema, authResult.session.orgId, null);

  return NextResponse.json({ ok: true });
}
