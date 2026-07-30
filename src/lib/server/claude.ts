import Anthropic from '@anthropic-ai/sdk';
import { env } from '$env/dynamic/private';
import { DEFAULT_CLAUDE_MODEL } from '$lib/config';

/** Server-only Anthropic-client. Nooit in client-code importeren ($lib/server). */
// maxRetries hoger dan de default (2): tijdens overbelasting (429/529) probeert de SDK
// automatisch opnieuw met exponentiële backoff.
export const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 4 });

/** Actief model; overschrijfbaar via ANTHROPIC_MODEL env var. */
export const CLAUDE_MODEL = env.ANTHROPIC_MODEL || DEFAULT_CLAUDE_MODEL;

export interface ClaudeJSONResultaat<T> {
	data: T;
	model: string;
	prompt: string;
	response: string;
	tokensInput: number;
	tokensOutput: number;
	duurMs: number;
}

/** Denk-effort voor de generaties; hoger = grondiger maar langzamer. */
export type ClaudeEffort = 'low' | 'medium' | 'high' | 'max';

/**
 * Roept Claude aan met structured outputs (gegarandeerd valide JSON volgens schema)
 * en geeft het resultaat + metadata terug voor ai_logs.
 *
 * Adaptive thinking staat aan: het model bepaalt zelf hoeveel het nadenkt (gestuurd
 * door `effort`). De denk-tokens tellen mee in max_tokens, vandaar de ruime default.
 */
export async function claudeJSON<T>(
	system: string,
	prompt: string | Anthropic.Messages.ContentBlockParam[],
	schema: object,
	maxTokens = 16000,
	effort: ClaudeEffort = 'high'
): Promise<ClaudeJSONResultaat<T>> {
	const start = Date.now();
	// Voor de ai_logs: bij content-blokken (document/afbeelding) alleen de tekstdelen loggen.
	const promptVoorLog =
		typeof prompt === 'string'
			? prompt
			: prompt.map((b) => (b.type === 'text' ? b.text : `[${b.type}]`)).join('\n');
	let response: Anthropic.Messages.Message;
	try {
		response = await anthropic.messages.create({
			model: CLAUDE_MODEL,
			max_tokens: maxTokens,
			thinking: { type: 'adaptive' },
			system,
			messages: [{ role: 'user', content: prompt }],
			output_config: { effort, format: { type: 'json_schema', schema } }
		} as Anthropic.Messages.MessageCreateParamsNonStreaming);
	} catch (e) {
		const status = (e as { status?: number })?.status;
		// 429 = rate limit, 529 = overbelast, 5xx = tijdelijke serverfout. Na de SDK-retries
		// nog steeds mis → nette, begrijpelijke melding i.p.v. ruwe API-JSON.
		if (status === 429 || status === 529 || (typeof status === 'number' && status >= 500)) {
			throw new Error(
				'Claude is momenteel overbelast (tijdelijk). Wacht ~30 seconden en probeer het opnieuw.'
			);
		}
		throw e;
	}

	const duurMs = Date.now() - start;
	const tekst = response.content
		.filter((b): b is Anthropic.TextBlock => b.type === 'text')
		.map((b) => b.text)
		.join('');

	let data: T;
	try {
		data = JSON.parse(tekst) as T;
	} catch {
		throw new Error('Claude gaf geen valide JSON terug.');
	}

	return {
		data,
		model: response.model,
		prompt: promptVoorLog,
		response: tekst,
		tokensInput: response.usage.input_tokens,
		tokensOutput: response.usage.output_tokens,
		duurMs
	};
}
