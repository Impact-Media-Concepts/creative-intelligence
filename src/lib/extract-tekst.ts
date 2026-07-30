/**
 * Client-side tekstextractie uit PDF- en Excel-bestanden, zodat de document-upload
 * (die de bestaande 4-bronnen-parser voedt) ook deze formaten aankan.
 *
 * Dit bestand alleen DYNAMISCH importeren vanuit browsercode (await import(...)),
 * zodat pdf.js/SheetJS nooit tijdens SSR laden.
 */
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import * as XLSX from 'xlsx';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Haalt de tekstlaag uit een (tekst-)PDF. Gescande PDF's zonder tekstlaag geven weinig terug. */
export async function pdfNaarTekst(buf: ArrayBuffer): Promise<string> {
	const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
	const delen: string[] = [];
	for (let p = 1; p <= pdf.numPages; p++) {
		const page = await pdf.getPage(p);
		const content = await page.getTextContent();
		delen.push(content.items.map((it) => ('str' in it ? it.str : '')).join(' '));
	}
	return delen.join('\n\n').replace(/[ \t]+/g, ' ').trim();
}

/** Zet elk tabblad van een Excel-bestand om naar CSV-tekst (met tabblad-kopjes). */
export function excelNaarTekst(buf: ArrayBuffer): string {
	const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
	return wb.SheetNames.map((naam) => {
		const csv = XLSX.utils.sheet_to_csv(wb.Sheets[naam]);
		return csv.trim() ? `## Tabblad: ${naam}\n${csv}` : '';
	})
		.filter(Boolean)
		.join('\n\n')
		.trim();
}
