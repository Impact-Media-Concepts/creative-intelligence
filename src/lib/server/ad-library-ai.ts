import { claudeJSON } from './claude';
import type { AdSamenvatting } from './meta/ad-library';

const SCHEMA = {
	type: 'object',
	additionalProperties: false,
	properties: { analyse: { type: 'string' } },
	required: ['analyse']
};

const SYSTEM = `Je bent een Creative Social Ads Strateeg bij Online Klik. Je krijgt de publieke Meta Ad Library-gegevens van één concurrent: aantallen, looptijden en echte advertentieteksten. Schrijf een korte analyse voor het intakeveld "Lang draaiende ad formats (Meta Ad Library)".

Geef UITSLUITEND JSON: {"analyse": "..."} met platte tekst (geen markdown), Nederlands, maximaal ±170 woorden, in deze regels:
Actief: hoeveel ads draaien er nu en sinds wanneer adverteren ze (volume/tempo).
Langst lopend (winnaar-indicatie): wat zijn de langst lopende ads en waar gaan ze over — kort, met korte citaten tussen aanhalingstekens.
Terugkerende hoeken: welke boodschappen/hooks komen steeds terug.
Aanbod en CTA: welke aanbiedingen, bewijs of oproepen gebruiken ze.
Tempo: wat testen ze de laatste weken (nieuwste ads) en wat valt op in het aantal nieuwe ads per maand.

Regels:
- Gebruik UITSLUITEND de aangeleverde data. Verzin niets: geen cijfers, claims of teksten die er niet staan.
- Het FORMAAT (video, static, carousel) zit NIET in deze data. Noem het niet als feit; zeg hooguit dat het via de snapshot-links te controleren is.
- Lang lopend betekent een INDICATIE dat een ad werkt (niemand laat een verliezer maanden draaien), geen bewijs. Formuleer dat voorzichtig.
- Concreet en bruikbaar voor een strateeg die hoeken wil vinden waar de concurrent niet op zit.`;

/** Laat Claude de Ad Library-gegevens van één concurrent samenvatten voor de intake. */
export async function analyseerAdLibrary(samenvatting: AdSamenvatting, concurrent: string) {
	const prompt = `Concurrent: ${concurrent} (Facebook-pagina: ${samenvatting.paginaNaam})\n\nAd Library-gegevens (NL):\n${JSON.stringify(samenvatting, null, 1)}`;
	const res = await claudeJSON<{ analyse?: string }>(SYSTEM, prompt, SCHEMA, 2500, 'medium');
	return { ...res, analyse: String(res.data.analyse ?? '').trim() };
}
