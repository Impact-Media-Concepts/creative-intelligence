/**
 * Handgeschreven Database-types die overeenkomen met supabase/migrations/*.sql.
 * Houd dit bestand in sync met de SQL-migraties.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Rol = 'admin' | 'gebruiker';
export type ClientStatus = 'actief' | 'gepauzeerd' | 'gearchiveerd';
export type ClientFase = 'intake' | 'trigger_map' | 'matrix' | 'sprint';
export type Funnelfase = 'TOFU' | 'MOFU' | 'BOFU';
export type Prioriteit = 'Hoog' | 'Middel' | 'Laag';
export type ConceptStatus = 'Idee' | 'In productie' | 'Live' | 'Afgerond';

export interface Database {
	public: {
		Tables: {
			profiles: {
				Row: {
					id: string;
					naam: string | null;
					rol: Rol;
					rondleiding_gezien: boolean;
					created_at: string;
				};
				Insert: {
					id: string;
					naam?: string | null;
					rol?: Rol;
					rondleiding_gezien?: boolean;
					created_at?: string;
				};
				Update: {
					id?: string;
					naam?: string | null;
					rol?: Rol;
					rondleiding_gezien?: boolean;
					created_at?: string;
				};
				Relationships: [];
			};
			clients: {
				Row: {
					id: string;
					eigenaar_id: string;
					naam: string;
					sector: string | null;
					status: ClientStatus;
					huidige_fase: ClientFase;
					testplan: Json | null;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					eigenaar_id: string;
					naam: string;
					sector?: string | null;
					status?: ClientStatus;
					huidige_fase?: ClientFase;
					testplan?: Json | null;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					eigenaar_id?: string;
					naam?: string;
					sector?: string | null;
					status?: ClientStatus;
					huidige_fase?: ClientFase;
					testplan?: Json | null;
					created_at?: string;
					updated_at?: string;
				};
				Relationships: [];
			};
			intake_bron1: {
				Row: {
					id: string;
					client_id: string;
					vraag_nummer: number;
					antwoord: string | null;
					updated_at: string;
				};
				Insert: {
					id?: string;
					client_id: string;
					vraag_nummer: number;
					antwoord?: string | null;
					updated_at?: string;
				};
				Update: {
					id?: string;
					client_id?: string;
					vraag_nummer?: number;
					antwoord?: string | null;
					updated_at?: string;
				};
				Relationships: [];
			};
			intake_bron2: {
				Row: {
					id: string;
					client_id: string;
					vraag_nummer: number;
					antwoord: string | null;
					updated_at: string;
				};
				Insert: {
					id?: string;
					client_id: string;
					vraag_nummer: number;
					antwoord?: string | null;
					updated_at?: string;
				};
				Update: {
					id?: string;
					client_id?: string;
					vraag_nummer?: number;
					antwoord?: string | null;
					updated_at?: string;
				};
				Relationships: [];
			};
			intake_bron3_concurrenten: {
				Row: {
					id: string;
					client_id: string;
					naam: string | null;
					url: string | null;
					meta_ad_library: string | null;
					invalshoeken: string | null;
					website_taal: string | null;
					tiktok_observaties: string | null;
					kansen: string | null;
					created_at: string;
				};
				Insert: {
					id?: string;
					client_id: string;
					naam?: string | null;
					url?: string | null;
					meta_ad_library?: string | null;
					invalshoeken?: string | null;
					website_taal?: string | null;
					tiktok_observaties?: string | null;
					kansen?: string | null;
					created_at?: string;
				};
				Update: {
					id?: string;
					client_id?: string;
					naam?: string | null;
					url?: string | null;
					meta_ad_library?: string | null;
					invalshoeken?: string | null;
					website_taal?: string | null;
					tiktok_observaties?: string | null;
					kansen?: string | null;
					created_at?: string;
				};
				Relationships: [];
			};
			intake_bron4: {
				Row: {
					id: string;
					client_id: string;
					platform: string | null;
					bron_naam: string | null;
					ruwe_tekst: string | null;
					updated_at: string;
				};
				Insert: {
					id?: string;
					client_id: string;
					platform?: string | null;
					bron_naam?: string | null;
					ruwe_tekst?: string | null;
					updated_at?: string;
				};
				Update: {
					id?: string;
					client_id?: string;
					platform?: string | null;
					bron_naam?: string | null;
					ruwe_tekst?: string | null;
					updated_at?: string;
				};
				Relationships: [];
			};
			intake_bron5: {
				Row: {
					id: string;
					client_id: string;
					beste_advertenties: string | null;
					best_verkopende_producten: string | null;
					search_console: string | null;
					organische_posts: string | null;
					updated_at: string;
				};
				Insert: {
					id?: string;
					client_id: string;
					beste_advertenties?: string | null;
					best_verkopende_producten?: string | null;
					search_console?: string | null;
					organische_posts?: string | null;
					updated_at?: string;
				};
				Update: {
					id?: string;
					client_id?: string;
					beste_advertenties?: string | null;
					best_verkopende_producten?: string | null;
					search_console?: string | null;
					organische_posts?: string | null;
					updated_at?: string;
				};
				Relationships: [];
			};
			intake_bron6: {
				Row: {
					id: string;
					client_id: string;
					titel: string | null;
					inhoud: string | null;
					created_at: string;
				};
				Insert: {
					id?: string;
					client_id: string;
					titel?: string | null;
					inhoud?: string | null;
					created_at?: string;
				};
				Update: {
					id?: string;
					client_id?: string;
					titel?: string | null;
					inhoud?: string | null;
					created_at?: string;
				};
				Relationships: [];
			};
			trigger_map_versions: {
				Row: {
					id: string;
					client_id: string;
					versie_nummer: number;
					is_actief: boolean;
					pijnpunten: Json | null;
					wensen: Json | null;
					bezwaren: Json | null;
					taal_doelgroep: Json | null;
					routines: Json | null;
					kansen_vs_concurrenten: Json | null;
					invalshoeken: Json | null;
					personas: Json | null;
					gegenereerd_door: string | null;
					created_at: string;
				};
				Insert: {
					id?: string;
					client_id: string;
					versie_nummer: number;
					is_actief?: boolean;
					pijnpunten?: Json | null;
					wensen?: Json | null;
					bezwaren?: Json | null;
					taal_doelgroep?: Json | null;
					routines?: Json | null;
					kansen_vs_concurrenten?: Json | null;
					invalshoeken?: Json | null;
					personas?: Json | null;
					gegenereerd_door?: string | null;
					created_at?: string;
				};
				Update: {
					id?: string;
					client_id?: string;
					versie_nummer?: number;
					is_actief?: boolean;
					pijnpunten?: Json | null;
					wensen?: Json | null;
					bezwaren?: Json | null;
					taal_doelgroep?: Json | null;
					routines?: Json | null;
					kansen_vs_concurrenten?: Json | null;
					invalshoeken?: Json | null;
					personas?: Json | null;
					gegenereerd_door?: string | null;
					created_at?: string;
				};
				Relationships: [];
			};
			concepts: {
				Row: {
					id: string;
					client_id: string;
					funnelfase: Funnelfase | null;
					invalshoek: string | null;
					format: string | null;
					structuur: string | null;
					creator_type: string | null;
					hypothese: string | null;
					variabele: string | null;
					onderbouwing: string | null;
					prioriteit: Prioriteit | null;
					status: ConceptStatus;
					volgorde: number | null;
					gearchiveerd: boolean;
					hook_rate: number | null;
					hold_rate: number | null;
					ctr: number | null;
					roas: number | null;
					cpa: number | null;
					observatie: string | null;
					ai_analyse: Json | null;
					brief: Json | null;
					is_winnaar: boolean;
					meta_ad_external_id: string | null;
					meta_auto_sync: boolean;
					meta_metrics: Json | null;
					meta_laatste_sync: string | null;
					auto_winnaar: boolean;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					client_id: string;
					funnelfase?: Funnelfase | null;
					invalshoek?: string | null;
					format?: string | null;
					structuur?: string | null;
					creator_type?: string | null;
					hypothese?: string | null;
					variabele?: string | null;
					onderbouwing?: string | null;
					prioriteit?: Prioriteit | null;
					status?: ConceptStatus;
					volgorde?: number | null;
					gearchiveerd?: boolean;
					hook_rate?: number | null;
					hold_rate?: number | null;
					ctr?: number | null;
					roas?: number | null;
					cpa?: number | null;
					observatie?: string | null;
					ai_analyse?: Json | null;
					brief?: Json | null;
					is_winnaar?: boolean;
					meta_ad_external_id?: string | null;
					meta_auto_sync?: boolean;
					meta_metrics?: Json | null;
					meta_laatste_sync?: string | null;
					auto_winnaar?: boolean;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					client_id?: string;
					funnelfase?: Funnelfase | null;
					invalshoek?: string | null;
					format?: string | null;
					structuur?: string | null;
					creator_type?: string | null;
					hypothese?: string | null;
					variabele?: string | null;
					onderbouwing?: string | null;
					prioriteit?: Prioriteit | null;
					status?: ConceptStatus;
					volgorde?: number | null;
					gearchiveerd?: boolean;
					hook_rate?: number | null;
					hold_rate?: number | null;
					ctr?: number | null;
					roas?: number | null;
					cpa?: number | null;
					observatie?: string | null;
					ai_analyse?: Json | null;
					brief?: Json | null;
					is_winnaar?: boolean;
					meta_ad_external_id?: string | null;
					meta_auto_sync?: boolean;
					meta_metrics?: Json | null;
					meta_laatste_sync?: string | null;
					auto_winnaar?: boolean;
					created_at?: string;
					updated_at?: string;
				};
				Relationships: [];
			};
			ai_logs: {
				Row: {
					id: string;
					client_id: string | null;
					gebruiker_id: string | null;
					module: string | null;
					model: string | null;
					prompt: string | null;
					response: string | null;
					tokens_input: number | null;
					tokens_output: number | null;
					duur_ms: number | null;
					created_at: string;
				};
				Insert: {
					id?: string;
					client_id?: string | null;
					gebruiker_id?: string | null;
					module?: string | null;
					model?: string | null;
					prompt?: string | null;
					response?: string | null;
					tokens_input?: number | null;
					tokens_output?: number | null;
					duur_ms?: number | null;
					created_at?: string;
				};
				Update: {
					id?: string;
					client_id?: string | null;
					gebruiker_id?: string | null;
					module?: string | null;
					model?: string | null;
					prompt?: string | null;
					response?: string | null;
					tokens_input?: number | null;
					tokens_output?: number | null;
					duur_ms?: number | null;
					created_at?: string;
				};
				Relationships: [];
			};
			meta_connections: {
				Row: {
					id: string;
					client_id: string;
					ad_account_id: string;
					ad_account_naam: string | null;
					currency: string | null;
					timezone_name: string | null;
					business_id: string | null;
					access_token: string | null;
					token_verloopt_at: string | null;
					gekoppeld_door: string | null;
					gekoppeld_at: string;
					losgekoppeld_at: string | null;
					laatste_sync_at: string | null;
					laatste_sync_status: string | null;
					laatste_sync_fout: string | null;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					client_id: string;
					ad_account_id: string;
					ad_account_naam?: string | null;
					currency?: string | null;
					timezone_name?: string | null;
					business_id?: string | null;
					access_token?: string | null;
					token_verloopt_at?: string | null;
					gekoppeld_door?: string | null;
					gekoppeld_at?: string;
					losgekoppeld_at?: string | null;
					laatste_sync_at?: string | null;
					laatste_sync_status?: string | null;
					laatste_sync_fout?: string | null;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					client_id?: string;
					ad_account_id?: string;
					ad_account_naam?: string | null;
					currency?: string | null;
					timezone_name?: string | null;
					business_id?: string | null;
					access_token?: string | null;
					token_verloopt_at?: string | null;
					gekoppeld_door?: string | null;
					gekoppeld_at?: string;
					losgekoppeld_at?: string | null;
					laatste_sync_at?: string | null;
					laatste_sync_status?: string | null;
					laatste_sync_fout?: string | null;
					created_at?: string;
					updated_at?: string;
				};
				Relationships: [];
			};
			meta_ads: {
				Row: {
					id: string;
					connection_id: string;
					client_id: string;
					external_id: string;
					naam: string | null;
					adset_id: string | null;
					campaign_id: string | null;
					status: string | null;
					preview_url: string | null;
					eerste_gezien_at: string | null;
					laatste_metrics: Json | null;
					laatste_sync_at: string | null;
					created_at: string;
				};
				Insert: {
					id?: string;
					connection_id: string;
					client_id: string;
					external_id: string;
					naam?: string | null;
					adset_id?: string | null;
					campaign_id?: string | null;
					status?: string | null;
					preview_url?: string | null;
					eerste_gezien_at?: string | null;
					laatste_metrics?: Json | null;
					laatste_sync_at?: string | null;
					created_at?: string;
				};
				Update: {
					id?: string;
					connection_id?: string;
					client_id?: string;
					external_id?: string;
					naam?: string | null;
					adset_id?: string | null;
					campaign_id?: string | null;
					status?: string | null;
					preview_url?: string | null;
					eerste_gezien_at?: string | null;
					laatste_metrics?: Json | null;
					laatste_sync_at?: string | null;
					created_at?: string;
				};
				Relationships: [];
			};
			spar_berichten: {
				Row: {
					id: string;
					client_id: string;
					onderwerp: string;
					rol: 'user' | 'assistant';
					tekst: string;
					gebruiker_id: string | null;
					created_at: string;
				};
				Insert: {
					id?: string;
					client_id: string;
					onderwerp: string;
					rol: 'user' | 'assistant';
					tekst: string;
					gebruiker_id?: string | null;
					created_at?: string;
				};
				Update: {
					id?: string;
					client_id?: string;
					onderwerp?: string;
					rol?: 'user' | 'assistant';
					tekst?: string;
					gebruiker_id?: string | null;
					created_at?: string;
				};
				Relationships: [];
			};
		};
		Views: Record<string, never>;
		Functions: {
			is_admin: { Args: Record<string, never>; Returns: boolean };
			can_access_client: { Args: { cid: string }; Returns: boolean };
		};
		Enums: Record<string, never>;
		CompositeTypes: Record<string, never>;
	};
}

/** Handige shortcuts voor rijtypes. */
export type Profiel = Database['public']['Tables']['profiles']['Row'];
export type Client = Database['public']['Tables']['clients']['Row'];
export type TriggerMapVersie = Database['public']['Tables']['trigger_map_versions']['Row'];
export type Concept = Database['public']['Tables']['concepts']['Row'];
export type AiLog = Database['public']['Tables']['ai_logs']['Row'];
export type MetaConnection = Database['public']['Tables']['meta_connections']['Row'];
export type MetaAd = Database['public']['Tables']['meta_ads']['Row'];
export type SparBericht = Database['public']['Tables']['spar_berichten']['Row'];
