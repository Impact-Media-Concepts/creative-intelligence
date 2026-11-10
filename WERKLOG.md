# Werklog — Creative Intelligence App

Dit bestand houdt bij **wat er gebouwd is, waarom, en hoe het geverifieerd is**. Doel: terugleesbaar voor het team, en een vangnet om op terug te vallen als er iets misgaat. Nieuwste bovenaan. Elke wijziging is ook een git-commit (hash vermeld).

> Onderhoud: bij elke afgeronde wijziging wordt hier een entry toegevoegd (datum, commit, wat, waarom, verificatie, migratie). Kritisch blijven: bekende beperkingen staan expliciet onder "Kritische noten".

---

## Architectuur in het kort

- **Stack:** SvelteKit + TypeScript, Tailwind v4 + shadcn-svelte, Supabase (auth + Postgres, RLS), Anthropic Claude API, Vercel.
- **Model:** `claude-sonnet-5` (env `ANTHROPIC_MODEL` overschrijft; default in `src/lib/config.ts`).
- **De keten (Creative Loop):** Intake (5 bronnen + document-upload + "Overig") → Trigger Map → Matrix → Brief → Sprint → (winnaar) → volgende matrix-ronde.
- **Principes:** AI draait nooit automatisch (altijd expliciete knop); alle invoer auto-save; trigger map-versies worden nooit overschreven (nieuwe generatie = nieuwe versie); elke AI-call wordt gelogd in `ai_logs`; werkt met gedeeltelijke intake.

---

## AI-strategie per generatie (naslag)

Alle generaties gebruiken **structured outputs** (JSON-schema → gegarandeerd valide vorm) en **adaptive thinking** (het model bepaalt zelf de denk-diepte, gestuurd door `effort`). Gedeelde helper: `src/lib/server/claude.ts` → `claudeJSON(system, prompt, schema, maxTokens=16000, effort='high')`.

### Trigger map (`src/lib/server/trigger-map-generator.ts`)
- **Input:** alle ingevulde intake-data (Bron 1 t/m 6) als tekst — vraag + antwoord per bron, samengevoegd door `bouwIntakeTekst`.
- **Output:** pijnpunten (4-6), wensen (4-6), bezwaren (3-5), taal doelgroep (8-12 letterlijke termen), routines (3-5), kansen t.o.v. concurrenten (3-5), **persona's** (2-4 segmenten), **invalshoeken (3 per funnelfase = 9)**.
- **Effort:** `medium` (zwaarste generatie; `high` liep ~67s, over de Vercel-timeout).
- **Let op:** het is een *synthese/distillatie*, geen 1-op-1 afvinklijst. Alle input gaat erin; het model vat samen.

### Scorekaart (`src/lib/trigger-map.ts` + `src/lib/server/scoring-ai.ts`) — prioriteit per invalshoek
- **Doel:** de prioriteit transparant en controleerbaar maken vóórdat de matrix wordt gemaakt (mens in de lus).
- **Model:** RICE-light per invalshoek — **Bereik** (persona-segment), **Impact** (kernpijnpunt/wens), **Bewijskracht** (hoeveel intake-bronnen ondersteunen), **Effort** (productie-inspanning), elk Laag/Middel/Hoog.
- **Formule:** `(Bereik × Impact × Bewijskracht) / Effort` met L/M/H → 1/2/3. Prioriteit-banden: ≥8 = Hoog, ≥3 = Middel, anders Laag (`afgeleidePrioriteit`).
- **Werkwijze:** "Scores voorstellen" laat Claude de scores + toelichting voorstellen (effort `low`); de strateeg controleert/stelt bij (L/M/H-selects, auto-save). De matrix erft de afgeleide prioriteit exact.
- **Kritische noot:** de RICE-getallen blijven schattingen; de winst zit in *expliciet en consistent* maken + menselijke controle, niet in schijnprecisie. Echte validatie volgt uit de kalibratie-loop (voorspelde prio vs. sprintresultaten).

### Matrix (`src/lib/server/matrix-ai.ts`) — trigger map → testopzet
- **Input aan Claude:** de invalshoeken per funnelfase (met omschrijving + **onderbouwing** + status; gearchiveerde worden overgeslagen, en "Getest — werkt" worden overgeslagen tenzij er te weinig overblijven), de **persona's**, pijnpunten, wensen, bezwaren, taal, kansen, én optioneel de **extra sturing** (vrij tekstveld van de strateeg).
- **Methode / principe:**
  1. **Eén concept per invalshoek**, dekt TOFU/MOFU/BOFU af.
  2. **Schoon testen:** de eerste ronde test de *invalshoek*, dus per funnelfase blijven format/structuur/creator **gelijk** en varieert alleen de invalshoek. Testvolgorde = Invalshoek → Format → Structuur → Creator.
  3. **Prioriteit (Hoog/Middel/Laag)** komt uit de **scorekaart** (zie hieronder): de matrix neemt de door de strateeg goedgekeurde prioriteit exact over. Alleen als een invalshoek nog niet gescoord is, weegt Claude zelf af (aansluiting pijnpunt/wens/kans, persona-bereik, funnelfase).
  4. **Onderbouwing per concept:** 1-3 zinnen die (a) de invalshoek koppelen aan een concreet trigger map-element en (b) de prioriteit verantwoorden. Zichtbaar via de ℹ️-knop in de matrix.
- **Weergavevolgorde in de tabel** (`sorteerConcepten`, `src/lib/matrix.ts`): funnelfase (TOFU→MOFU→BOFU) → prioriteit (Hoog→Middel→Laag) → aanmaakdatum. Dit is mechanisch/deterministisch.
- **Effort:** `low` (met de rijke context is diep nadenken minder nodig; `high`/`medium` liepen ~100s/~88s, over de 60s Vercel-timeout; `low` ≈ 41s).

### Testplan (`src/lib/server/testplan-ai.ts`) — onder de matrix
- **Input:** persona's + de matrix-concepten + pijnpunten/wensen + optionele feedback.
- **Output:** toelichting + 4-6 sprints (focus/persona, welke concepten, wat testen, succescriterium, budget, duur). "Verfijn met feedback" hergenereert. Effort `high` (~35s).

### Brief (`src/lib/server/sprint-ai.ts` → `genereerBrief`)
- Per concept een productieklare creative brief (hypothese, wie, gedrag, format, structuur, hook, kern, cta, variabele, succes). Effort `high` (~19s). Eigen tab tussen Matrix en Sprint.

### Learning-analyse & volgende testronde (`src/lib/server/sprint-ai.ts`)
- **`analyseerResultaat`:** o.b.v. metrics + observatie → "wat werkte" + "volgende stap".
- **`genereerVolgendeTestronde`** (de loop): bij een winnaar → 2-4 varianten van de **volgende** testvariabele (invalshoek + winnende dimensies constant), onderbouwd met de learning van de vorige ronde. Effort `medium`.

### Kritische noten (bewust eerlijk)
- De weging/prioriteit is **transparant** (onderbouwing) en **gefundeerd** (persona's + onderbouwing worden meegegeven), maar het blijft de **inschatting van het model** gestuurd door de prompt — géén deterministisch numeriek scoringsmodel. Te controleren via de onderbouwing.
- Trigger map = synthese, geen gegarandeerde 1-op-1 dekking van elk intake-antwoord.
- Om onder de Vercel-timeout (60s) te blijven staan de zwaarste generaties op lagere `effort`. Op Vercel **Pro** (maxDuration tot 300s) kan `effort` omhoog voor meer diepgang.

---

## Openstaande / bekende punten
- Tijdelijk admin-wachtwoord voor `j.trines@onlineklik.nl` moet nog gewijzigd worden (er is nog geen wachtwoord-scherm in de app).
- Google-login is gevraagd maar niet gebouwd.
- Meta Ads-koppeling: bewust uitgesteld.
- Vercel-plan onbekend: bij Pro kan `maxDuration` naar 300 + `effort` omhoog.
- Testklant "Test" bevat testdata (mag opgeruimd worden).

---

## Wijzigingen (nieuwste boven)

### 2026-11-10 — Ad Library-token via "Koppel met Facebook" (geen plakken meer)
- **Wat:** in Instellingen → Meta Ad Library staat nu de knop **Koppel met Facebook** (alleen admins). Die gebruikt dezelfde Meta-login als de klantkoppeling (`/api/meta/connect?bureau=1` → `/api/meta/callback`, state `bureau.<nonce>`): de admin logt in als zichzelf, de server wisselt de code in voor een langlopend token (±60 dagen), bewaart het in `bureau_instellingen`, test het meteen met een Ad Library-zoekopdracht en stuurt terug naar Instellingen met een melding (`?adlib=ok | niet-vrijgegeven | fout`). Scope: alleen `pages_show_list` (kleinste permissie; de Ad Library heeft een geldig gebruikerstoken nodig, geen speciale rechten). Het plakken van een Explorer-token blijft beschikbaar onder "Of plak handmatig een token". Er hoeft dus nergens een token gekopieerd of in een chat gezet te worden.
- **Bestanden:** `src/routes/api/meta/connect/+server.ts`, `src/routes/api/meta/callback/+server.ts`, `src/lib/server/meta/bureau-token.ts` (`bewaarLangToken`), `src/routes/(app)/instellingen/+page.svelte`.
- **Redirect-URI:** de live callback `https://creative-intelligence-three.vercel.app/api/meta/callback` staat al bij Meta; lokaal (`http://localhost:5173/api/meta/callback`) niet, dus testen kan alleen op de live app (na push).
- **Verificatie:** typecheck 0 fouten; de pagina rendert met de knop en de status. De volledige login-flow is nog niet doorlopen (vereist de live app).
- **Controle migraties (10 nov):** in Supabase staan `concepts.doel` (0016) en tabel `bureau_instellingen` (0018); de kolom `concepts.ronde` (0017) ontbrak nog, dus 0017 moet nog gedraaid worden (het Testbord werkt ook zonder).

### 2026-11-10 — Meta Ad Library met een admin-token (Instellingen)
- **Aanleiding:** de Ad Library API werkt alleen voor een PERSOON met bevestigde identiteit; het app-token (`META_APP_ID|META_APP_SECRET`) wordt geweigerd (code 10/2332004). In de Graph API Explorer met Jari's user-token gaf dezelfde zoekopdracht wel resultaten.
- **Wat:** Instellingen → kaart "Meta Ad Library" (alleen admins). Een admin plakt een token uit de Graph API Explorer (permissie `pages_show_list` volstaat); de server wisselt het via `fb_exchange_token` in voor een langlopend token (±60 dagen), bewaart het, en test het meteen met één Ad Library-zoekopdracht. De kaart toont de status (niet ingesteld / geldig tot / verlopen). Het token wordt nooit teruggestuurd naar de browser. De concurrent-scan in de intake gebruikt dit bureau-token als eerste keuze (daarna het klant-token, daarna het app-token).
- **Opslag:** migratie `supabase/migrations/0018_bureau_instellingen.sql` (tabel `bureau_instellingen`, sleutel `meta_adlib_token`). RLS staat aan zonder policy: alleen de server (service role) komt erbij. Zonder migratie blijft de app werken; opslaan geeft dan de melding om 0018 te draaien.
- **Bestanden:** `src/lib/server/meta/bureau-token.ts`, `src/lib/server/meta/ad-library.ts` (`testAdLibraryToken`, soort `bureau`, nieuwe foutteksten), `src/routes/api/intake/+server.ts`, `src/routes/(app)/instellingen/+page.{svelte,server.ts}` (nieuwe actie `adlibToken` controleert zelf ook op admin).
- **Onderhoud:** het token verloopt na ±60 dagen; plak dan een nieuw token. Mogelijke blijvende oplossing: token van een systeemgebruiker (uit te proberen).
- **Verificatie:** typecheck 0 fouten; de kaart rendert met de status "nog geen token ingesteld". Opslaan en testen met een echt token niet gedaan (het token blijft bij de gebruiker).

### 2026-11-10 — Creatie-tab herbouwd: lijst met stappen per concept
- **Wat:** de Creatie-tab (`/klanten/[id]/productie`) toont niet meer alle concepten onder elkaar (was ±9.500 px, 55 knoppen, 170 velden), maar een lijst met concepten links en het gekozen concept rechts. Links: concepten van de huidige ronde, gegroepeerd per bewustzijnsfase (bottom-up), elk met vier vinkjes (Brief · Script · Advertentietekst · Beeld) en "x/4"; bovenaan "x van y concepten klaar" met balk. Rechts: vier stappen als tabs — **Brief** (genereren, kopiëren, exporteren), **Script** (5 beats), **Advertentietekst** (tellers + live voorbeeld van de feed-advertentie via `AdMockup`), **Beeld** (referentie, props en het storyboard-blad met beeldaanwijzingen). De pagina opent op de eerste nog open stap. Per concept de knop "Maak alles wat nog ontbreekt" (brief → script → tekst → beeld, stopt bij de eerste fout) en bovenaan "Maak alles voor alle concepten" (sequentieel, met bevestiging, voortgangsbalk en stopknop; je moet op de pagina blijven). Bij een compleet concept: "Klaar voor de designer". Eerdere varianten (andere ronde) klappen in onder de lijst. Deep link: `?c=<conceptId>`.
- **Bugfix:** de oude pagina liet bij het opslaan van het script de beeldaanwijzingen van het storyboard wegvallen (`normScript` nam `beeld` niet mee). Nu blijven ze behouden, ook bij "script opnieuw schrijven".
- **Bestanden:** `src/routes/(app)/klanten/[id]/productie/+page.svelte` (herschreven), `src/lib/components/app/StoryboardBlad.svelte` (props `toonLinks` en `onBeeld`, synchroniseert met wijzigingen van buitenaf), `src/lib/testbord.ts` (`splitsRonde` generiek).
- **Verificatie:** typecheck 0 fouten; op de testklant: pagina 1.184 px, 17 concepten in de lijst, alle vier stappen geopend, script wijzigen laat het storyboard intact (ook na herladen; testwijziging teruggedraaid), schermafdruk bekeken. "Maak alles" (AI) niet uitgeprobeerd om geen AI-tegoed te gebruiken.

### 2026-11-10 — Testbord + Sprint samengevoegd (rustig raster, voortgangsbalk, rondes)
- **Wat:** het Testbord is nu het ene scherm voor "Testen". Per test (bewustzijnsfase + variabele, bottom-up) een lichte kop met een **voortgangsbalk** (% van de test dat erop zit), status (Loopt / Klaar om te beslissen / Gewonnen) en zekerheid, daaronder alleen de **varianten** als advertentie-kaarten (waarde, oordeel, spend, balk t.o.v. de leider). De uitlegblokken en omkaderde vakken zijn weg; de "Doel"-kop verschijnt alleen als er meer dan één doel is. Per variant een uitklapbaar "Cijfers invoeren" (hook/hold rate, CTR, ROAS, CPA) en "Markeer als winnaar". Bij "klaar" staat er een banner met de knop "Markeer als winnaar"; bij een winnaar een knop "Volgende ronde" (maakt de vervolgtest via `/api/sprint` `vervolg`).
- **Voortgangsbalk (`groepVoortgang` in `src/lib/resultaten.ts`):** gemiddelde van de drempels (spend, vertoningen, dagen, aankopen) van de twee strijdende varianten (de zwakste telt); 100% pas als de test klaar/beslist is, ervoor maximaal 95% (voorsprong en zekerheid moeten ook kloppen); met één variant ×0,5; bij handmatige cijfers `null` ("Handmatige cijfers — geen voortgangsmeting"). Getest met nagebootste Meta-cijfers: 30% / 57% / 95% / null.
- **Rondes:** nieuwe migratie `supabase/migrations/0017_concept_ronde.sql` (kolom `concepts.ronde`, nullable). De Testruimte (`genereer_set`) en "volgende ronde" (`vervolg`) geven nieuwe concepten automatisch het volgende rondenummer (`src/lib/server/ronde.ts`, werkt ook zolang de migratie nog niet gedraaid is). Het Testbord toont alleen de huidige ronde; eerdere varianten klappen in onder "Eerdere varianten". Zonder rondenummers hoort alles bij de huidige ronde.
- **Navigatie:** Sprint is uit de zijbalk gehaald (Testbord is ook actief op `/sprint`); de Sprint-pagina blijft bereikbaar via "Meta-koppeling" op het Testbord (daar staat de koppeling en het aan een concept koppelen van een advertentie). Loop-bord stap "Testen" en de kaart "Volgende stap" verwijzen naar het Testbord.
- **Verificatie:** typecheck 0 fouten; op de testklant: 4 tests / 17 varianten als raster (3.200 px), cijfers invoeren bleef bewaard na herladen (testwaarden daarna gewist). Winnaar markeren en "Volgende ronde" niet uitgeprobeerd.

### 2026-11-10 — Wachtwoord wijzigen + Ad Library-diagnose
- **Wachtwoord wijzigen:** nieuwe pagina `/account` (link "Wachtwoord wijzigen" in de zijbalk, voor iedere gebruiker). Vraagt het huidige wachtwoord (wordt eerst bevestigd via `signInWithPassword`), dan het nieuwe (min. 10 tekens, twee keer, moet afwijken). Hiermee kan het tijdelijke admin-wachtwoord van j.trines@onlineklik.nl eindelijk worden vervangen (stond open in HANDOFF/WERKLOG). Pagina rendert; het wijzigen zelf is bewust niet uitgeprobeerd (zou het echte wachtwoord veranderen).
- **Ad Library — diagnose:** in de Graph API Explorer (Creative Loop-app, User Token van Jari, permissie `pages_show_list`) gaf `ads_archive?ad_reached_countries=["NL"]&search_terms=Lucardi` wél resultaten (3 Lucardi-ads). De app-token (`META_APP_ID|META_APP_SECRET`) die de scan nu gebruikt wordt door Meta geweigerd (code 10/2332004). Conclusie: de Ad Library API werkt met een **user-token van een geïdentificeerde gebruiker**, niet met het app-token. Vervolg: scan een user-token laten gebruiken (keuze nog te maken: langlopend token in env, systeemgebruiker-token of OAuth-koppeling op bureau-niveau).
- **Overig:** app "Creative Loop" gecontroleerd: valt onder "00. MCC - Online Klik", Jari Trines is Administrator, geen vereiste acties, status Unpublished; dashboard vraagt nog "Become a Tech Provider" voor App Review.

### 2026-11-10 — Storyboard (visuele briefing per concept)
- **Wat:** nieuwe pagina `/klanten/[id]/storyboard` (link vanuit de Creatie-tab): per concept een blad met scènes. Video/UGC/motion: vijf verticale (9:16) beeldkaders, carousel: vijf kaarten (4:5), statisch: één eye-catcher plus de overige elementen. In elk kader staat wat er **gezegd** wordt (uit het script); eronder staat het veld **"Wat zie je?"** (beeldaanwijzing: kader, setting, handeling, tekst in beeld). Daaronder de briefing in een blik (wie, gewenst gedrag, succes), props als chips en de referentielink. Kleur van het kader volgt de bewustzijnsfase. Printbaar/PDF (één concept per pagina); gegroepeerd per bewustzijnsfase met sneltoetsen bovenaan.
- **AI:** knop "Beeldaanwijzing voorstellen" laat de AI per scène een korte aanwijzing schrijven op basis van het bestaande script (case `beeld_gen`, `genereerBeeldaanwijzing`; formaat-bewust; verzint geen feiten; geen gesproken tekst in de aanwijzing). Handmatig aanpassen autosaves bij het verlaten van het veld (`script_save`). Geen migratie: de aanwijzingen staan in hetzelfde `concepts.script`-JSON onder `beeld`; `schoonScript` en `script_gen` laten ze nooit verdwijnen.
- **Bestanden:** `src/lib/storyboard.ts`, `src/lib/components/app/StoryboardBlad.svelte`, `src/routes/(app)/klanten/[id]/storyboard/+page.{svelte,server.ts}`, `src/lib/productie.ts` (type `beeld`), `src/lib/server/productie-ai.ts`, `src/routes/api/concepts/+server.ts`, Creatie-header.
- **Verificatie:** typecheck 0 fouten; op de testklant: 14 bladen (1 met script), beeldaanwijzing in 25 s met concrete kader/setting/handeling per scène, handmatige wijziging bleef na herladen staan (testtekst daarna verwijderd), screenshot bekeken. Printweergave niet getest in een echte printpreview.
- **Nog niet:** referentiebeelden uploaden per scène (vraagt Supabase Storage + rechten) en AI-gegenereerde beelden; nu is het beeldvlak een kleurvlak met icoon.

### 2026-11-10 — Testbord (tests als boom, met advertentie-voorbeelden)
- **Wat:** nieuwe pagina `/klanten/[id]/testbord`, in de zijbalk in plaats van "Matrix" (de tabel blijft bereikbaar via "Tabelweergave"). De tests staan als boom: **Doel** (Aankoop/Leads/Traffic/Awareness/eigen) → **Test** (één variabele binnen één bewustzijnsfase, bottom-up: Meest bewust eerst) → **Varianten** als advertentie-voorbeelden naast elkaar. Per variant: resultaatwaarde, oordeel (leidt/achter/stop-advies/winnaar), spend (bij Meta-cijfers) en een balk t.o.v. de leider; per test de status en een "Beslis en ga door"/"Volgende ronde"-kaart. Meerdere campagnes/doelen draaien naast elkaar: per test is een keuzeveld "Doel" waarmee je de hele test naar een ander doel verhuist; elk doel krijgt een eigen blok. Een persona-niveau is bewust nog niet getoond (concepten leggen geen persona vast).
- **Uitslag:** komt uit `berekenResultaten` (zelfde als Sprint), dus Testbord en Sprint wijken nooit af. Let op: de vergelijkingsmetric is nu ROAS → CTR → hook rate; kosten-per-lead voor Leads-doelen staat nog op de lijst (bij Leads wordt dus op CTR vergeleken).
- **Advertentie-voorbeeld (`AdMockup.svelte`):** feed-vormig kaartje met de echte advertentietekst (boven), de hook of invalshoek in het beeldvlak (kleur per bewustzijnsfase), format-badge (video/carousel/static) en kop + CTA. Geen verzonnen tekst; "Advertentietekst nog niet geschreven" als die ontbreekt. Echte beelden volgen later (upload of generator).
- **Database:** migratie `supabase/migrations/0016_concept_doel.sql` (kolom `concepts.doel`, nullable; leeg = Aankoop). Het Testbord werkt zonder de migratie (alles "Aankoop"); het wijzigen van het doel geeft dan een duidelijke melding om 0016 te draaien. API: `api/concepts` case `doel_zetten`.
- **Bestanden:** `src/lib/testbord.ts`, `src/lib/components/app/AdMockup.svelte`, `src/routes/(app)/klanten/[id]/testbord/+page.{svelte,server.ts}`, `src/routes/(app)/+layout.svelte` (zijbalk), `src/routes/api/concepts/+server.ts`.
- **Verificatie:** typecheck 0 fouten; op de testklant: 4 tests / 14 varianten correct getoond; rangschikking en meerdere doelen getoond met nagebootste data. Visuele controle (screenshot) niet gelukt; sessie liep af tijdens de test.

### 2026-11-10 — Loop-bord als klantoverzicht (start herontwerp "visueel & simpel")
- **Wat:** het klantoverzicht toont nu de loop in vijf stappen — Begrijpen (intake + trigger map), Bepalen (testset), Maken (briefs), Testen (resultaten), Leren (winnaars) — als bord. Wat klaar is staat groen met vinkje, de stap die aan de beurt is licht op met een knop, wat volgt is gedempt; een gestreepte pijl onder de stappen toont dat elke ronde met wat je leerde begint. De kaart "Volgende stap" boven het bord komt uit dezelfde logica (`bouwLoop`) en kan dus nooit afwijken. De oude tegels/intake-kaart/status/verwijderen zijn naar een uitklapbare sectie "Details en klantbeheer" verplaatst.
- **Bestanden:** `src/lib/loop.ts` (zuivere logica: statussen per stap), `src/lib/components/app/LoopBord.svelte`, `src/routes/(app)/klanten/[id]/+page.{svelte,server.ts}` (telt nu ook concepten met een brief).
- **Vervolg (afgesproken):** Testbord (testrondes als boom: doel → [persona, alleen bij >1] → test/variabele → varianten; meerdere doelen/campagnes naast elkaar; vereist een `doel`-kolom op concepts), concept-kaarten met advertentie-mockup, visuele briefing/storyboard, live resultaten, 1-klik volgende ronde, rollen (klant/designer/strateeg).
- **Verificatie:** typecheck 0 fouten; op de testklant: Begrijpen en Bepalen klaar, Maken aan de beurt ("1 van 14 briefs"), hero-kaart en bord consistent. Visuele screenshot niet gelukt (venster op de achtergrond); opmaak gecontroleerd via afmetingen.

### 2026-11-09 — Automatische scorevoorstel voor nieuwe invalshoeken
- **Wat:** invalshoeken die je via het angle-raster toevoegt krijgen meteen een RICE-light **voorstel** (zelfde scorekaart als "Scores opnieuw voorstellen"), alleen voor de nieuwe; bestaande scores blijven onaangeroerd. Mislukt de AI-stap, dan staan ze er gewoon in zonder score (geen blokkade) en wijst de melding naar de matrix. Het scoren gebeurt na het opslaan; de scores worden daarna op naam bij de nieuwe invalshoeken gezet na opnieuw lezen (geen overschrijven van tussentijdse wijzigingen).
- **Bestanden:** `src/routes/api/trigger-map/+server.ts` (case `invalshoeken_toevoegen`, antwoord bevat nu `gescoord`), `src/lib/components/app/AngleRaster.svelte` (stuurt `clientId` mee, melding "Score is voorgesteld — controleer die in de matrix").
- **Verificatie:** typecheck 0 fouten; op de testklant één testinvalshoek toegevoegd: `gescoord: 1` in 6 s, score opgeslagen met eerlijke toelichting (bewijskracht Laag bij onderbouwing "Test"). Die testinvalshoek ("TEST auto-score: …", Oplossingsbewust) staat nog in de testklant en kan worden gearchiveerd.

### 2026-11-09 — Ad Library: formaat en bereik
- **Wat:** de Ad Library-scan haalt nu ook het formaat op (twee lichte extra zoekopdrachten met de `media_type`-filter VIDEO en IMAGE; ads in beide of geen van beide blijven "onbekend", bv. carousel/meme) en het door Meta **geschatte EU-bereik** (`eu_total_reach`) per ad. De samenvatting bevat `formaten` en `totaalBereik`; de AI noemt alleen wat in de data staat en benoemt bereik als schatting. Mislukt de formaat-opvraag, dan werkt de rest van de scan gewoon door.
- **Bestanden:** `src/lib/server/meta/ad-library.ts`, `src/lib/ad-library-analyse.ts`, `src/lib/server/ad-library-ai.ts`, intake-endpoint en -tekst.
- **Verificatie:** typecheck 0 fouten; berekening getest met nagebootste ads. Live niet getest: Meta weigert de Ad Library API nog tot de identiteitsverificatie (facebook.com/ID) is goedgekeurd. App "Creative Loop" (App ID 1000912803060539) is aangemaakt onder de bedrijfsportfolio, redirect-URI staat op de Vercel-callback.

### 2026-11-09 — Bottom-up planning (strategie + testplan)
- **Wat:** de planning-AI (plan van aanpak en testplan) begint nu bij de bewustzijnsfases het dichtst bij conversie (Meest bewust → Productbewust → Oplossingsbewust) en schaalt daarna op naar Probleembewust en Onbewust, tenzij de doelstelling (awareness) of de sturing anders vraagt; de gekozen volgorde wordt kort in `funnelaanpak` benoemd. Past bij de werkwijze uit de klantpresentaties (BOFU eerst, wat daar werkt voedt de bredere fases).
- **Verificatie:** plan gegenereerd voor testklant: sprints 1-2 Productbewust, 3-4 Oplossingsbewust, 5-6 Probleembewust, 7 Onbewust; Meest bewust overgeslagen omdat er geen invalshoeken zijn (geen opvulling met verzonnen sprints). De standaardsortering van concepten in de matrix/pakket blijft Onbewust → Meest bewust (leesvolgorde); alleen de plan-volgorde is bottom-up.
- **Migratie:** geen.

### 2026-11-09 — Meta Ad Library-scan in de intake (concurrenten)
- **Wat:** bij elke concurrent in Bron 3 een knop "Scan Meta Ad Library". Haalt de advertenties van die concurrent (NL) op via de **officiële** Ad Library API (`/ads_archive`, geen scraping), filtert op de juiste Facebook-pagina, rekent zelf looptijden/volume/platformen uit en laat de AI daar een korte analyse van schrijven (actief, langst lopend = winnaar-**indicatie**, terugkerende hoeken, aanbod/CTA, tempo). Resultaat komt in het bestaande veld "Lang draaiende ad formats (Meta Ad Library)" en is bewerkbaar. Snapshot-links worden door de code toegevoegd, niet door de AI (geen verzonnen URL's).
- **Bouw:** `src/lib/server/meta/ad-library.ts` (API + foutvertaling, probeert eerst het Meta-token van de klant, daarna het app-token `META_APP_ID|META_APP_SECRET`), `src/lib/ad-library-analyse.ts` (zuivere rekenlogica, client-safe), `src/lib/server/ad-library-ai.ts` (prompt), API `/api/intake` type `scan_adlibrary` (met toegangscontrole op de klant vóór het klant-token wordt gebruikt), knop in de intake-pagina.
- **Beperkingen (data):** de Ad Library geeft **geen formaat (video/static)** en geen prestaties terug; de analyse zegt dat expliciet en verwijst naar de snapshot-links. 'Lang lopend' is een aanwijzing, geen bewijs.
- **Verificatie:** rekenlogica getest met voorbeelddata (paginafilter, looptijden, actief/gestopt, 0 treffers bij onbekend merk); AI-prompt getest via de proxy met die data (volgt de regels, voorzichtig, geen verzonnen feiten); foutafhandeling (geen toegang) getest. **NIET live getest tegen Meta:** lokaal zijn `META_APP_ID` en `META_APP_SECRET` leeg en er is voor geen klant een Meta-account gekoppeld. Voor gebruik: Meta koppelen voor de klant (Sprint → Meta-koppeling) of de app-gegevens instellen (ook in Vercel), en de Ad Library API-toegang bij Meta activeren (identiteitsverificatie + voorwaarden op facebook.com/ads/library/api). Via de Meta-connector in de sessie is wel vastgesteld dat de Ad Library voor NL echte advertenties teruggeeft (229.610 treffers voor 'kleding').
- **Migratie:** geen.

### 2026-11-09 — Resultaten-scorebord (Sprint): wie leidt, hoe zeker, wat stoppen
- **Wat:** bovenaan de Sprint-tab een scorebord per **testgroep** (zelfde bewustzijnsfase + geteste variabele): wie leidt, hoe zeker dat is (z-toets op CTR/hook rate: 95% zeker / ~80% / te vroeg; bij ROAS op basis van drempels + voorsprong), wat er nog ontbreekt ("nog €45 spend, nog 2 dagen"), en **stop-advies** voor varianten die ≥40% achter de leider liggen mét voldoende data. Status per groep: Klaar om te beslissen / Loopt nog / Beslist / Wacht op cijfers. Bij 'klaar' één klik "Markeer … als winnaar" (zet de invalshoek op 'Getest — werkt'). Werkt ook met handmatig ingevulde cijfers (met eerlijke waarschuwing: geen drempelcontrole) en rekent live mee.
- **Bouw:** `src/lib/resultaten.ts` (zuivere beslislogica), `src/lib/components/app/ResultatenBord.svelte`. De **guardrail** (`meta/guardrail.ts` + `sync.ts`) groepeert nu óók op bewustzijnsfase i.p.v. funnelfase, zodat Onbewust- en Probleembewust-concepten niet meer met elkaar worden vergeleken (andere doelgroepen).
- **Bestond al (WERKLOG 2026-08-12):** Meta-OAuth, dagelijkse sync (cron 05:00 UTC), koppelen via `[CL-xxxxxxxx]` in de ad-naam, auto-winnaar-guardrail (≥€75 spend, ≥1000 impressies, ≥3 dagen, ≥5 aankopen bij ROAS, ≥15% voorsprong). Nieuw hier is vooral het overzicht, de zekerheid, het stop-advies en de consistente testgroepen.
- **Verificatie:** beslislogica getest met 5 scenario's (handmatig, duidelijke winnaar + stop, te weinig data, al-beslist, andere fase apart); UI getest op testklant met handmatige CTR (live stand, daarna teruggezet). **Niet getest:** met echte Meta-data (geen advertentieaccount gekoppeld aan een klant; vereist OAuth-toestemming en Meta App Review `ads_read`).
- **Migratie:** geen.

### 2026-11-09 — Tastbare briefing: advertentietekst + Briefing-pakket
- **Wat:** (1) Creatie-tab: per concept een **advertentietekst** (primaire tekst, kop, omschrijving) met AI-generatie en tekentellers (adviesgrenzen 300/40/30; de eerste ±125 tekens van de primaire tekst zijn zichtbaar voor 'Meer tonen'). (2) Nieuwe pagina **Briefing-pakket** (`/klanten/[id]/pakket`, knop rechtsboven in Creatie): alle concepten gegroepeerd per bewustzijnsfase (met de taak per fase), per concept brief + script + advertentietekst + referentie/props; voortgangsregel (hoeveel concepten al een brief/script/tekst hebben); **Printen/opslaan als PDF** (sidebar en klantkop verdwijnen in print), **Kopieer als tekst** en **Download (.md)**. Bedoeld als deliverable voor het contentteam of de klant.
- **Opslag zonder migratie:** de advertentietekst leeft in het bestaande `concepts.script` (jsonb) onder `advertentie`. `schoonScript` bewaart het; "Genereer script" schrijft alleen de 5 beats opnieuw en laat de advertentietekst staan (anders had het die gewist). API-type `advertentie_gen`, module `advertentie` in `ai_logs`.
- **Prompt-guardrail:** geen verzonnen feiten/cijfers/kortingen; fase bepaalt de taak van de tekst; CTA-knop niet herhalen.
- **Verificatie:** typecheck 0 fouten; op testklant: advertentietekst genereren (staat na reload nog), script genereren laat de tekst staan, brief genereren; pakketpagina toont 11 concepten in 4 fases met het uitgewerkte concept compleet; Markdown-opmaak gecontroleerd. **Niet getest:** daadwerkelijk printen/PDF (print-CSS aanwezig, maar niet in een printvoorbeeld bekeken) en kopiëren naar het klembord in een echte browser-tab.
- **Migratie:** geen.

### 2026-11-09 — Angle-raster: verlangen × bewustzijnsfase → invalshoeken (Testruimte)
- **Wat:** in de Testruimte, onder de invalshoeken, de knop "Nieuwe invalshoeken bedenken". Stap 1: kies tot 6 verlangens (pijnpunten/wensen/bezwaren uit de actieve trigger map). Stap 2: kies bewustzijnsfases (standaard Probleem-/Oplossings-/Productbewust). De AI stelt per vak één invalshoek voor (leeg vak toegestaan: "Geen sterke hoek"); jij vinkt aan/past namen aan en voegt toe. Idee uit de Meta-video (Life-Force 8 × 5 stages = 40 angles), maar met de échte signalen van de klant als rijen i.p.v. de generieke acht.
- **Bouw:** `src/lib/server/angle-grid-ai.ts` (prompt + validatie/normalisatie, max 1 per vak), `src/lib/components/app/AngleRaster.svelte`, API `/api/trigger-map` types `raster` (genereren, slaat niets op, logt in `ai_logs` module `raster`) en `invalshoeken_toevoegen` (server-side samenvoegen: gearchiveerde invalshoeken en scores blijven behouden, dubbele namen overgeslagen). Testruimte-loader levert `versieId` + `signalen`.
- **Kwaliteit/guardrail:** eerste versie verzon bewijs ("na 50 wasbeurten", "getest") in Productbewust → prompt-regel "verzin nooit feiten; bewijs alleen uit de data, anders vak leeg"; daarna beschrijven Productbewust-voorstellen wat er te zíen is. Restrisico: sommige 'klantuitspraken' zijn parafrases — strateeg blijft controleren.
- **Kleinigheid:** RICE-score op chips/startset afgerond (was `2.6666666666666665`).
- **Verificatie:** typecheck 0 fouten; op testklant: 3 verlangens × 3 fases → 9 voorstellen (2×, ~1-2 min), 3 toegevoegd → backlog 11→14, bestaande scores intact (11), nieuwe 3 'niet gescoord'. Nieuwe invalshoeken krijgen nog geen score: via "Scores opnieuw voorstellen" in de matrix.
- **Migratie:** geen.

### 2026-11-09 — Trigger Map in Focusmodus (één sectie tegelijk)
- **Wat:** Trigger Map-pagina herbouwd volgens het Focusmodus-ontwerp: emerald samenvatting-hero (één zin uit eerste wens + pijnpunt + bezwaar, met voortgangsring = aandeel secties met ≥3 signalen, persona's ≥1), sectie-rail met mini-balkjes, één sectie tegelijk bewerken (deeplink `?sectie=…`), signalen als rijen met inline bewerken + enter-om-toe-te-voegen, persona's als kaarten met Wil/Twijfelt-pills (meegroeiend), navigatie Terug/Volgende en aan het eind "Naar de testruimte". Nieuwe componenten in `src/lib/components/app/triggermap/` (`SamenvattingHero`, `SectieRail`). Opslaglogica (autosave, versies, opnieuw genereren, oude versie alleen-lezen) ongewijzigd.
- **Bewust weggelaten:** bron-labels per signaal en AI-suggestie-chips uit het ontwerp — die data bestaat nog niet (signalen zijn platte strings). Kandidaat voor later (bron-tracking in de intake-parser).
- **Verificatie:** `npm run check` 0 fouten; bekeken op Soccerfanshop (alleen lezen): sectie wisselen via rail → URL `?sectie=`, actieve rij, Volgende-label, persona-kaarten (4), smalle weergave stapelt. Bewerken/opslaan niet getest op echte klant.
- **Migratie:** geen.

### 2026-11-09 — Look & feel (Online Klik-huisstijl) + bewustzijnsfases i.p.v. TOFU/MOFU/BOFU · `9f57b2e` `8fec044` `1869fca` `3b2e67b` `6917320`
- **Wat (look & feel):** app-brede design-tokens (emerald/actie/limoen/gras/oranje), Mic 32 New Rounded voor koppen + Rubik body (`static/fonts`, `app.css`, `app.html`); sidebar als pills met loop-stepper (✓ = echte klantvoortgang uit `clients.huidige_fase`); Testruimte herbouwd volgens het Focusmodus-ontwerp (hero met live som, genummerde dimensiekaarten, horizon-meter, startset). Logica ongewijzigd.
- **Wat (spoor B, stap 1):** vijf bewustzijnsfases (Onbewust → Meest bewust, elk met een "taak": verhaal / benoem de pijn / jouw aanpak vs. de rest / bewijs & bezwaren / prijs & deadline) vervangen TOFU/MOFU/BOFU overal in de interface. Invalshoek krijgt optioneel veld `bewustzijn`; oude data valt terug via `bewustzijnUitFunnel` (TOFU→Probleembewust, MOFU→Oplossingsbewust, BOFU→Productbewust). De legacy `funnelfase` blijft intern bestaan en wordt uit de bewustzijnsfase afgeleid, zodat AI-prompts en bestaande klanten blijven werken. Matrix-tabel: één kolom "Bewustzijnsfase" i.p.v. Funnelfase + Awareness. Sortering volgt Onbewust → Meest bewust.
- **Bron:** Meta-video @dakota.hermes/AdClass (Life-Force 8 × 5 bewustzijnsfases = 40 angles) — zie memory `angle-matrix-framework`.
- **Verificatie:** `npm run check` 0 fouten; Testruimte + matrix bekeken op Soccerfanshop (alleen lezen): bestaande invalshoeken tonen als Probleem-/Oplossings-/Productbewust met taak als hover-tekst; interacties (som, meter, horizon) getest.
- **Stap 2 (AI-prompts, getest op testklant):** trigger map-generator, scorekaart, matrix, strategie, testplan, spar, sprint en creatie praten nu in bewustzijnsfases. De AI kiest `bewustzijn` (trigger map) resp. `awareness` (matrix, verplicht enum); de legacy-`funnelfase` wordt achteraf afgeleid (`funnelUitBewustzijn`), zodat meta-sync, guardrail en de concepten-kolom blijven werken. Trigger map vraagt nu 8-12 invalshoeken verdeeld over de vijf fases (met de "taak" per fase) en laat hetzelfde verlangen in meerdere fases terugkomen als een écht andere boodschap. Sprint-varianten erven de fase van de winnaar (AI kiest 'm niet meer). Strategie-instelling "Funnellagen" → "Bewustzijnsfases" (config-sleutel `funnelfases` → `bewustzijnsfases`). `funnelaanpak` blijft de opslagsleutel van het plan (bestaande data), met een nieuw label in de UI.
- **Getest (2026-11-09, testklant "Test met Zowie", 20 fictieve Bron 1-antwoorden):** trigger map → 11 invalshoeken: Onbewust 2, Probleembewust 3, Oplossingsbewust 3, Productbewust 3, Meest bewust 0 (terecht: geen aanbod/deadline in de intake). Social proof/garantie zit in Productbewust, niets in de vroege fases; het maat-thema komt in meerdere fases terug met een andere boodschap. Scorekaart gebruikt de fase ('oplossingsbewust = kleiner maar warmer'). AI-voorstel matrix → 9 concepten, allemaal met `awareness`; format/structuur/creator constant per fase; CTA groeit mee (Meer informatie → Bekijk hoe het werkt → Bekijk de garantie). Testruimte-startset → 2 concepten met fase uit de invalshoek. Bewerken getest: fase wijzigen in de matrix (blijft na reload, sortering volgt), signaal toevoegen/verwijderen in de Trigger Map (blijft na reload). Aandachtspunt: 8 van 11 invalshoeken krijgen prioriteit Hoog (RICE-drempel ≥8 is ruim; bestaand gedrag, niet door deze wijziging).
- **Eerdere blokkade (opgelost):** de usage-proxy gaf 502 PROVIDER_REQUEST_FAILED omdat de maandelijkse bestedingslimiet ($200) van de Anthropic-organisatie achter de proxy-connectie op was (herstel 1 dec). Opgelost door de limiet te verhogen. NB: de proxy dwingt geen JSON-schema af, daarom normaliseert `normaliseerBewustzijn()` de AI-uitvoer.
- **Migratie:** geen (invalshoeken is jsonb; `concepts.awareness` bestond al).

### 2026-08-18 — Spar-modus bij de Matrix (Fase 1) + creator_type-fix + AI-timeout 300s
- **Spar-modus (Fase 1):** naast het one-shot "genereren" kun je nu bij de Matrix éérst met een AI-strateeg sparren (vragen stellen, suggesties bespreken) en pas bij akkoord doorvoeren. Nieuw herbruikbaar `SparPaneel.svelte` + `POST /api/spar` (`bericht` = chatbeurt met strateeg-persona die trigger map + huidige matrix + je middelen/config ziet; `samenvatting` = distilleert het gesprek tot een concrete sturing; `wis`). "Voer besproken wijzigingen door" → hergenereert de matrix met die sturing (via de bestaande 3-weg-flow). Multi-turn chat-helper `claudeChat` toegevoegd in `claude.ts` (proxy `messages`-array, prose-antwoord).
- **Gesprek bewaren:** migratie `0012_spar.sql` → tabel `spar_berichten` (per klant + onderwerp, RLS). Opslaan is niet-fataal: werkt ook vóór de migratie (dan zonder historie). Loader `matrix/+page.server.ts` leest de historie (graceful, alleen `.data`). Dit is de opmaat naar het self-learning loop-geheugen (Fase 2).
- **creator_type-fix:** matrix-prompt dwingt nu samenhang af met de beschikbare middelen — static-only ⇒ "Klantvisual"/"Merk-eigen visual", NOOIT "UGC"/"Klant/UGC" (dat impliceert video).
- **AI-timeout:** alle AI-routes van 60s → **300s** (Vercel Pro-max) om `FUNCTION_INVOCATION_TIMEOUT` bij grote plan/matrix-generaties te voorkomen.
- **Nog te doen door gebruiker:** migratie 0011 (Meta) én 0012 (spar) draaien in Supabase. `npm run check` = 0 errors.
- **Volgende (Fase 2):** per-klant loop-geheugen — gedistilleerde besluiten/feedback/winnaars die in élke generatie meewegen, zodat de loop cumulatief slimmer wordt.

### 2026-08-12 — Sprint-automatisering: Meta-koppeling (OAuth + dagelijkse sync + guardrail)
- **Wat:** advertentieresultaten worden automatisch uit Meta gelezen en per concept verwerkt. Volledig **additief** — zonder koppeling verandert er niets aan de bestaande flow.
- **Datamodel (migratie `0011_meta_ads.sql` — MOET gedraaid worden):** `meta_connections` (1 gekoppeld advertentieaccount + long-lived token per klant), `meta_ads` (advertentiecatalogus + ruwe metrics per sync), en op `concepts`: `meta_ad_external_id`, `meta_auto_sync`, `meta_metrics`, `meta_laatste_sync`, `auto_winnaar`. RLS via `can_access_client()`.
- **Serverlaag (`src/lib/server/meta/`):** `client.ts` (Graph API v21: token-exchange, `/me/adaccounts`, ads, dagelijkse insights, paging + retry), `metrics.ts` (insights → hook/hold/ctr/roas/cpa in dezelfde units als de Sprint-invoer), `guardrail.ts` (conservatieve auto-winnaar), `sync.ts` (orkestratie). Client-safe helpers in `src/lib/meta.ts`.
- **Automatisch koppelen:** zet de code `[CL-xxxxxxxx]` (zie per concept in de Sprint-UI) in de Meta-advertentienaam → de sync koppelt concept ⇢ advertentie vanzelf. Handmatig koppelen via dropdown kan ook.
- **Guardrail (drempels in `src/lib/meta.ts`):** markeert alleen een winnaar bij ≥ €75 spend, ≥ 1000 impressies, ≥ 3 dagen actief, ≥ 5 aankopen (bij ROAS) én ≥ 15% voorsprong op de beste andere variant in de testgroep (zelfde funnelfase + variabele). Nooit als er al een winnaar is. Winnaar → invalshoek op "Getest — werkt". **Vervolgronde blijft altijd 1 klik handmatig.**
- **OAuth + cron:** `GET /api/meta/connect` (FB-dialog + CSRF-cookie), `GET /api/meta/callback` (token-exchange + opslaan), `POST /api/meta` (accounts/set_account/sync_now/disconnect/link/toggle_auto_sync), `GET /api/cron/meta-sync` (dagelijks 05:00 UTC via `vercel.json`, beschermd met `CRON_SECRET`). `/api/cron` toegevoegd aan de publieke paden in `hooks.server.ts`.
- **UI:** `MetaKoppeling.svelte`-paneel bovenaan de Sprint (koppelen/sync-nu/account wisselen/verbreken) + per concept: koppel-dropdown, "metrics automatisch bijwerken"-schakelaar, ad-code, en een "Automatisch gemarkeerd"-badge.
- **Env (nieuw, in Vercel zetten):** `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`, `META_API_VERSION`, `CRON_SECRET`. Meta-app vereist `ads_read` (Advanced Access via App Review) + de redirect-URI whitelisten.
- **Robuustheid:** de Sprint-loader leest alleen `.data` (nooit throw) → vóór de migratie valt het Meta-paneel weg en werkt de pagina onveranderd. Cron-route getest: 401 zonder secret, bereikt handler mét secret. `npm run check` = 0 errors.

### 2026-08-05 — AI-calls via de usage-proxy (i.p.v. directe Anthropic SDK)
- **Wat:** alle Claude-calls lopen nu via de Online Klik **usage-proxy** i.p.v. de Anthropic-SDK. `claude.ts` herschreven: POST naar `API_USAGE_URL` met header `X-API-Usage-Key` en body `{ connection_id, payload:{ system, messages, max_tokens } }` → antwoord `{ output, usage }`. `trigger-map-generator.ts` gebruikt nu ook `claudeJSON` (geen directe SDK meer).
- **Belangrijk contract:** de proxy ondersteunt GEEN `output_config` (json_schema) of `thinking`. JSON dwingen we af via de system-prompt (onze prompts vragen al "UITSLUITEND valide JSON" + extra strikte suffix) en een **robuuste parser** (strip ```-fences, val terug op eerste `{…}`/`[…]`). `effort` wordt genegeerd (signatuur blijft voor compat). Retry op 429/5xx + nette overbelast-melding.
- **Signatuur `claudeJSON` ongewijzigd** → alle callers (matrix-ai, strategie-ai, scoring-ai, sprint-ai, intake-parser, web-scan) werken onveranderd.
- **Env:** nieuw `API_USAGE_KEY` (SECRET, alleen env — repo is publiek), `API_USAGE_CONNECTION_ID`, `API_USAGE_URL`. `ANTHROPIC_API_KEY` niet meer gebruikt. **MOET in Vercel gezet worden** anders faalt AI op live.
- **Geverifieerd (curl):** proxy-response `{output, usage}`; met strikte JSON-instructie geeft 'ie schone JSON; `system` wordt doorgegeven. NB nog te testen op live: document-upload (content-blokken/vision via de proxy) + grote JSON-generaties.
- **Migratie:** geen. Beveiliging: de in de chat geplakte key moet geroteerd worden.

### 2026-08-02 — Rondleiding omgebouwd tot spotlight-tour (zelf-bijwerkend)
- **Wat:** de statische carousel is vervangen door een echte **spotlight-rondleiding** die je door de tool **navigeert**: hij loopt de fasen langs (Overzicht → Intake → Trigger Map → Matrix → Brief → Sprint → Learnings), spotlight per element met korte uitleg (waarom + hoe), en dimt de rest. Klik-blocker tijdens de tour; Vorige/Volgende; scroll-into-view; herberekent bij scroll/resize.
- **Zelf-bijwerkend:** de stappen worden **runtime uit de DOM ontdekt** — elk element met `data-tour-title` (+ `data-tour-text`, optioneel `data-tour-order`) wordt automatisch een spotlight-stap. Een nieuwe functie annoteren = 'm automatisch in de rondleiding opnemen; lege secties worden overgeslagen. De sectie-volgorde (routes) staat centraal in `Rondleiding.svelte`.
- **Techniek:** `Rondleiding.svelte` herschreven (engine met `goto` tussen routes + spotlight via box-shadow-cutout + tooltip). Layout geeft `base` mee (huidige of eerste klant). `data-tour-*`-markeringen toegevoegd op sleutel-elementen: Creative Loop, volgende-stap, dashboard, intake-tabs, document-upload, trigger map-secties + persona's, plan van aanpak, test-backlog, matrix-tabel, brief, sprint, learnings.
- **Verificatie:** `svelte-check` 0 fouten; dev-server boot schoon. Visueel te testen op live (login vereist). NB: migratie 0010 (rondleiding_gezien) blijft nodig voor auto-start-onthouden.
- **Migratie:** geen nieuwe (0010 uit vorige stap).

### 2026-08-01 — Rondleiding + extra formats
- **Rondleiding:** nieuwe stap-voor-stap rondleiding (`Rondleiding.svelte`, eigen lichte overlay, 8 stappen: welkom → overzicht/loop → intake → trigger map → plan/matrix → brief → sprint/learnings → tips). Knop "Rondleiding" in de zijbalk (altijd te openen). **Auto-start voor nieuwe gebruikers** (1×) via profielvlag `profiles.rondleiding_gezien` (strikt `=== false`, dus vóór migratie geen auto-start). Sluiten zet de vlag via `POST /api/profiel` (service-role).
- **MIGRATIE 0010_rondleiding.sql (MOET GEDRAAID WORDEN):** `profiles.rondleiding_gezien boolean not null default false`. Tot die tijd werkt de knop wel, maar wordt de vlag niet onthouden.
- **Formats uitgebreid:** `FORMATS` in matrix.ts kreeg **Video, AI video, AI static** (naast Video UGC, Static, Motion graphic, Carousel, Anders). Werkt door in de matrix-combobox, de "beschikbare middelen"-config en de format-bewuste brief.
- **Bestanden:** `Rondleiding.svelte` (nieuw), `(app)/+layout.svelte` (knop + auto-start + mount), `api/profiel/+server.ts` (nieuw), `database.types.ts` (profiles), `matrix.ts` (FORMATS), migratie 0010.
- **Verificatie:** `svelte-check` 0 fouten; dev-server boot schoon.

### 2026-08-01 — Achtergrondtaken: generaties lopen door bij navigeren + app-brede indicator
- **Wat:** AI-generaties werden nooit echt afgebroken (gewone fetch zonder abort), maar de spinner leefde alleen in dat ene tabje. Nu: een **gedeelde taak-store** (`src/lib/taken.svelte.ts`) + **app-brede indicator** (rechtsonder, blijft staan bij navigeren) en **auto-verversen** na afloop, zodat het resultaat verschijnt ook als je intussen weg bent geklikt.
- **Techniek:** `postJSON(url, body, { taak, ververs })` registreert een achtergrondtaak (label) en roept bij `ververs:true` na succes `invalidateAll()` aan. Gekoppeld: trigger map (form-action), plan van aanpak, matrix genereren (ververs), brief (ververs), sprint-analyse (ververs), volgende testronde (ververs), testplan, document-analyse, website/reviews-scan. Optimistische lokale updates verwijderd waar `ververs:true` (voorkomt dubbele rijen; data herlaadt uit DB).
- **Aanleiding:** gebruiker: taak stopte gevoelsmatig bij tabje-wisselen; moet doorlopen.
- **Verificatie:** `svelte-check` 0 fouten; dev-server boot schoon.
- **Migratie:** geen.

### 2026-07-31 — Afstem-interview verfijnd: KPI-doel, data-gedreven rondes, parallel & 3-weg genereren
- **Wat (feedback-ronde op fase 1+2):**
  - **KPI/Doelstelling** in de teststrategie-config: keuze (Awareness/engagement · Balans · Direct rendement) + vrij **target**-veld (bv. "streef-ROAS 3, max CPA €30"). Het plan-AI stemt de succescriteria per sprint daarop af (full-funnel, maar met resultaat-guardrails; BOFU hard op ROAS/CPA).
  - **Data-gedreven testen (niet padden):** het plan doet alleen wat de data rechtvaardigt — past alles in één test (≤ max varianten) → één test en door; méér relevante invalshoeken dan de cap → meerdere invalshoek-rondes (winnaar draagt door). Config: **max varianten per test** (default 3).
  - **Parallel testen:** toggle + `ronde`-veld op sprints — sprints met hetzelfde rondenummer draaien parallel (bv. TOFU + BOFU tegelijk). Weergegeven als "Ronde X"-badge.
  - **Funnel-herclassificatie:** plan- én matrix-AI corrigeren nu een duidelijk verkeerd geplaatste invalshoek (bv. social proof/"9,2 uit 4.400+ reviews" in TOFU → MOFU/BOFU), ook op oude backlogs.
  - **Invalshoeken breder gebruiken:** prioriteren op RICE i.p.v. uitsluiten.
  - **3-weg genereren:** de ja/nee-melding is nu een dialog met **Volledig opnieuw (bestaande archiveren) · Toevoegen · Annuleren**; nieuwe API-actie `archiveer_alle`.
- **Bestanden:** `strategie-ai.ts` (config + prompt: data-gedreven/parallel/rondes/KPI/herclassificatie/breed), `matrix-ai.ts` (MatrixConfig doel/target + herclassificatie + KPI), `testplan.ts` (`ronde?` op TestplanSprint), `api/strategie` + `api/concepts` (nieuwe config + `archiveer_alle`), `matrix/+page.svelte` (config-UI uitgebreid, 3-weg-dialog, ronde-badge, `huidigeConfig()`).
- **Verificatie:** `svelte-check` 0 fouten; dev-server boot schoon. End-to-end te testen op live.
- **Migratie:** geen.

### 2026-07-30 — Trigger Map→Matrix fase 2: afstem-interview (plan van aanpak → goedkeuren → matrix)
- **Wat:** een afstemstap tussen trigger map en matrix. Bovenaan de matrix een **"Plan van aanpak"-kaart**: (1) teststrategie-config (persona's/funnellagen/middelen — verplaatst hierheen), (2) knop "Plan van aanpak opstellen" → de AI Content Strategy Expert stelt een strategisch plan voor (samenvatting, doelgroep, funnelaanpak, **sprints volgens schoon-testen**, aannames), (3) feedback-box → "Verfijn met feedback" (itereren), (4) "Goedkeuren & matrix genereren" → slaat het plan op als **testplan** (matrix ↔ testplan consistent) én genereert de matrix mét het goedgekeurde plan als strikte sturing.
- **Schoon testen afgedwongen:** per funnellaag één invalshoek-test-sprint die ÁLLE invalshoeken van die laag samen draait (variabele = invalshoek), daarna vervolg op de winnende variabele. Lost de matrix↔testplan-mismatch (3×3 vs 6 pairwise sprints) op.
- **Bestanden:** `testplan.ts` (`StrategiePlan`-type, hergebruikt `TestplanSprint`), `strategie-ai.ts` (nieuw: `genereerStrategiePlan`, effort medium, funnel-rubriek + schoon-testen + sturing + feedback), `api/strategie/+server.ts` (nieuw: `plan` genereert/verfijnt, `goedkeuren` slaat plan op als `clients.testplan`), `matrix/+page.svelte` (afstem-UI + `genereerMatrix(extraRichtlijnen)` neemt plan mee), `matrix/+page.server.ts` (personas al meegeladen in fase 1).
- **Aanleiding:** vertrouwen/mens-in-de-lus; matrix presenteerde zich als "af" zonder senior-check. Nu: afstemmen → goedkeuren → definitieve, consistente matrix + testplan.
- **Verificatie:** `svelte-check` 0 fouten; dev-server boot schoon. End-to-end te testen op live.
- **Migratie:** geen (plan wordt opgeslagen in bestaande `clients.testplan`).

### 2026-07-30 — Trigger Map→Matrix fase 1: sturing, funnel-logica & scorekaart-borging
- **Wat (fundament voor de afstem-interviewstap):** (1) **Teststrategie-configuratie** op de matrix: optioneel persona's / funnellagen / beschikbare middelen kiezen (chips, leeg = geen beperking) → gaat als harde sturing de generatie in (`MatrixConfig` in matrix-ai: filtert funnel-scope, beperkt persona's, kiest format alleen uit gekozen middelen). (2) **Funnel-plaatsingsrubriek** in de trigger map- én matrix-prompt: social proof/reviews/vergelijkingen horen in MOFU/BOFU, nooit in TOFU (lost de "9,2 uit 4.400+ reviews in TOFU"-fout op). (3) **Scorekaart-borging**: bij "Opzet genereren" wordt de backlog eerst automatisch gescoord als 'ie nog ongescoord is, zodat de prioriteit RICE-gedreven is i.p.v. een losse LLM-gok. (client-side vóór de generatie → geen dubbele AI-call/timeout).
- **Bestanden:** `trigger-map-generator.ts` (funnel-rubriek), `matrix-ai.ts` (MatrixConfig + rubriek + scope), `api/concepts` (config parsen + doorgeven), `matrix/+page.server.ts` (personas meeladen), `matrix/+page.svelte` (config-paneel + borging).
- **Aanleiding:** feedback dat de matrix soms fout/onvolledig is (funnel-plaatsing), geen sturing vooraf, en "niet gescoord"-backlog → hol RICE.
- **Verificatie:** `svelte-check` 0 fouten. Fase 2 (afstem-interview: plan van aanpak → goedkeuren → consistente matrix + testplan) volgt.
- **Migratie:** geen.

### 2026-07-28 — PDF-chunking: grote PDF's binnen de 60s-timeout
- **Wat:** grote PDF's liepen tegen Vercel's 60s-limiet (`FUNCTION_INVOCATION_TIMEOUT`) bij het visueel lezen. Opgelost door de PDF **client-side in pagina-batches** te splitsen (`src/lib/pdf-split.ts` met `pdf-lib`, 3 pagina's per batch), elke batch los via `parse_bestand` te laten lezen (elk onder 60s) en de deel-voorstellen samen te voegen (`mergeVoorstellen`: Bron 1/2 per vraag samenvoegen, Bron 3 per naam, Bron 4 per bron_naam). Voortgang zichtbaar ("deel 2/5…"). Blijft op het gratis Vercel-plan.
- **Techniek:** `pdf-lib` toegevoegd (client-side, dynamisch geïmporteerd; `ignoreEncryption: true`). Base64 in blokken (call-stack-veilig). `postParse`-helper met nette foutmelding. Afbeeldingen/Excel/tekst ongewijzigd (één call).
- **Aanleiding:** klantenquête-PDF (grafiek-zwaar) gaf FUNCTION_INVOCATION_TIMEOUT op live.
- **Keuze gebruiker:** chunking bouwen i.p.v. Vercel Pro (gratis blijven).
- **Verificatie:** `svelte-check` 0 fouten. End-to-end te testen op live met de grote PDF.
- **Migratie:** geen.

### 2026-07-25 — Document-upload accepteert PDF, Excel & afbeeldingen (branch)
- **Wat:** de document-upload verwerkt nu ook **PDF's, afbeeldingen en Excel** — niet meer alleen platte tekst. Cruciaal: PDF's/afbeeldingen worden **visueel door Claude gelezen** (document/image-block), dus óók **tabellen, grafieken en tekst-in-afbeeldingen** (en gescande PDF's). Excel gaat via SheetJS → CSV per tabblad. Daarna alles door de bestaande 4-bronnen-parser (routering, aanvullen, diepgang blijven werken).
- **Techniek:** `claudeJSON` accepteert nu ook content-blokken (`string | ContentBlockParam[]`). Nieuwe `parseIntakeBestand(base64, mediaType)` in intake-parser bouwt een document/image-block (SDK 0.110 native `Base64PDFSource`/`Base64ImageSource`, geen beta-header) — effort 'low' i.v.m. vision-latentie/Vercel-timeout. Nieuwe API-type `parse_bestand` (max ~12 MB, whitelist pdf/png/jpeg/webp/gif; gelogd module intake_parse). Client: PDF/afbeelding → base64 (FileReader) → `parse_bestand`; Excel/tekst → tekst → `parse`. Filter-logica gerefactord naar `bouwVoorstel`. Library `xlsx` toegevoegd (dynamisch geïmporteerd, SSR-safe); pdf.js is NIET nodig gebleken (vision leest PDF direct) en weer verwijderd.
- **Aanleiding:** klant leverde PDF's met grafieken/tabellen + Excel; pure tekst-extractie miste de visuele inhoud.
- **Grenzen (eerlijk):** grote PDF's (veel pagina's) kosten meer vision-tokens en kunnen richting de 60s-Vercel-timeout lopen; max ~12 MB per bestand.
- **Verificatie:** `svelte-check` 0 fouten; dev-server boot schoon; SDK-typen bevestigd. Nog end-to-end te testen met echte PDF/Excel/afbeelding (login vereist) → branch `bestand-formaten`.
- **Migratie:** geen.

### 2026-07-17 — Klantomgeving: sidebar verbergt andere klanten binnen een klant · `55416e5`
- **Wat:** binnen `/klanten/[id]` toont de sidebar alleen de huidige klant (naam + status, kopje "Klantomgeving") + een "← Alle klanten"-teruglink; de volledige klantenlijst is dan verborgen. Op het hoofdoverzicht blijft de lijst zichtbaar. Belangrijk voor klantpresentaties (geen andere klantnamen in beeld).
- **Verificatie:** `svelte-check` 0 fouten; gebruiker akkoord. Live.
- **Migratie:** geen.

### 2026-07-17 — Rijkere concurrentie-extractie: Meta Ad Library-veld + uitputtender · `309268d`
- **Wat:** document-parser Bron 3 kreeg `meta_ad_library` + `tiktok_observaties` velden — ad-library-data (langlopende formats, funnelverdeling, video-ratio) landt nu in het juiste veld i.p.v. in "invalshoeken". Prompt dwingt diepgang af (bullets per veld, kwantificeren, niets weglaten); extractie-effort low→medium. Modal toont + past de nieuwe velden toe.
- **Aanleiding:** gebruiker: te dunne velden en "Lang draaiende ad formats" bleef leeg.
- **Verificatie:** `svelte-check` 0 fouten; gebruiker akkoord. Live.
- **Migratie:** geen (`meta_ad_library`/`tiktok_observaties` bestonden al als kolommen).

### 2026-07-17 — Document-upload: routeert naar 4 bronnen + aanvullen i.p.v. overschrijven · `08a8f50`
- **Wat:** de document-analyse verdeelt de inhoud nu over **alle vier de bronnen** i.p.v. alleen Bron 1/2. Een reviews-uitdraai gaat naar **Bron 4** (samengevat in Positief/Negatief/Gaps), concurrentie-info naar **Bron 3** (per concurrent: invalshoeken/website-taal/kansen), eindklant-interview naar Bron 1/2. En al ingevulde velden worden standaard **aangevuld** (samengevoegd) i.p.v. overschreven — per Bron 1/2-veld te kiezen (Aanvullen/Overschrijven); Bron 3 matcht op naam (aanvullen of nieuwe rij), Bron 4 op bron_naam.
- **Aanleiding:** gebruiker: (1) tweede document overschreef i.p.v. aanvullen; (2) een reviews-uitdraai werd op klantgesprek/interne-interview-vragen gemapt i.p.v. reviews/concurrentie.
- **Bestanden:** `intake-parser.ts` (schema+prompt: bron1-4 routering), `api/intake` (`parse` geeft bron3/bron4 terug; `bron3.insert`/`bron4.insert` accepteren nu beginwaarden + geven de rij terug), `intake/+page.svelte` (upload-modal toont Bron 3/4-secties, aanvullen/overschrijven-toggle, merge-logica op naam/bron_naam, reseed via bestaande scanKey).
- **Verificatie:** `svelte-check` 0 fouten. Nog end-to-end te testen (login + Claude) → branch `intake-routing`.
- **Migratie:** geen.

### 2026-07-16 — Creative Loop compact op werk-tabs · `51df67c`
- **Wat:** de volledige ronde Creative Loop blijft op de **overzicht-tab**; op alle **andere tabs** een nieuwe **compacte horizontale stepper** (`CreativeLoopCompact.svelte`) — 4 fases (Intake→Trigger Map→Matrix→Sprint), huidige gemarkeerd, afgeronde met groen bolletje, klikbaar naar de fase-tab. Layout kiest op basis van `pad === base`. Scheelt veel verticale ruimte op de werk-tabs.
- **Verificatie:** `svelte-check` 0 fouten; gebruiker akkoord. Gemerged naar main + live.
- **Migratie:** geen.

### 2026-07-16 — UX: klikbare Creative Loop + klant-overzicht als reis-dashboard (branch)
- **Wat:** (1) De **Creative Loop-ring is klikbaar** — elk knooppunt linkt naar de bijbehorende fase-tab (intake/triggermap/matrix/sprint). `CreativeLoop.svelte` kreeg optionele `base`-prop + `FASE_TAB`-mapping; knooppunten worden in een SVG-`<a>` gewikkeld met hover + titel. Layout geeft `base` mee. Zonder `base` blijft 'ie gewoon read-only. (2) De **overzicht-tab is een reis-dashboard** geworden: bovenaan een **"Volgende stap"-kaart** (afgeleide, contextuele CTA → juiste tab) + een rij **tegels** (Intake %, Trigger map #invalshoeken, Matrix #concepten/live, Sprint #getest/winnaars, Learnings #winnaars), elk klikbaar. Intake-voortgang + Gegevens + status + verwijderen blijven.
- **Volgende-stap-logica** (server): geen trigger map → intake (bij <25% intake) of trigger map genereren; wél trigger map maar 0 concepten → matrix-opzet; concepten maar niets getest → sprintresultaten; anders → learnings/volgende ronde.
- **Bestanden:** `CreativeLoop.svelte`, `[id]/+layout.svelte` (base), `[id]/+page.server.ts` (reisdata + volgendeStap), `[id]/+page.svelte` (dashboard + CTA).
- **Verificatie:** `svelte-check` 0 fouten; dev-server compileert schoon. Nog visueel te checken (login vereist) → branch `ux-verbeteringen`.
- **Migratie:** geen.

### 2026-07-16 — Robuustheid: Claude-retries bij overbelasting + duidelijke scan-fouten (branch)
- **Wat:** (1) `claude.ts` — Anthropic-client `maxRetries` 2→4 én een nette foutmelding bij 429/529/5xx ("Claude is momenteel overbelast (tijdelijk). Wacht ~30 seconden…") i.p.v. ruwe API-JSON. Geldt voor ALLE AI-features (trigger map, matrix, brief, document-upload, scans). (2) `web-scan.ts` — realistische browser-User-Agent + `Accept-Language` (meer sites laten `fetch` toe), en een aparte, actiegerichte melding bij 403/401/429 ("de site blokkeert geautomatiseerd ophalen — kopieer de tekst en plak 'm handmatig").
- **Aanleiding:** test gebruiker gaf 3 fouten: document-upload + website-scan faalden op **529 Overloaded** (tijdelijke Claude-storing, geen bug — website-fetch zelf slaagde wél); reviews-scan op Trustpilot gaf **403** (bot-blokkering).
- **Verificatie (fetch, los van Claude):** `kayasieraden.nl` → 200, 131 KB (scan werkt); `nl.trustpilot.com/review/...` → 403 (geblokkeerd, zoals verwacht). `svelte-check` 0 fouten.
- **Les:** review-platforms (Trustpilot/Kiyoh/Google) blokkeren server-side scraping → betrouwbaar automatisch reviews ophalen vereist een betaalde databron/web-search; website-scan van gewone (server-gerenderde) sites werkt wél.
- **Migratie:** geen. NB: de `claude.ts`-retryfix is algemeen nuttig (ook voor live document-upload) — komt mee zodra de branch naar main gemerged wordt.

### 2026-07-16 — Intake-automatisering MVP: website- & reviews-scan vanaf URL (branch)
- **Wat:** eerste stap van de intake-automatisering, ZONDER extra kosten/plan. (1) **Concurrent-scan (Bron 3):** knop "Scan website (AI)" per concurrent → server haalt de opgegeven URL op (gewone `fetch`, geen betaalde web-search) → Claude vult `invalshoeken`, `website_taal` en `kansen` als voorstel in (velden blijven bewerkbaar/auto-save). (2) **Reviews-scan (Bron 4):** review-URL-veld + knop "Scan reviews (AI)" → fetch → Claude vat samen in Positief/Negatief/Gaps → vult het samenvattingsveld.
- **Techniek:** `src/lib/server/web-scan.ts` (`haalPaginaTekst` = fetch + HTML-strip, 15s timeout, 40k-teken cap, best-effort; `scanConcurrentWebsite` + `scanReviews` via `claudeJSON` effort 'low'). `/api/intake` types `scan_concurrent` + `scan_reviews` (schrijven direct naar de rij + loggen in ai_logs module 'concurrent_scan'/'review_scan'). Intake-UI: scan-knoppen + `{#key}`-reseed van AutoSaveField na scan + foutmelding.
- **Bewuste grenzen (eerlijk):** werkt goed voor server-gerenderde sites; JS-only sites of bot-detectie geven weinig terug → duidelijke foutmelding, dan handmatig. Meta Ad Library / TikTok en het AUTOMATISCH ONTDEKKEN van bronnen (zonder URL) zitten hier NIET in — dat vereist betaalde web-search en/of achtergrond-jobs (Vercel Pro/Supabase Edge Functions); aparte beslissing.
- **Verificatie:** `svelte-check` 0 fouten. NIET end-to-end getest (externe fetch + login vereist) en NIET gedeployed — staat op branch `intake-automatisering` voor test door gebruiker.
- **Migratie:** geen.

### 2026-07-16 — Brief format-bewust + kopiëren/exporteren
- **Wat:** de creative brief past zich nu aan het **formaat** aan i.p.v. altijd video aan te nemen. Statisch beeld → "hook" wordt eye-catcher/openingsbeeld + headline, "structuur" wordt lay-out/compositie, géén seconden; carousel → "hook" = eerste kaart, "kern" = kaart-voor-kaart; video/motion → 0-3 sec hook zoals voorheen. De labels op de brief-pagina passen mee (`briefSecties(format)`). Plus **"Kopieer" (Markdown naar klembord)** en **"Export" (.md-bestand)** per brief.
- **Bestanden:** `sprint.ts` (`isStatischFormat`/`isCarouselFormat`/`briefSecties(format)`/`briefNaarMarkdown`; `BRIEF_SECTIES` = `briefSecties(null)`), `sprint-ai.ts` (`formaatInstructie` in de brief-context), `brief/+page.svelte` (format-labels + kopiëren/exporteren).
- **Waarom:** het team maakt soms alleen statisch beeld; een video-brief past daar niet op. En een brief moet je aan een creator kunnen geven (kopiëren/export).
- **Verificatie:** `svelte-check` 0 fouten. Nog te doen: browser-test (format-generatie + kopiëren/export) + pushen.
- **Migratie:** geen.

### 2026-07-13 — Herontwerp stap 2: sleepbare testvolgorde, learnings-tab & sluitende loop
- **Wat:** (2a) **rijen slepen** in de matrix om de testvolgorde handmatig te bepalen — sleep-handvat per rij, opgeslagen in de bestaande `volgorde`-kolom; `sorteerConcepten` sorteert nu primair op `volgorde` (fallback = funnelfase→prioriteit→datum, dus ongeordend gedraagt zich als voorheen). Nieuwe API-actie `herorden` (bulk-update volgorde). (2b) nieuwe **"Learnings"-tab** (na Sprint): tijdlijn die automatisch samenvat uit bestaande sprintdata — aantal tests/winnaars, bevestigde vs. ontkrachte invalshoeken (uit trigger map-status), en per test metrics + observatie + AI-analyse (wat werkte / volgende stap). Geen migratie (leest `concepts` + actieve trigger map). (2c) **loop sluiten:** een bevestigde sprint-winnaar zet de bijbehorende invalshoek in de actieve trigger map op "Getest — werkt" (naam-normalisatie), met groene bevestiging in de Sprint-UI.
- **Learnings-terugkoppeling (zelfversterkende loop):** de matrix-generatie (`genereerMatrix` + `/api/concepts` genereer) krijgt nu de learnings mee — winnaars (met winnende dims + wat werkte + volgende stap + observatie) en de lijst bevestigde/ontkrachte invalshoeken. SYSTEM-richtlijn: bouw voort op winnende eigenschappen, verwerk "volgende stap", en stel géén ontkrachte invalshoeken opnieuw voor. Zo compoundt de loop: intake goed doen → daarna vooral uitvoeren.
- **Bestanden:** `matrix.ts` (sorteren op volgorde), `api/concepts` (herorden + learnings verzamelen + doorgeven), `matrix/+page.svelte` (sleep-UI), `api/sprint` (winnaar→invalshoek-status), `sprint/+page.svelte` (bevestiging), `[id]/+layout.svelte` (Learnings-tab), `learnings/+page.server.ts` + `+page.svelte` (nieuw), `matrix-ai.ts` (LearningsContext + prompt).
- **Waarom:** de review wees uit dat learnings verstopt zaten en de loop niet echt sloot; het team wil een self-reinforcing loop.
- **Verificatie:** `svelte-check` 0 fouten; dev-server compileert schoon. Nog te doen: end-to-end in de browser + pushen.
- **Migratie:** geen (`volgorde` bestond al sinds 0001; learnings/statussen in bestaande kolommen/jsonb).

### 2026-07-13 — Herontwerp stap 1: trigger map = inzicht, invalshoeken = test-backlog in matrix
- **Wat:** de lagen strak getrokken (uit de review-sessie). (1) **Trigger map** toont nu puur het inzicht (secties + persona's + versiebeheer) — het invalshoeken-blok met de 36 scorekaart-dropdowns is eraf; onderaan een doorverwijs-kaart naar de matrix. (2) **Invalshoeken** verschijnen als **inklapbare "Test-backlog" bovenaan de matrix**, automatisch geprioriteerd op RICE (hoog→laag; ongescoord onderaan), per rij prioriteit/funnelfase/status-badges + inklapbaar "Bijstellen" (naam/fase/status/omschrijving/onderbouwing/4 score-selects/archiveren/verwijderen) + "Scores opnieuw voorstellen" + "Invalshoek toevoegen" + archief. (3) **Auto-scoren bij generatie:** na het opslaan van de trigger map worden de invalshoeken meteen gescoord (best-effort ná insert → geen dataverlies bij timeout), zodat de backlog direct geprioriteerd is.
- **UX-fixes matrix:** backlog is **inklapbaar** (standaard dicht zodra er al concepten zijn, dan zie je meteen de matrix); de lange tekstvelden **Invalshoek** en **Hypothese** zijn meegroeiende textareas die standaard compact blijven (max. hoogte, intern scrollen) en **volledig uitklappen bij focus** — geen horizontaal gescrol meer binnen een smal vakje.
- **Waarom:** trigger map was te vol/intens; het team wil de trigger map als volledig klantbeeld en de prioritering (RICE) automatisch → de matrix bepaalt de tests. Zie `HANDOFF.md` voor de bredere koers.
- **Bestanden:** `triggermap/+page.svelte` (herschreven), `triggermap/+page.server.ts` (auto-score na insert), `matrix/+page.server.ts` (laadt actief `versieId`), `matrix/+page.svelte` (test-backlog + inklap + meegroeiende velden).
- **Let op:** de genereren-actie doet nu 2 AI-calls achter elkaar (trigger map `medium` + scoring `low`) → timeout-risico bij >60s; daarom insert-first-then-update (trigger map blijft altijd bewaard). Bij Vercel Pro kan `maxDuration` omhoog.
- **Verificatie:** `svelte-check` 0 fouten; dev-server compileert schoon; live in de browser bevestigd door gebruiker (backlog inklapbaar, velden compact + uitklappen bij focus). Nog niet gepusht/gedeployed.
- **Migratie:** geen (invalshoeken/scores in `trigger_map_versions.invalshoeken` jsonb).

### 2026-07-10 — Scorekaart: RICE-light prioriteit per invalshoek · `2b10220`
- **Wat:** transparante tussenstap tussen trigger map en matrix. Per invalshoek een RICE-light score (Bereik · Impact · Bewijskracht · Effort, elk L/M/H) → deterministisch afgeleide prioriteit. "Scores voorstellen" (AI) vult de scores + toelichting; de strateeg controleert/stelt bij (L/M/H-selects). De matrix neemt de goedgekeurde prioriteit exact over.
- **Waarom:** de prioriteit navolgbaar en controleerbaar maken (niet meer "de LLM gokt"), met de mens in de lus vóórdat de matrix gemaakt wordt.
- **Model/formule:** RICE-light = (Bereik × Impact × Bewijskracht) / Effort, met L/M/H → 1/2/3. Prioriteit-banden: ≥8 Hoog, ≥3 Middel, anders Laag. Zie `src/lib/trigger-map.ts` (`riceScore`, `afgeleidePrioriteit`).
- **Bug onderweg:** het model zette de funnelfase vóór de naam → koppeling faalde (0/9). Opgelost met een schone prompt + robuuste naam-normalisatie (strip `[FASE]`-prefix).
- **Verificatie (klant Test):** 9/9 invalshoeken gescoord; RICE→prioriteit klopt; matrix-prioriteit matcht 9/9 met de scorekaart; UI rendert (knop + 36 selects + 9 badges); 0 console-fouten; `svelte-check` 0 fouten.
- **Migratie:** geen (scores in `trigger_map_versions.invalshoeken` jsonb).

### 2026-07-10 — Matrix: betere weging, extra sturing & sluitende loop · `62044ae`
- **Wat:** (1) persona's + invalshoek-onderbouwing meegegeven aan de matrix-generatie; prioriteit weegt persona-bereik + aansluiting mee. (2) Vrij "Extra sturing"-veld bij "Opzet genereren" (bv. benaming insuline vs. medicatie, gezicht-in-beeld). (3) Loop gesloten: "Volgende testronde genereren" gebruikt de learning-analyse om 2-4 varianten van de volgende testvariabele te maken i.p.v. één lege kopie.
- **Waarom:** het team wilde weten *waarom* de matrix eruitziet zoals 'ie is, of de prio betrouwbaar is en of het een doorlopende loop vormt.
- **Effort-tuning:** matrix → `low`, vervolg → `medium` (met de rijke context liep `high` ~100s, over de 60s-timeout).
- **Verificatie (klant Test):** matrix 41s, alle 9 concepten onderbouwd; onderbouwing verwijst naar persona's (weging werkt) + verwerkt de sturing; vervolg → 4 format-varianten met invalshoek constant en learning verwerkt. `svelte-check` 0 fouten.
- **Migratie:** geen.

### 2026-07-10 — Onderbouwing per matrix-concept · `4e532e5`
- **Wat:** Claude geeft + toont per concept waarom deze invalshoek en waarom deze prioriteit (ℹ️-knop klapt het uit in de matrix).
- **Waarom:** de matrix-keuzes waren een "zwart gat" — geen zichtbare redenering.
- **Verificatie:** `svelte-check` 0 fouten; end-to-end getest na migratie.
- **Migratie:** `0009_concept_onderbouwing.sql` (`concepts.onderbouwing`).

### 2026-07-09 — Fix: document-upload parse · `90ae8fd`
- **Wat:** document-parser gaf "geen valide JSON". Oorzaak: `max_tokens` stond nog op 8000 terwijl adaptive thinking de denk-tokens meetelt → JSON knapte af. Fix: `max_tokens` 16000 + `effort` `low` (extractie, geen strategie) + `maxDuration` 60 op /api/intake.
- **Verificatie:** ~5000-teken document → 16 Bron 1- + 4 Bron 2-antwoorden, valide, ~17s.
- **Migratie:** geen.

### 2026-07-09 — Extended (adaptive) thinking aan · `890656c`
- **Wat:** alle AI-generaties van `thinking: disabled` naar `adaptive` + `effort`. `max_tokens` naar 16000. `maxDuration` 60 op de AI-routes.
- **Waarom:** betere kwaliteit (klassiek `budget_tokens` is deprecated + wordt door sonnet-5 geweigerd).
- **Verificatie:** trigger map 51s (medium), matrix/testplan ~35s, brief 19s — valide JSON, geen truncatie.
- **Migratie:** geen.

### 2026-07-09 — Intake-bron "Overig" + Brief als eigen tab · `8da05ef`
- **Wat:** optionele Bron 6 "Overig" (vrije blokken, telt niet mee in voortgang, wél in trigger map-generatie). Creative brief verplaatst naar eigen tab tussen Matrix en Sprint.
- **Verificatie:** "Overig"-tab + Brief-tab renderen; brief-generatie → 10 velden opgeslagen; Bron 6 blok opgeslagen na migratie.
- **Migratie:** `0008_bron6_overig.sql` (tabel `intake_bron6`).

### 2026-07-09 — Persona's in trigger map + AI-testplan · `dc2878c`
- **Wat:** persona's/doelgroep-segmenten op de trigger map (generator + bewerkbaar). AI-testplan onder de matrix (sprintplan + "verfijn met feedback").
- **Verificatie:** trigger map v3 → 4 persona's; testplan → 6 sprints; feedback "begin met BOFU" → Sprint 1 werd BOFU.
- **Migratie:** `0007_personas_testplan.sql` (`trigger_map_versions.personas`, `clients.testplan`).

### 2026-07-09 — Invalshoeken per funnelfase + schone matrix · `6a1905e`
- **Wat:** trigger map genereert 3 invalshoeken per funnelfase (9); invalshoeken gegroepeerd per TOFU/MOFU/BOFU met status/levenscyclus + archiveren. Matrix houdt per fase format/structuur/creator constant (schoon testen).
- **Verificatie:** 9 invalshoeken (3/fase), status persist, archiveren werkt; matrix `variabeleConstant` per fase.
- **Migratie:** geen (invalshoeken is jsonb).

### 2026-07-09 — Fix: intake Bron 4 (Reviews) laadde niet terug · `e5c0b1d`
- **Wat:** load sorteerde `intake_bron4` op `created_at`, maar die kolom bestaat niet (tabel heeft `updated_at`) → query errorde naar null → tab altijd leeg. Data stond wél in de DB. Fix: sorteren op `updated_at`.
- **Migratie:** geen.

### 2026-07-08 — Intake-verdieping, Sprint-fase, matrix-generatie, document-upload · `00a5429`
- **Wat:** grote uitbreiding — verdiepte intake (Bron 1 → 43 vragen), volledige Sprint-fase, matrix auto-generatie, en de document-upload (Google Doc/tekst → Claude vult intake-vragen).
- **Migratie:** `0006_sprint.sql` (sprint-velden op `concepts`).

### 2026-07-07 — Volledige applicatie (basis) · `c73d5a0`
- **Wat:** eerste volledige app: setup, auth, DB (migraties 0001-0005), sidebar, klantbeheer, intake, Claude + trigger map, trigger map-bewerken, matrix, AI-logging, admin.
