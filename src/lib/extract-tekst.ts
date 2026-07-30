/**
 * Client-side tekstextractie uit Excel-bestanden, zodat de document-upload (die de
 * bestaande 4-bronnen-parser voedt) ook .xlsx/.xls aankan.
 *
 * PDF's en afbeeldingen gaan NIET via dit bestand: die worden als document/afbeelding
 * naar Claude gestuurd (visueel lezen — incl. tabellen/grafieken), zie de parse-flow.
 *
 * Dit bestand alleen DYNAMISCH importeren vanuit browsercode (await import(...)).
 */
import * as XLSX from 'xlsx';

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
