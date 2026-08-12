import { env } from '$env/dynamic/private';
import type Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_CLAUDE_MODEL } from '$lib/config';

/**
 * Alle AI-calls lopen via de Online Klik usage-proxy (niet meer rechtstreeks naar Anthropic).
 * Contract:
 *   POST {PROXY_URL}
 *   header: X-API-Usage-Key: <API_USAGE_KEY>   (SECRET → alleen via env, nooit in code)
 *   body:   { connection_id, payload: { system, messages, max_tokens } }
 *   → { output: string, usage: { input_tokens, output_tokens } }
 *
 * De proxy ondersteunt GEEN output_config (json_schema) of thinking; JSON dwingen we
 * af via de system-prompt + een robuuste parser.
 */
const PROXY_URL = env.API_USAGE_URL || 'https://api-usage.onlineklik.dev/api/v1/proxy';
const PROXY_KEY = env.API_USAGE_KEY || '';
// connection_id is niet geheim (staat in de UI); env-overschrijfbaar met de huidige als default.
const CONNECTION_ID = env.API_USAGE_CONNECTION_ID || 'ce36da4e-4795-408b-86db-0b625553b7cf';

/** Actief model (label; de connectie bepaalt het echte model). */
export const CLAUDE_MODEL = env.ANTHROPIC_MODEL || DEFAULT_CLAUDE_MODEL;

/** Behouden voor signatuur-compatibiliteit; de proxy negeert effort. */
export type ClaudeEffort = 'low' | 'medium' | 'high' | 'max';

export interface ClaudeJSONResultaat<T> {
	data: T;
	model: string;
	prompt: string;
	response: string;
	tokensInput: number;
	tokensOutput: number;
	duurMs: number;
}

interface ProxyRespons {
	output?: string;
	usage?: { input_tokens?: number; output_tokens?: number };
	error?: string;
	message?: string;
}

function wacht(poging: number) {
	return new Promise((r) => setTimeout(r, Math.min(2 ** poging * 1000 + Math.random() * 400, 12000)));
}

/** Haalt valide JSON uit de output (strip codeblok-fences; val terug op eerste {…}/[…]). */
function parseJSON<T>(tekst: string): T {
	let t = tekst.trim();
	const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fence) t = fence[1].trim();
	try {
		return JSON.parse(t) as T;
	} catch {
		// door naar substring-extractie
	}
	const kandidaten: Array<[number, number]> = [
		[t.indexOf('{'), t.lastIndexOf('}')],
		[t.indexOf('['), t.lastIndexOf(']')]
	];
	for (const [s, e] of kandidaten) {
		if (s >= 0 && e > s) {
			try {
				return JSON.parse(t.slice(s, e + 1)) as T;
			} catch {
				// volgende kandidaat
			}
		}
	}
	throw new Error('Claude gaf geen valide JSON terug.');
}

async function proxyCall(
	system: string,
	content: string | Anthropic.Messages.ContentBlockParam[],
	maxTokens: number
): Promise<ProxyRespons> {
	const body = JSON.stringify({
		connection_id: CONNECTION_ID,
		payload: { system, messages: [{ role: 'user', content }], max_tokens: maxTokens }
	});

	const maxPogingen = 4;
	let laatste: unknown;
	for (let poging = 0; poging <= maxPogingen; poging++) {
		let res: Response;
		try {
			res = await fetch(PROXY_URL, {
				method: 'POST',
				headers: { 'content-type': 'application/json', 'X-API-Usage-Key': PROXY_KEY },
				body
			});
		} catch (e) {
			laatste = e;
			if (poging === maxPogingen) throw e;
			await wacht(poging);
			continue;
		}
		if (res.ok) return (await res.json().catch(() => ({}))) as ProxyRespons;

		const status = res.status;
		if ((status === 429 || status >= 500) && poging < maxPogingen) {
			await wacht(poging);
			continue;
		}
		const tekst = await res.text().catch(() => '');
		if (status === 429 || status >= 500) {
			throw new Error('De AI-dienst is tijdelijk overbelast. Wacht ~30 seconden en probeer opnieuw.');
		}
		throw new Error(`AI-proxy fout (${status}): ${tekst.slice(0, 300)}`);
	}
	throw laatste ?? new Error('AI-proxy call mislukt');
}

/**
 * Roept het model (via de proxy) aan en geeft gegarandeerd geparste JSON + metadata terug.
 * De `_schema`-parameter blijft voor compatibiliteit; de proxy dwingt geen schema af.
 */
export async function claudeJSON<T>(
	system: string,
	prompt: string | Anthropic.Messages.ContentBlockParam[],
	_schema: object,
	maxTokens = 16000,
	_effort: ClaudeEffort = 'high'
): Promise<ClaudeJSONResultaat<T>> {
	const systemJSON = `${system}\n\nBELANGRIJK: antwoord met UITSLUITEND valide JSON die exact voldoet aan het gevraagde formaat — geen markdown, geen codeblok-fences (\`\`\`), geen tekst eromheen.`;
	const start = Date.now();
	const res = await proxyCall(systemJSON, prompt, maxTokens);
	const duurMs = Date.now() - start;

	const tekst = res.output ?? '';
	if (!tekst) {
		throw new Error(res.error || res.message || 'Lege respons van de AI-proxy.');
	}
	const data = parseJSON<T>(tekst);

	return {
		data,
		model: CLAUDE_MODEL,
		prompt:
			typeof prompt === 'string'
				? prompt
				: prompt.map((b) => (b.type === 'text' ? b.text : `[${b.type}]`)).join('\n'),
		response: tekst,
		tokensInput: res.usage?.input_tokens ?? 0,
		tokensOutput: res.usage?.output_tokens ?? 0,
		duurMs
	};
}
