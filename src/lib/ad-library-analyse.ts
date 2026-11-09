/**
 * Ad Library — zuivere analyse (geen netwerk, geen server-imports): welke advertenties horen bij
 * de concurrent en wat valt er zonder AI al te berekenen (looptijden, volume, platformen).
 */

export interface AdLibAd {
	id: string;
	page_id?: string;
	page_name?: string;
	ad_creation_time?: string;
	ad_delivery_start_time?: string;
	ad_delivery_stop_time?: string;
	ad_creative_bodies?: string[];
	ad_creative_link_titles?: string[];
	ad_creative_link_descriptions?: string[];
	publisher_platforms?: string[];
	ad_snapshot_url?: string;
}

// ---------------------------------------------------------------------------------------------
// Analyse (zuiver, geen netwerk): wat valt er zonder AI al te berekenen?
// ---------------------------------------------------------------------------------------------

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

/** Houdt alleen advertenties van de pagina die bij de concurrent hoort (op paginanaam). */
export function filterOpPagina(ads: AdLibAd[], naam: string): { ads: AdLibAd[]; paginas: Array<{ naam: string; aantal: number }> } {
	const doel = norm(naam);
	const teller = new Map<string, number>();
	for (const a of ads) if (a.page_name) teller.set(a.page_name, (teller.get(a.page_name) ?? 0) + 1);
	const paginas = [...teller.entries()].map(([n, aantal]) => ({ naam: n, aantal })).sort((a, b) => b.aantal - a.aantal);
	if (!doel) return { ads: [], paginas };
	const gekozen = ads.filter((a) => {
		const p = norm(a.page_name ?? '');
		return p && (p.includes(doel) || doel.includes(p));
	});
	return { ads: gekozen, paginas: paginas.slice(0, 6) };
}

export interface AdSamenvatting {
	totaal: number;
	actief: number;
	paginaNaam: string;
	oudsteStart: string | null;
	platformen: Array<{ naam: string; aantal: number }>;
	/** Langst lopende ads (indicatie voor winnaars). */
	langst: Array<{ dagen: number; actief: boolean; start: string | null; kop: string; tekst: string; snapshot: string | null }>;
	/** Nieuwste ads (waar ze nu mee testen). */
	nieuwste: Array<{ start: string | null; kop: string; tekst: string }>;
	/** Aantal gestarte ads per maand (laatste 6 maanden). */
	startsPerMaand: Array<{ maand: string; aantal: number }>;
}

const dagenTussen = (van: Date, tot: Date) => Math.max(0, Math.round((tot.getTime() - van.getTime()) / 86_400_000));
const kort = (s: string | undefined, n: number) => {
	const t = (s ?? '').replace(/\s+/g, ' ').trim();
	return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
};

export function samenvatAds(ads: AdLibAd[], nu = new Date()): AdSamenvatting {
	const metDatum = ads.map((a) => {
		const start = a.ad_delivery_start_time ? new Date(a.ad_delivery_start_time) : null;
		const stop = a.ad_delivery_stop_time ? new Date(a.ad_delivery_stop_time) : null;
		const actief = !stop || stop.getTime() > nu.getTime();
		const dagen = start ? dagenTussen(start, actief ? nu : (stop ?? nu)) : 0;
		return { a, start, actief, dagen };
	});

	const platform = new Map<string, number>();
	for (const a of ads) for (const p of a.publisher_platforms ?? []) platform.set(p, (platform.get(p) ?? 0) + 1);

	const maanden = new Map<string, number>();
	for (const { start } of metDatum) {
		if (!start) continue;
		const sleutel = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
		maanden.set(sleutel, (maanden.get(sleutel) ?? 0) + 1);
	}

	const tekstVan = (a: AdLibAd) => ({
		kop: kort(a.ad_creative_link_titles?.[0], 80),
		tekst: kort(a.ad_creative_bodies?.[0], 260)
	});

	const starts = metDatum.filter((x) => x.start).map((x) => x.start!.getTime());
	return {
		totaal: ads.length,
		actief: metDatum.filter((x) => x.actief).length,
		paginaNaam: ads.find((a) => a.page_name)?.page_name ?? '',
		oudsteStart: starts.length ? new Date(Math.min(...starts)).toISOString().slice(0, 10) : null,
		platformen: [...platform.entries()].map(([naam, aantal]) => ({ naam, aantal })).sort((a, b) => b.aantal - a.aantal),
		langst: [...metDatum]
			.filter((x) => x.start)
			.sort((x, y) => y.dagen - x.dagen)
			.slice(0, 8)
			.map((x) => ({
				dagen: x.dagen,
				actief: x.actief,
				start: x.start ? x.start.toISOString().slice(0, 10) : null,
				...tekstVan(x.a),
				snapshot: x.a.ad_snapshot_url ?? null
			})),
		nieuwste: [...metDatum]
			.filter((x) => x.start)
			.sort((x, y) => y.start!.getTime() - x.start!.getTime())
			.slice(0, 5)
			.map((x) => ({ start: x.start ? x.start.toISOString().slice(0, 10) : null, ...tekstVan(x.a) })),
		startsPerMaand: [...maanden.entries()]
			.sort((a, b) => b[0].localeCompare(a[0]))
			.slice(0, 6)
			.map(([maand, aantal]) => ({ maand, aantal }))
	};
}
