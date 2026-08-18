import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Fallback base URL used to build absolute avatar URLs for Discord webhooks. */
const DEFAULT_PUBLIC_URL = "http://localhost:3001";

export interface DiscordConfig {
  /** Master switch. When false the Discord bridge is fully inert. */
  enabled: boolean;
  /** Bot token used to connect to the Discord gateway (receiving messages). */
  botToken: string;
  /** Snowflake of the channel whose messages are bridged. */
  channelId: string;
  /** Webhook URL of that channel, used to post hikkichat messages as their author. */
  webhookUrl: string;
}

export interface AppConfig {
  /** Public base URL of the app, used to build avatar URLs Discord can reach. */
  publicUrl: string;
  discord: DiscordConfig;
}

const DEFAULT_CONFIG: AppConfig = {
  publicUrl: DEFAULT_PUBLIC_URL,
  discord: {
    enabled: false,
    botToken: "",
    channelId: "",
    webhookUrl: "",
  },
};

let cached: AppConfig | null = null;

/** Path to the JSON config file. Override with CONFIG_PATH env for non-default layouts. */
export function getConfigPath(): string {
  return process.env.CONFIG_PATH ?? path.join(__dirname, "..", "data", "config.json");
}

/**
 * Load the config from disk. A missing or malformed file falls back to the
 * defaults (bridge disabled), so the server always boots cleanly.
 */
export function loadConfig(): AppConfig {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_CONFIG, discord: { ...DEFAULT_CONFIG.discord } };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf8")) as Record<string, unknown>;
    const discord = (raw.discord ?? {}) as Record<string, unknown>;
    return {
      publicUrl:
        typeof raw.publicUrl === "string" && raw.publicUrl.trim()
          ? raw.publicUrl.trim()
          : DEFAULT_PUBLIC_URL,
      discord: {
        enabled: discord.enabled === true,
        botToken: typeof discord.botToken === "string" ? discord.botToken : "",
        channelId: typeof discord.channelId === "string" ? discord.channelId : "",
        webhookUrl: typeof discord.webhookUrl === "string" ? discord.webhookUrl : "",
      },
    };
  } catch (err) {
    console.error(`[config] failed to parse ${configPath}, using defaults:`, err);
    return { ...DEFAULT_CONFIG, discord: { ...DEFAULT_CONFIG.discord } };
  }
}

/** Memoized accessor used by the rest of the server. */
export function getConfig(): AppConfig {
  if (!cached) cached = loadConfig();
  return cached;
}
