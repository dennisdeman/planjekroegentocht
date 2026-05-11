import { NextResponse } from "next/server";
import { requireSuperadmin } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { listCoupons, createCoupon, toggleCouponActive, deleteCoupon, logActivity } from "@lib/server/db";

export async function GET() {
  const authResult = await requireSuperadmin();
  if (!authResult.ok) return authResult.response;

  await ensureMigrations();
  const client = getClient();
  const schema = getSchema();
  const coupons = await listCoupons(client, schema);
  return NextResponse.json({ coupons });
}

export async function POST(request: Request) {
  const authResult = await requireSuperadmin();
  if (!authResult.ok) return authResult.response;

  await ensureMigrations();
  const client = getClient();
  const schema = getSchema();

  const body = await request.json();
  const { action } = body;

  if (action === "create") {
    const { code, discountCents, description, validForPlan, maxUses, expiresAt } = body;
    if (!code?.trim() || !discountCents || discountCents <= 0) {
      return NextResponse.json({ error: "Code en kortingsbedrag zijn verplicht." }, { status: 400 });
    }
    const coupon = await createCoupon(client, schema, {
      code, discountCents, description, validForPlan, maxUses, expiresAt,
    });
    await logActivity(client, schema, {
      userId: authResult.userId,
      action: "admin.coupon.create",
      detail: { code: coupon.code, discountCents },
    });
    return NextResponse.json({ ok: true, coupon });
  }

  if (action === "update") {
    const { couponId, discountCents, description, validForPlan, maxUses, expiresAt } = body;
    if (!couponId) return NextResponse.json({ error: "couponId verplicht." }, { status: 400 });
    await client.query(
      `UPDATE ${schema}.coupons SET
        discount_cents = COALESCE($1, discount_cents),
        description = COALESCE($2, description),
        valid_for_plan = $3,
        max_uses = $4,
        expires_at = $5
       WHERE id = $6;`,
      [discountCents ?? null, description ?? null, validForPlan ?? null, maxUses ?? null, expiresAt ?? null, couponId]
    );
    await logActivity(client, schema, {
      userId: authResult.userId,
      action: "admin.coupon.update",
      detail: { couponId },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "toggle") {
    const { couponId, active } = body;
    if (!couponId) return NextResponse.json({ error: "couponId verplicht." }, { status: 400 });
    await toggleCouponActive(client, schema, couponId, active);
    await logActivity(client, schema, {
      userId: authResult.userId,
      action: active ? "admin.coupon.activate" : "admin.coupon.deactivate",
      detail: { couponId },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "delete") {
    const { couponId } = body;
    if (!couponId) return NextResponse.json({ error: "couponId verplicht." }, { status: 400 });
    await deleteCoupon(client, schema, couponId);
    await logActivity(client, schema, {
      userId: authResult.userId,
      action: "admin.coupon.delete",
      detail: { couponId },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Onbekende actie." }, { status: 400 });
}
