import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Brief is samengevoegd in de Creatie-tab (Productie). Oude links doorsturen.
export const load: PageServerLoad = async ({ params }) => {
	redirect(308, `/klanten/${params.id}/productie`);
};
