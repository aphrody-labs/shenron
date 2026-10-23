import type { Database } from "bun:sqlite";
import type {
  Guild,
  GuildMember,
  NonThreadGuildBasedChannel,
  PartialGuildMember,
  Role,
} from "discord.js";
import { inject, singleton } from "tsyringe";
import { DatabaseService } from "~/db/index";
import { isGatewayRateLimit } from "~/lib/guild-members";
import { logger } from "~/lib/logger";

/**
 * SQLite mirror of the production guild: channels, roles and members
 * (`discord_channels`, `discord_roles`, `discord_members`, migration 0022).
 *
 * The gateway cache disappears at every restart and never covers former
 * members; the mirror keeps who is on the server, since when, with which
 * roles, so restores, audits and the API can read it without a REST sweep.
 * A full sync upserts everything the guild returns and marks the rest as gone
 * (`present = 0` / `deleted_at`); gateway events keep it current in between.
 */

export type MemberRow = {
  user_id: string;
  username: string;
  global_name: string | null;
  nickname: string | null;
  avatar_hash: string | null;
  guild_avatar_hash: string | null;
  bot: number;
  joined_at: number | null;
  premium_since: number | null;
  timeout_until: number | null;
  pending: number;
  role_ids: string;
  top_role_id: string | null;
};

export type RoleRow = {
  id: string;
  name: string;
  color: number;
  position: number;
  hoist: number;
  managed: number;
  mentionable: number;
  permissions: string;
  icon: string | null;
  unicode_emoji: string | null;
  member_count: number;
};

export type ChannelRow = {
  id: string;
  name: string;
  type: number;
  parent_id: string | null;
  position: number;
  topic: string | null;
  nsfw: number;
  rate_limit: number;
};

export type SyncReport = {
  members: number;
  membersLeft: number;
  roles: number;
  rolesDeleted: number;
  channels: number;
  channelsDeleted: number;
  /**
   * False when the member list could not be fetched (gateway rate limit) and the cache was
   * partial: members are upserted but nobody is marked as gone.
   */
  membersComplete: boolean;
  durationMs: number;
};

const flag = (v: unknown) => (v ? 1 : 0);

export function memberRow(m: GuildMember, guildId: string): MemberRow {
  const roleIds = [...m.roles.cache.keys()].filter((id) => id !== guildId);
  const top = m.roles.highest;
  return {
    user_id: m.id,
    username: m.user.username,
    global_name: m.user.globalName ?? null,
    nickname: m.nickname ?? null,
    avatar_hash: m.user.avatar ?? null,
    guild_avatar_hash: m.avatar ?? null,
    bot: flag(m.user.bot),
    joined_at: m.joinedTimestamp ?? null,
    premium_since: m.premiumSinceTimestamp ?? null,
    timeout_until: m.communicationDisabledUntilTimestamp ?? null,
    pending: flag(m.pending),
    role_ids: JSON.stringify(roleIds),
    top_role_id: top && top.id !== guildId ? top.id : null,
  };
}

export function roleRow(r: Role): RoleRow {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    position: r.position,
    hoist: flag(r.hoist),
    managed: flag(r.managed),
    mentionable: flag(r.mentionable),
    permissions: r.permissions.bitfield.toString(),
    icon: r.icon ?? null,
    unicode_emoji: r.unicodeEmoji ?? null,
    member_count: r.members.size,
  };
}

export function channelRow(c: NonThreadGuildBasedChannel): ChannelRow {
  const anyC = c as NonThreadGuildBasedChannel & {
    topic?: string | null;
    nsfw?: boolean;
    rateLimitPerUser?: number;
  };
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    parent_id: c.parentId ?? null,
    position: "rawPosition" in c ? c.rawPosition : 0,
    topic: anyC.topic ?? null,
    nsfw: flag(anyC.nsfw),
    rate_limit: anyC.rateLimitPerUser ?? 0,
  };
}

/** Raw-SQL store, independent of discord.js so it can be tested in memory. */
export class GuildMirrorStore {
  constructor(private readonly db: Database) {}

  upsertMembers(rows: MemberRow[], now = Date.now()) {
    const stmt = this.db.query(
      `INSERT INTO discord_members (user_id, username, global_name, nickname, avatar_hash,
         guild_avatar_hash, bot, joined_at, premium_since, timeout_until, pending, role_ids,
         top_role_id, present, left_at, synced_at)
       VALUES ($user_id, $username, $global_name, $nickname, $avatar_hash, $guild_avatar_hash,
         $bot, $joined_at, $premium_since, $timeout_until, $pending, $role_ids, $top_role_id,
         1, NULL, $now)
       ON CONFLICT(user_id) DO UPDATE SET
         username = excluded.username, global_name = excluded.global_name,
         nickname = excluded.nickname, avatar_hash = excluded.avatar_hash,
         guild_avatar_hash = excluded.guild_avatar_hash, bot = excluded.bot,
         joined_at = excluded.joined_at, premium_since = excluded.premium_since,
         timeout_until = excluded.timeout_until, pending = excluded.pending,
         role_ids = excluded.role_ids, top_role_id = excluded.top_role_id,
         present = 1, left_at = NULL, synced_at = excluded.synced_at`,
    );
    this.db.transaction(() => {
      for (const r of rows) stmt.run(prefixed({ ...r, now }));
    })();
  }

  markMemberLeft(userId: string, now = Date.now()) {
    this.db
      .query(
        "UPDATE discord_members SET present = 0, left_at = COALESCE(left_at, ?2), synced_at = ?2 WHERE user_id = ?1",
      )
      .run(userId, now);
  }

  upsertRoles(rows: RoleRow[], now = Date.now()) {
    const stmt = this.db.query(
      `INSERT INTO discord_roles (id, name, color, position, hoist, managed, mentionable,
         permissions, icon, unicode_emoji, member_count, deleted_at, synced_at)
       VALUES ($id, $name, $color, $position, $hoist, $managed, $mentionable, $permissions,
         $icon, $unicode_emoji, $member_count, NULL, $now)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, color = excluded.color, position = excluded.position,
         hoist = excluded.hoist, managed = excluded.managed, mentionable = excluded.mentionable,
         permissions = excluded.permissions, icon = excluded.icon,
         unicode_emoji = excluded.unicode_emoji, member_count = excluded.member_count,
         deleted_at = NULL, synced_at = excluded.synced_at`,
    );
    this.db.transaction(() => {
      for (const r of rows) stmt.run(prefixed({ ...r, now }));
    })();
  }

  markRoleDeleted(id: string, now = Date.now()) {
    this.db
      .query(
        "UPDATE discord_roles SET deleted_at = COALESCE(deleted_at, ?2), synced_at = ?2 WHERE id = ?1",
      )
      .run(id, now);
  }

  upsertChannels(rows: ChannelRow[], now = Date.now()) {
    const stmt = this.db.query(
      `INSERT INTO discord_channels (id, name, type, parent_id, position, topic, nsfw,
         rate_limit, deleted_at, synced_at)
       VALUES ($id, $name, $type, $parent_id, $position, $topic, $nsfw, $rate_limit, NULL, $now)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, type = excluded.type, parent_id = excluded.parent_id,
         position = excluded.position, topic = excluded.topic, nsfw = excluded.nsfw,
         rate_limit = excluded.rate_limit, deleted_at = NULL, synced_at = excluded.synced_at`,
    );
    this.db.transaction(() => {
      for (const r of rows) stmt.run(prefixed({ ...r, now }));
    })();
  }

  markChannelDeleted(id: string, now = Date.now()) {
    this.db
      .query(
        "UPDATE discord_channels SET deleted_at = COALESCE(deleted_at, ?2), synced_at = ?2 WHERE id = ?1",
      )
      .run(id, now);
  }

  /**
   * Full sync: everything absent from the snapshot is marked gone, never deleted.
   * With `membersComplete: false` (partial member list) members are only upserted:
   * absence from an incomplete list proves nothing.
   */
  replaceAll(
    snapshot: { members: MemberRow[]; roles: RoleRow[]; channels: ChannelRow[] },
    { membersComplete = true }: { membersComplete?: boolean } = {},
  ) {
    const now = Date.now();
    this.upsertRoles(snapshot.roles, now);
    this.upsertChannels(snapshot.channels, now);
    this.upsertMembers(snapshot.members, now);
    const gone = (table: string, column: string, set: string) =>
      this.db.query(`UPDATE ${table} SET ${set} WHERE synced_at < ?1 AND ${column}`).run(now)
        .changes;
    return {
      membersLeft: membersComplete
        ? gone("discord_members", "present = 1", "present = 0, left_at = ?1, synced_at = ?1")
        : 0,
      rolesDeleted: gone("discord_roles", "deleted_at IS NULL", "deleted_at = ?1, synced_at = ?1"),
      channelsDeleted: gone(
        "discord_channels",
        "deleted_at IS NULL",
        "deleted_at = ?1, synced_at = ?1",
      ),
    };
  }

  stats() {
    const one = (sql: string) => (this.db.query(sql).get() as { n: number }).n;
    return {
      membersPresent: one("SELECT COUNT(*) n FROM discord_members WHERE present = 1"),
      membersLeft: one("SELECT COUNT(*) n FROM discord_members WHERE present = 0"),
      bots: one("SELECT COUNT(*) n FROM discord_members WHERE present = 1 AND bot = 1"),
      boosters: one(
        "SELECT COUNT(*) n FROM discord_members WHERE present = 1 AND premium_since IS NOT NULL",
      ),
      roles: one("SELECT COUNT(*) n FROM discord_roles WHERE deleted_at IS NULL"),
      channels: one("SELECT COUNT(*) n FROM discord_channels WHERE deleted_at IS NULL"),
      lastSyncAt:
        (
          this.db.query("SELECT MAX(synced_at) n FROM discord_members").get() as {
            n: number | null;
          }
        ).n ?? null,
    };
  }

  findMembers(query: string, limit = 25) {
    const like = `%${query.replace(/[%_]/g, "")}%`;
    return this.db
      .query(
        `SELECT * FROM discord_members
         WHERE user_id = ?1 OR username LIKE ?2 OR global_name LIKE ?2 OR nickname LIKE ?2
         ORDER BY present DESC, joined_at ASC LIMIT ?3`,
      )
      .all(query, like, Math.min(Math.max(limit, 1), 100));
  }
}

function prefixed(row: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [`$${k}`, v])) as Record<
    string,
    string | number | null
  >;
}

@singleton()
export class GuildMirrorService {
  readonly store: GuildMirrorStore;
  private running: Promise<SyncReport> | null = null;

  constructor(@inject(DatabaseService) dbs: DatabaseService) {
    this.store = new GuildMirrorStore(dbs.sqlite);
  }

  /** Full sync of a guild; concurrent calls share the run in progress. */
  syncGuild(guild: Guild): Promise<SyncReport> {
    this.running ??= this.runSync(guild).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  /**
   * Every member of the guild, or what the cache holds when Discord refuses the request.
   * A gateway rate limit must never fail the sync (the next cycle completes it), but a
   * partial list must not mark anyone as gone, hence `complete`.
   */
  private async loadMembers(guild: Guild): Promise<{ members: GuildMember[]; complete: boolean }> {
    try {
      return { members: [...(await guild.members.fetch()).values()], complete: true };
    } catch (err) {
      if (!isGatewayRateLimit(err)) throw err;
      const cache = guild.members.cache;
      const complete = guild.memberCount > 0 && cache.size >= guild.memberCount;
      logger.warn(
        { err, cached: cache.size, memberCount: guild.memberCount, complete },
        "[GUILD MIRROR] member fetch rate limited, syncing from the member cache",
      );
      return { members: [...cache.values()], complete };
    }
  }

  private async runSync(guild: Guild): Promise<SyncReport> {
    const started = Date.now();
    const [{ members, complete }, roles, channels] = await Promise.all([
      this.loadMembers(guild),
      guild.roles.fetch(),
      guild.channels.fetch(),
    ]);
    const snapshot = {
      members: members.map((m) => memberRow(m, guild.id)),
      roles: [...roles.values()].filter((r) => r.id !== guild.id).map(roleRow),
      channels: [...channels.values()]
        .filter((c): c is NonThreadGuildBasedChannel => c !== null)
        .map(channelRow),
    };
    const gone = this.store.replaceAll(snapshot, { membersComplete: complete });
    const report: SyncReport = {
      members: snapshot.members.length,
      roles: snapshot.roles.length,
      channels: snapshot.channels.length,
      ...gone,
      membersComplete: complete,
      durationMs: Date.now() - started,
    };
    logger.info(report, "[GUILD MIRROR] full sync done");
    return report;
  }

  recordMember(m: GuildMember) {
    this.store.upsertMembers([memberRow(m, m.guild.id)]);
  }

  recordMemberLeft(m: GuildMember | PartialGuildMember) {
    this.store.markMemberLeft(m.id);
  }

  recordRole(r: Role) {
    if (r.id === r.guild.id) return;
    this.store.upsertRoles([roleRow(r)]);
  }

  recordChannel(c: NonThreadGuildBasedChannel) {
    this.store.upsertChannels([channelRow(c)]);
  }
}
