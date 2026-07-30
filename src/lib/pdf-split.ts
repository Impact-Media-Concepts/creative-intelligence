/**
 * Client-side opsplitsen van een PDF in pagina-batches, zodat elke batch los (onder de
 * Vercel 60s-timeout) door Claude visueel gelezen kan worden. Alleen DYNAMISCH importeren.
 */
import { PDFDocument } from 'pdf-lib';

/** Uint8Array → base64 (in blokken, zodat grote bestanden de call-stack niet overbelasten). */
function bytesNaarBase64(bytes: Uint8Array): string {
	let bin = '';
	const blok = 0x8000;
	for (let i = 0; i < bytes.length; i += blok) {
		bin += String.fromCharCode(...bytes.subarray(i, i + blok));
	}
	return btoa(bin);
}

/**
 * Splitst een PDF in batches van `batchGrootte` pagina's en geeft per batch een base64-PDF terug.
 * Kleine PDF's leveren gewoon één batch op.
 */
export async function pdfInBatches(buf: ArrayBuffer, batchGrootte = 3): Promise<string[]> {
	const bron = await PDFDocument.load(buf, { ignoreEncryption: true });
	const totaal = bron.getPageCount();
	const batches: string[] = [];
	for (let start = 0; start < totaal; start += batchGrootte) {
		const deel = await PDFDocument.create();
		const indexen: number[] = [];
		for (let i = start; i < Math.min(start + batchGrootte, totaal); i++) indexen.push(i);
		const paginas = await deel.copyPages(bron, indexen);
		paginas.forEach((p) => deel.addPage(p));
		batches.push(bytesNaarBase64(await deel.save()));
	}
	return batches;
}
