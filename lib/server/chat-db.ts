import type { PgClient } from "@storage";

export interface ChatMessage {
  id: string;
  kroegentochtId: string;
  channelKey: string;
  senderType: "admin" | "supervisor";
  senderId: string;
  senderName: string;
  content: string;
  isBroadcast: boolean;
  createdAt: string;
}

export interface ChatChannelInfo {
  channelKey: string;
  channelType: "group" | "direct";
  label: string;
  participantName?: string;
  lastMessage?: ChatMessage;
  unreadCount: number;
}

export interface SendMessageInput {
  kroegentochtId: string;
  channelKey: string;
  senderType: "admin" | "supervisor";
  senderId: string;
  senderName: string;
  content: string;
  isBroadcast?: boolean;
}

export function buildParticipantKey(type: "admin" | "supervisor", id: string): string {
  return `${type === "admin" ? "admin" : "sv"}:${id}`;
}

export function buildDirectChannelKey(a: string, b: string): string {
  const sorted = [a, b].sort();
  return `dm:${sorted[0]}+${sorted[1]}`;
}

function canAccessChannel(channelKey: string, participantKey: string): boolean {
  if (channelKey === "group") return true;
  if (channelKey.startsWith("dm:")) return channelKey.includes(participantKey);
  return false;
}

export { canAccessChannel };

function mapRow(r: {
  id: string; kroegentocht_id: string; channel_key: string;
  sender_type: string; sender_id: string; sender_name: string;
  content: string; is_broadcast: boolean; created_at: string;
}): ChatMessage {
  return {
    id: r.id,
    kroegentochtId: r.kroegentocht_id,
    channelKey: r.channel_key,
    senderType: r.sender_type as ChatMessage["senderType"],
    senderId: r.sender_id,
    senderName: r.sender_name,
    content: r.content,
    isBroadcast: r.is_broadcast,
    createdAt: r.created_at,
  };
}

export async function sendMessage(
  client: PgClient,
  schema: string,
  input: SendMessageInput
): Promise<ChatMessage> {
  const result = await client.query<{
    id: string; kroegentocht_id: string; channel_key: string;
    sender_type: string; sender_id: string; sender_name: string;
    content: string; is_broadcast: boolean; created_at: string;
  }>(
    `INSERT INTO ${schema}.kroegentocht_chat_messages
       (kroegentocht_id, channel_key, sender_type, sender_id, sender_name, content, is_broadcast)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *;`,
    [
      input.kroegentochtId,
      input.channelKey,
      input.senderType,
      input.senderId,
      input.senderName,
      input.content,
      input.isBroadcast ?? false,
    ]
  );
  return mapRow(result.rows[0]);
}

export async function getMessages(
  client: PgClient,
  schema: string,
  kroegentochtId: string,
  channelKey: string,
  since?: string,
  limit = 50
): Promise<ChatMessage[]> {
  if (since) {
    const result = await client.query<{
      id: string; kroegentocht_id: string; channel_key: string;
      sender_type: string; sender_id: string; sender_name: string;
      content: string; is_broadcast: boolean; created_at: string;
    }>(
      `SELECT * FROM ${schema}.kroegentocht_chat_messages
       WHERE kroegentocht_id = $1 AND channel_key = $2 AND created_at > $3
       ORDER BY created_at ASC LIMIT $4;`,
      [kroegentochtId, channelKey, since, limit]
    );
    return result.rows.map(mapRow);
  }
  const result = await client.query<{
    id: string; kroegentocht_id: string; channel_key: string;
    sender_type: string; sender_id: string; sender_name: string;
    content: string; is_broadcast: boolean; created_at: string;
  }>(
    `SELECT * FROM (
       SELECT * FROM ${schema}.kroegentocht_chat_messages
       WHERE kroegentocht_id = $1 AND channel_key = $2
       ORDER BY created_at DESC LIMIT $3
     ) sub ORDER BY created_at ASC;`,
    [kroegentochtId, channelKey, limit]
  );
  return result.rows.map(mapRow);
}

export async function getBroadcasts(
  client: PgClient,
  schema: string,
  kroegentochtId: string,
  since?: string
): Promise<ChatMessage[]> {
  const params: (string | number)[] = [kroegentochtId];
  let whereExtra = "";
  if (since) {
    whereExtra = " AND created_at > $2";
    params.push(since);
  }
  const result = await client.query<{
    id: string; kroegentocht_id: string; channel_key: string;
    sender_type: string; sender_id: string; sender_name: string;
    content: string; is_broadcast: boolean; created_at: string;
  }>(
    `SELECT * FROM ${schema}.kroegentocht_chat_messages
     WHERE kroegentocht_id = $1 AND is_broadcast = TRUE${whereExtra}
     ORDER BY created_at DESC LIMIT 10;`,
    params
  );
  return result.rows.map(mapRow);
}

export async function getChannelsForParticipant(
  client: PgClient,
  schema: string,
  kroegentochtId: string,
  participantKey: string
): Promise<ChatChannelInfo[]> {
  const result = await client.query<{
    channel_key: string;
    last_created_at: string;
    msg_count: string;
  }>(
    `SELECT channel_key, MAX(created_at) as last_created_at, COUNT(*) as msg_count
     FROM ${schema}.kroegentocht_chat_messages
     WHERE kroegentocht_id = $1
       AND (channel_key = 'group' OR channel_key LIKE '%' || $2 || '%')
     GROUP BY channel_key
     ORDER BY last_created_at DESC;`,
    [kroegentochtId, participantKey]
  );

  const unreadCounts = await getUnreadCounts(client, schema, kroegentochtId, participantKey);

  const channels: ChatChannelInfo[] = [];

  for (const row of result.rows) {
    const lastMsg = await client.query<{
      id: string; kroegentocht_id: string; channel_key: string;
      sender_type: string; sender_id: string; sender_name: string;
      content: string; is_broadcast: boolean; created_at: string;
    }>(
      `SELECT * FROM ${schema}.kroegentocht_chat_messages
       WHERE kroegentocht_id = $1 AND channel_key = $2
       ORDER BY created_at DESC LIMIT 1;`,
      [kroegentochtId, row.channel_key]
    );

    const isGroup = row.channel_key === "group";
    let label = "Groepschat";
    let participantName: string | undefined;

    if (!isGroup && row.channel_key.startsWith("dm:")) {
      const parts = row.channel_key.replace("dm:", "").split("+");
      const otherKey = parts.find((p) => p !== participantKey) ?? parts[0];
      participantName = otherKey;
      label = otherKey;
    }

    channels.push({
      channelKey: row.channel_key,
      channelType: isGroup ? "group" : "direct",
      label,
      participantName,
      lastMessage: lastMsg.rows[0] ? mapRow(lastMsg.rows[0]) : undefined,
      unreadCount: unreadCounts[row.channel_key] ?? 0,
    });
  }

  const hasGroup = channels.some((c) => c.channelKey === "group");
  if (!hasGroup) {
    channels.unshift({
      channelKey: "group",
      channelType: "group",
      label: "Groepschat",
      unreadCount: 0,
    });
  }

  return channels;
}

export async function getUnreadCounts(
  client: PgClient,
  schema: string,
  kroegentochtId: string,
  participantKey: string
): Promise<Record<string, number>> {
  const result = await client.query<{
    channel_key: string;
    unread: string;
  }>(
    `SELECT m.channel_key, COUNT(*) as unread
     FROM ${schema}.kroegentocht_chat_messages m
     LEFT JOIN ${schema}.kroegentocht_chat_read_status r
       ON r.kroegentocht_id = m.kroegentocht_id
       AND r.channel_key = m.channel_key
       AND r.participant_key = $2
     WHERE m.kroegentocht_id = $1
       AND (m.channel_key = 'group' OR m.channel_key LIKE '%' || $2 || '%')
       AND m.created_at > COALESCE(r.last_read_at, '1970-01-01'::timestamptz)
     GROUP BY m.channel_key;`,
    [kroegentochtId, participantKey]
  );

  const counts: Record<string, number> = {};
  for (const row of result.rows) {
    counts[row.channel_key] = parseInt(row.unread, 10);
  }
  return counts;
}

export async function markChannelRead(
  client: PgClient,
  schema: string,
  kroegentochtId: string,
  channelKey: string,
  participantKey: string
): Promise<void> {
  await client.query(
    `INSERT INTO ${schema}.kroegentocht_chat_read_status (kroegentocht_id, channel_key, participant_key, last_read_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (kroegentocht_id, channel_key, participant_key)
     DO UPDATE SET last_read_at = NOW();`,
    [kroegentochtId, channelKey, participantKey]
  );
}
