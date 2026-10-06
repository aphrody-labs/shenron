// SPDX-License-Identifier: Apache-2.0
/**
 * Agent homes of the Discord users who write to the bot in DM, in the cloud: one
 * `discord:<user_id>` instance of the public template (`@shenron/db/agent-homes`), stored in
 * PostgreSQL `chat.agent_homes` beside the conversation store (migration 0020 of the site),
 * else, without PostgreSQL, as native directories beside the bot's database
 * (`<dir of DATABASE_PATH>/agents/`). Created at the first DM, personalised with the Discord
 * name and avatar; never overwritten afterwards (the user's edits win, last-writer-wins on
 * `updatedAt` when the desktop copy of the same user converges).
 */
import { dirname, join } from "node:path";
import { inject, singleton } from "tsyringe";
import {
  type AgentHomeSnapshot,
  type AgentHomeStore,
  agentHomeId,
  DirAgentHomeStore,
  ensureAgentHome,
  LOCAL_AGENT_ID,
  PgAgentHomeStore,
  SHENRON_AGENT_TEMPLATE,
} from "@shenron/db/agent-homes";
import { PgService } from "~/db/pg";
import { env } from "~/lib/env";
import { logger } from "~/lib/logger";

/** What the bot knows of a Discord user when they write in DM. */
export interface DiscordAuthor {
  id: string;
  username: string;
  globalName?: string | null;
  avatarUrl?: string | null;
  /** Discord locale when known (interactions); a DM message carries none. */
  locale?: string | null;
}

/** Store of the bot: PostgreSQL when configured, else directories beside its database. */
export function botAgentHomeStore(
  pg: PgService,
  databasePath: string = env.DATABASE_PATH,
): AgentHomeStore {
  const handle = pg.get();
  return handle
    ? new PgAgentHomeStore(handle.sql)
    : new DirAgentHomeStore(join(dirname(databasePath), "agents"));
}

@singleton()
export class AgentHomeService {
  private store: AgentHomeStore | null = null;
  /** Users whose home this process already ensured (one store read per user per process). */
  private readonly known = new Map<string, AgentHomeSnapshot>();

  constructor(@inject(PgService) private readonly pg: PgService) {}

  /** Explicit store (tests, scripts). */
  static withStore(store: AgentHomeStore): AgentHomeService {
    const service = new AgentHomeService(PgService.withEnv({}));
    service.store = store;
    return service;
  }

  /** The user's home, created from the template at their first DM; `null` when unavailable. */
  async forDiscordUser(author: DiscordAuthor): Promise<AgentHomeSnapshot | null> {
    const agentId = agentHomeId(author.id);
    if (agentId === LOCAL_AGENT_ID) return null;
    const cached = this.known.get(agentId);
    if (cached) return cached;
    try {
      this.store ??= botAgentHomeStore(this.pg);
      const { home, created } = await ensureAgentHome(this.store, SHENRON_AGENT_TEMPLATE, {
        agentId,
        name: author.globalName ?? author.username,
        language: author.locale ?? null,
        avatarUrl: author.avatarUrl ?? null,
      });
      if (created) logger.info(`[agent-home] home created for ${agentId}`);
      if (this.known.size > 10_000) this.known.clear();
      this.known.set(agentId, home);
      return home;
    } catch (error) {
      // Typically the migration 0020 not applied yet: the DM relay goes on without a home.
      logger.warn(
        { err: error instanceof Error ? error.message : String(error) },
        "[agent-home] cloud agent home unavailable",
      );
      return null;
    }
  }
}
