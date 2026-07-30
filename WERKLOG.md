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
