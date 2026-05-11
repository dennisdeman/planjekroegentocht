import type { PgClient } from "@storage";
import webpush from "web-push";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    "mailto:support@planjekroegentocht.nl",
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
}

export interface PushSubscriptionInput {
  kroegentochtId: string;
  participantKey: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function savePushSubscription(
  client: PgClient,
  schema: string,
  input: PushSubscriptionInput
): Promise<void> {
  await client.query(
    `INSERT INTO ${schema}.push_subscriptions (kroegentocht_id, participant_key, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (kroegentocht_id, participant_key, endpoint) DO UPDATE
       SET p256dh = $4, auth = $5;`,
    [input.kroegentochtId, input.participantKey, input.endpoint, input.p256dh, input.auth]
  );
}

export async function removePushSubscription(
  client: PgClient,
  schema: string,
  kroegentochtId: string,
  participantKey: string,
  endpoint: string
): Promise<void> {
  await client.query(
    `DELETE FROM ${schema}.push_subscriptions
     WHERE kroegentocht_id = $1 AND participant_key = $2 AND endpoint = $3;`,
    [kroegentochtId, participantKey, endpoint]
  );
}

interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
  id: string;
}

export async function sendPushToChannel(
  client: PgClient,
  schema: string,
  kroegentochtId: string,
  channelKey: string,
  senderParticipantKey: string,
  payload: { title: string; body: string; url?: string; tag?: string }
): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

  let whereClause: string;
  const params: string[] = [kroegentochtId, senderParticipantKey];

  if (channelKey === "group") {
    // Groepschat: alle subscribers voor deze kroegentocht, behalve afzender
    whereClause = `kroegentocht_id = $1 AND participant_key != $2`;
  } else if (channelKey.startsWith("dm:")) {
    // DM: alleen de andere deelnemer
    const parts = channelKey.replace("dm:", "").split("+");
    const otherKey = parts.find((p) => p !== senderParticipantKey) ?? parts[0];
    whereClause = `kroegentocht_id = $1 AND participant_key = $3`;
    params.push(otherKey);
  } else {
    return;
  }

  const result = await client.query<{ id: string; endpoint: string; p256dh: string; auth: string }>(
    `SELECT id, endpoint, p256dh, auth FROM ${schema}.push_subscriptions WHERE ${whereClause};`,
    params
  );

  const jsonPayload = JSON.stringify(payload);

  for (const sub of result.rows) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        jsonPayload
      );
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if (statusCode === 410 || statusCode === 404) {
        // Subscription verlopen — verwijderen
        await client.query(
          `DELETE FROM ${schema}.push_subscriptions WHERE id = $1;`,
          [sub.id]
        );
      }
    }
  }
}

export async function sendBroadcastPush(
  client: PgClient,
  schema: string,
  kroegentochtId: string,
  senderParticipantKey: string,
  payload: { title: string; body: string; url?: string; tag?: string }
): Promise<void> {
  return sendPushToChannel(client, schema, kroegentochtId, "group", senderParticipantKey, payload);
}
