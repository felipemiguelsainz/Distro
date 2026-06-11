import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { env } from "@/lib/supabase/env";

let _client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!env.anthropic.apiKey) {
    throw new Error("[distro] Falta ANTHROPIC_API_KEY");
  }
  if (!_client) {
    _client = new Anthropic({ apiKey: env.anthropic.apiKey });
  }
  return _client;
}

export const MODEL = env.anthropic.model; // p.ej. claude-opus-4-8
