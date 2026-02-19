# World Press Monitor RSS Atlas

![TypeScript](https://img.shields.io/badge/TypeScript-5.7.3-3178c6?logo=typescript&logoColor=white)
![Bun](https://img.shields.io/badge/Bun-1.2-000000?logo=bun)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Ready-336791?logo=postgresql&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-blue)

Maintenance-focused project for RSS source cataloging, feed validation, and periodic collection checks.

Open-source project goals:

- Maintain a clean global RSS source catalog with a clear signal of healthy vs broken feeds.
- Enable reproducible daily/cron verification and catalog exports.
- Keep PRs simple: add source URLs, run validation, and commit only source changes.

Suggested GitHub tags: `rss`, `news`, `feed`, `typescript`, `postgresql`, `docker`, `bun`, `monitoring`

### Open-source metadata

Use `scripts/setup-github-metadata.sh` to set repository description and topics once:

```bash
bash scripts/setup-github-metadata.sh mylee04/world-press-monitor
```

You can also set them in GitHub settings manually.

## Country-level RSS Atlas (Top 30 countries by GDP)

This list covers top 30 countries by GDP (high-level order) and all configured RSS outlets per country.
- Last checked: 02/19/2026
- `❌ NO_SOURCE` means no RSS source is configured for this country yet.
- `❌ 000` means not verified in the current environment yet.

## Health Check Workflow

- Source-of-truth config: `data/rss-atlas.json`
- Run one-time verification/update: `bun run verify:readme-rss`
- Run precheck only (DNS + sample HTTP) before full verification: `bun run verify:readme-rss --precheck` (or `bun run verify:readme-rss:precheck`)
  - If precheck fails (DNS/BASIC egress), command exits with `NO_NETWORK/DNS_BROKEN` and skips full verification.
- Run one-time verification + catalog export (with network precheck): `bun run rss:health:once`
- Generate editable backlog CSV for failures: `bun run rss:health:backlog`
- Optional focus only: `bun run rss:health:backlog -- --reasons=HTTP_404,HTML_RETURNED --limit=100`
- Export `data/rss-atlas.json` from the current README: `bun run atlas:export`
- Export CSV + OPML subscription catalogs from current atlas: `bun run atlas:export-catalog`
- Generated health reports are written to:
  - `audits/readme_rss_health_latest.json`
  - `audits/readme_rss_health_YYYY-MM-DD.json`
  - `audits/readme_network_precheck_latest.json` (when `--precheck` runs)
- Verify DB schema sync between `db/schema.sql` and `lib/ingestion-store.ts` startup DDL: `bun run db:check-schema-sync`
- Recreate/restart Postgres data for the main `wpm` DB (with optional presslab migration and schema sync): `bun run db:bootstrap-wpm`  
  - Use `bun run db:bootstrap-wpm -- --fresh` to drop and recreate the postgres volume
- Remove legacy tables from current DB (safe hints, dry-run by default): `bun run db:cleanup-legacy-tables`
  - Apply removals: `bun run db:cleanup-legacy-tables:apply`
  - Include all non-schema tables in cleanup (except migration metadata): `bun run db:cleanup-legacy-tables:all`
  - Apply broad cleanup: `bun run db:cleanup-legacy-tables:apply:all`
- `getent` + `nsswitch` checks are Linux-specific; on macOS they are intentionally marked `SKIP`.
- HTTP Status column now carries quick failure clues:
  - `ERR (DNS)`: domain lookup/host resolution failed
  - `ERR (TIMEOUT)`: request timed out
  - `ERR (TLS)`: certificate or TLS issue
  - `ERR (NETWORK)`: generic network failure
- Optional tuning envs:
  - `RSS_BATCH_SIZE` (default 30)
  - `RSS_BATCH_DELAY_MS` (default 500)
  - `RSS_REQUEST_TIMEOUT_MS` (default 15000)
  - `RSS_REQUEST_JITTER_MS` (default 150)
- Migrate search-aggregated sources (Google/Bing style URLs) to candidate official RSS URLs:
  - `RSS_MIGRATE_OFFLINE_MODE=1 bun run rss:migrate-official`
- Regenerate README from atlas after manual migration: `bun run atlas:export`
 





## Latest RSS verification snapshot

- Checked endpoints: `981`
- Valid: `396`
- Invalid: `585`
- No-source rows: `37`
- Snapshot date: `02/19/2026`
- Source artifact: `audits/readme_rss_health_latest.json`

### Failure reasons
|Reason|Count|
|---|---:|
|HTTP_404|370|
|HTML_RETURNED|85|
|HTTP_403|64|
|NETWORK|21|
|TIMEOUT|14|
|TLS|11|
|HTTP_401|4|
|HTTP_500|4|
|HTTP_410|3|
|INVALID_JSON|2|
|HTTP_307|1|
|HTTP_530|1|
|HTTP_429|1|
|HTTP_400|1|
|HTTP_370|1|
|HTTP_502|1|
|HTTP_405|1|

### Invalid feeds by reason

#### HTTP_404 (370)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Argentina|Ciudad|<https://www.ciudad.com.ar/rss>|404|
|Argentina|CNM Noticias|<https://www.cronica.com.ar/rss/cnm>|404|
|Argentina|Cronica|<https://www.cronica.com.ar/rss>|404|
|Argentina|El Destape|<https://eldestapeweb.com/rss>|404|
|Argentina|LA Nacion (Politics)|<https://www.lanacion.com.ar/politica/feed/>|404|
|Argentina|Página/12 (Mundo)|<https://www.pagina12.com.ar/feed/rss2>|404|
|Argentina|Perfil (Negocios)|<https://www.perfil.com/economia/feed>|404|
|Argentina|Perfil (Política)|<https://www.perfil.com/politica/feed>|404|
|Argentina|Todo Noticias|<https://tn.com.ar/rss>|404|
|Australia|ABC News - World|<https://www.abc.net.au/news/feed/52278/rss.xml>|404|
|Australia|ABC News Science|<https://www.abc.net.au/news/feed/1077/rss.xml>|404|
|Australia|Canberra Times|<https://www.canberratimes.com.au/rss/>|404|
|Australia|Financial Review|<https://www.afr.com/rss/headlines>|404|
|Australia|Financial Review - CEO|<https://www.afr.com/rss/ceo>|404|
|Australia|PerthNow|<https://www.perthnow.com.au/rss.xml>|404|
|Australia|SBS News (Breaking)|<https://www.sbs.com.au/news/feed/>|404|
|Australia|SBS World News|<https://www.sbs.com.au/news/rss.xml>|404|
|Australia|Sydney Morning Herald|<https://www.smh.com.au/rss/>|404|
|Australia|The Age|<https://www.theage.com.au/rss/>|404|
|Australia|The Guardian Australia|<https://www.theguardian.com/au/rugby/rss>|404|
|Australia|The Saturday Paper|<https://www.thesaturdaypaper.com.au/feed>|404|
|Austria|Heute|<https://www.heute.at/feed/>|404|
|Austria|Kleine Zeitung|<https://www.kleinezeitung.at/home/rss.xml>|404|
|Austria|Kleine Zeitung (Sport)|<https://www.kleinezeitung.at/sport/rss>|404|
|Austria|Kronen Zeitung|<https://www.krone.at/2/2.0.0?output=rss>|404|
|Austria|Kurier|<https://www.kurier.at/1.0.0/feed.rss>|404|
|Austria|Kurier|<https://www.kurier.at/2/2.0.0?output=rss>|404|
|Austria|Kurier (Economy)|<https://www.kurier.at/rss/business.xml>|404|
|Austria|Kurier (Top News)|<https://www.kurier.at/feed>|404|
|Austria|ORF|<https://rss.orf.at/wirtschaft.xml>|404|
|Austria|ORF Sport|<https://rss.orf.at/ardienst>|404|
|Austria|ORF TOP|<https://rss.orf.at/world.xml>|404|
|Austria|Salzburg24|<https://www.salzburg24.at/rss>|404|
|Austria|Salzburger Nachrichten|<https://www.sn.at/rss>|404|
|Austria|Tiroler Tageszeitung|<https://www.tt.com/rss/allnews.xml>|404|
|Austria|Wiener Zeitung|<https://www.wienerzeitung.at/rss>|404|
|Austria|Wiener Zeitung|<https://www.wienerzeitung.at/rss/>|404|
|Belgium|Belgium RTL|<https://www.rtbf.be/rss>|404|
|Belgium|De Morgen|<https://www.demorgen.be/feed/>|404|
|Belgium|De Morgen Economy|<https://www.demorgen.be/rss/economie/>|404|
|Belgium|De Tijd|<https://www.tijd.be/rss/international>|404|
|Belgium|Het Laatste Nieuws|<https://www.hln.be/rss/nieuws>|404|
|Belgium|La Libre|<https://www.lalibre.be/feed/>|404|
|Belgium|La Libre Belgique|<https://www.lalibre.be/feeds/all>|404|
|Belgium|Lavenir|<https://www.lavenir.net/flux.xml>|404|
|Belgium|RTBF|<https://www.rtbf.be/rss/rss_activites.xml>|404|
|Belgium|RTBF|<https://www.rtbf.be/rss/>|404|
|Belgium|RTL Belgium|<https://www.rtbf.be/newsline/rss>|404|
|Belgium|VRT|<https://www.vrt.be/vrtnws/en/rss>|404|
|Belgium|VRT News|<https://www.vrt.be/vrtnws/nl.rss>|404|
|Brazil|Bolsas|<https://valor.globo.com/rss/ultimas.xml>|404|
|Brazil|Canal Tech Brasil|<https://canaltech.com.br/feed/>|404|
|Brazil|Estadão|<https://www.estadao.com.br/rss/ultimas>|404|
|Brazil|Estadão (Economy)|<https://www.estadao.com.br/rss/economia>|404|
|Brazil|Estadão (Politics)|<https://www.estadao.com.br/politica/rss>|404|
|Brazil|Estadão World|<https://www.estadao.com.br/ultimas/feed>|404|
|Brazil|Estado de S. Paulo|<https://www.estadao.com.br/rss/>|404|
|Brazil|Folha (World)|<https://www.folha.uol.com.br/ultilinks/noticias/mundo/rss091.xml>|404|
|Brazil|Globo Esporte|<https://ge.globo.com/rss/>|404|
|Brazil|O Estado de Minas|<https://www.em.com.br/site/rss/em_d.php>|404|
|Brazil|R7|<https://noticias.r7.com/rss/>|404|
|Brazil|R7 Economy|<https://noticias.r7.com/economia/feed/>|404|
|Brazil|UOL (Economy)|<https://www.uol.com.br/album/rssxml/>|404|
|Brazil|UOL Brasil|<https://www.uol.com.br/urbe/rss>|404|
|Brazil|UOL Economia|<https://www.uol.com.br/album/rssxml/economia/>|404|
|Brazil|Valor (Invest)|<https://valor.globo.com/rss/feed.xml>|404|
|China|Caixin Global|<https://caixinglobal.com/feed>|404|
|China|China Digital Times|<https://chinadigitaltimes.net/china/feed>|404|
|China|China Times|<https://chinatimes.com/feed>|404|
|China|Global Times|<https://globaltimes.cn/feed>|404|
|China|Global Times US|<https://www.globaltimes.cn/rss/7/>|404|
|China|Jiemian|<https://jiemian.com/feed>|404|
|China|People|<https://www.people.cn/rss/people.xml>|404|
|China|People's Daily|<https://people.com.cn/feed>|404|
|China|Sina China|<https://rss.sina.com.cn/tech/feed.xml>|404|
|China|South China Morning Post (Business)|<https://www.scmp.com/rss/2/0/feed>|404|
|China|The Paper|<https://thepaper.cn/feed>|404|
|China|United Daily News|<https://udn.com/feed>|404|
|China|Xinhua (World)|<https://english.news.cn/rss/english.rss>|404|
|China|Yicaiglobal|<https://yicaiglobal.com/feed>|404|
|France|Midi Libre|<https://www.midilibre.fr/essentiel/rss.xml>|404|
|Germany|Der Spiegel|<https://www.spiegel.de/contentfeed/schlagzeilen.rss>|404|
|Germany|Financial Times Germany|<https://www.ft.com/world/world?format=rss>|404|
|Germany|Frankfurter Allgemeine|<https://www.faz.net/aktuell/rss.html>|404|
|Germany|Manager Magazin (Startups)|<https://www.manager-magazin.de/magazin/rss/unternehmen/>|404|
|Germany|Süddeutsche Zeitung|<https://rss.sueddeutsche.de/rss/top>|404|
|Germany|SWR|<https://www.swr.de/politik/unternehmen-rss.xml>|404|
|Global Energy & Grid|Argus Media|<https://www.argusmedia.com/rss>|404|
|Global Energy & Grid|Clean Energy Wire|<https://www.cleanenergywire.org/rss>|404|
|Global Energy & Grid|EIA|<https://www.eia.gov/xml/rss/eia.xml>|404|
|Global Energy & Grid|Energy Central|<https://energycentral.com/feed>|404|
|Global Energy & Grid|Energy Central|<https://energycentral.com/feed/>|404|
|Global Energy & Grid|Energy Intelligence|<https://www.energyintel.com/rss>|404|
|Global Energy & Grid|Energy Storage Report|<https://www.energystorage.org/feed/>|404|
|Global Energy & Grid|IEA|<https://iea.blob.core.windows.net/assets/3d6b5c8a-4f90-4dcb-8f4b-abc.xml>|404|
|Global Energy & Grid|IEA|<https://iea.blob.core.windows.net/assets/energy.xml>|404|
|Global Energy & Grid|IEA Oil|<https://iea.blob.core.windows.net/assets/oil.xml>|404|
|Indonesia|Bisnis|<https://www.bisnis.com/rss>|404|
|Indonesia|Bisnis|<https://www.bisnis.com/feed/>|404|
|Indonesia|Bisnis (Teknologi)|<https://www.bisnis.com/rss/technology>|404|
|Indonesia|BisnisIndonesia|<https://www.bisnis.com/id/home/feed>|404|
|Indonesia|CNBC Indonesia|<https://www.cnbcindonesia.com/feed>|404|
|Indonesia|CNN Indonesia|<https://www.cnnindonesia.com/feed/>|404|
|Indonesia|Detik|<https://www.detik.com/rss>|404|
|Indonesia|Detik|<https://www.detik.com/rss/sport>|404|
|Indonesia|Jakarta Globe|<https://jakartaglobe.id/feed>|404|
|Indonesia|Kompas|<https://www.kompas.com/rss>|404|
|Indonesia|Kompas|<https://www.kompas.com/feed>|404|
|Indonesia|Kompas|<https://www.kompas.com/rss/>|404|
|Indonesia|Kumparan|<https://kumparan.com/rss>|404|
|Indonesia|Liputan6|<https://www.liputan6.com/rss>|404|
|Indonesia|Tempo|<https://www.tempo.co/rss/feed.xml>|404|
|Indonesia|The Jakarta Post|<https://www.thejakartapost.com/rss>|404|
|Indonesia|Viva|<https://www.viva.co.id/rss>|404|
|Indonesia|Viva|<https://www.viva.co.id/rss/terkini>|404|
|Iran|Aftab|<https://www.aftabnews.ir/rss/1>|404|
|Iran|Aftab Press|<https://www.aftabnews.ir/rss>|404|
|Iran|ILNA|<https://www.ilna.ir/rss/1>|404|
|Iran|IRNA (Culture)|<https://www.irna.ir/rss/culture.xml>|404|
|Iran|IRNA English|<https://www.irna.ir/rss/en>|404|
|Iran|Mehr News|<https://www.mehrnews.com/feed/>|404|
|Iran|Mehr News (Politics)|<https://www.mehrnews.com/rss/politic>|404|
|Iran|Mehr News English|<https://www.mehrnews.com/rss/english>|404|
|Iran|Press TV|<https://www.presstv.ir/en/rss/iran.xml>|404|
|Iran|Shargh|<https://www.sharghdaily.com/rss>|404|
|Japan|Bloomberg Japan|<https://www.bloomberg.co.jp/feed/>|404|
|Japan|DIAMOND|<https://diamond.jp/feed/>|404|
|Japan|DIAMOND (President)|<https://president.jp/feed/>|404|
|Japan|ITmedia (EEtimes)|<https://eetimes.itmedia.co.jp/rss/>|404|
|Japan|Japan Business Federation|<https://www.keidanren.or.jp/keidanren/rss.xml>|404|
|Japan|Kabutan|<https://kabutan.jp/rss.xml>|404|
|Japan|NHK General|<https://www3.nhk.or.jp/rss/news/cat0.rdf>|404|
|Japan|Nikkei|<https://www.nikkei.com/rss/>|404|
|Japan|Nikkei (Business)|<https://www.nikkei.com/rss/nkeg/feed/>|404|
|Japan|Nikkei 20|<https://www.nikkei.com/markets/asia/rss/>|404|
|Japan|The Tokyo Shimbun|<https://www.tokyo-np.co.jp/rdf/>|404|
|Japan|Toyo Keizai|<https://toyokeizai.net/feed/>|404|
|Japan|Yomiuri Shimbun|<https://www.yomiuri.co.jp/rss/>|404|
|Mexico|Animal Político|<https://www.animalpolitico.com/feed/>|404|
|Mexico|El Universal|<https://www.eluniversal.com.mx/rss.xml>|404|
|Mexico|Excelsior|<https://www.excelsior.com.mx/rss.xml>|404|
|Mexico|Excélsior (Politics)|<https://www.excelsior.com.mx/politica.xml>|404|
|Mexico|Excélsior Internacional|<https://www.excelsior.com.mx/opinion/rss>|404|
|Mexico|Milenio (Economy)|<https://www.milenio.com/negocios/rss>|404|
|Mexico|Milenio Politics|<https://www.milenio.com/politica/rss>|404|
|Mexico|Proceso (Opinion)|<https://www.proceso.com.mx/opinion/rss>|404|
|Mexico|Proceso (Política)|<https://www.proceso.com.mx/politica/rss>|404|
|Netherlands|AD|<https://www.ad.nl/nieuws/rss>|404|
|Netherlands|FD|<https://fd.nl/rss/economie>|404|
|Netherlands|Financieel Dagblad|<https://fd.nl/rss.xml>|404|
|Netherlands|NOS|<https://www.nos.nl/rss>|404|
|Netherlands|NOS Culture|<https://feeds.nos.nl/noscultuur>|404|
|Netherlands|NOS Politiek|<https://feeds.nos.nl/nospolitiek>|404|
|Netherlands|NOS Sport|<https://feeds.nos.nl/nossport>|404|
|Netherlands|NOS Sport|<https://www.nos.nl/rss/sport/>|404|
|Netherlands|NOS Tech|<https://feeds.nos.nl/nostechniek>|404|
|Netherlands|NRC|<https://www.nrc.nl/rss/nieuws/>|404|
|Netherlands|NU|<https://www.nu.nl/rss/algemeen/rss.xml>|404|
|Netherlands|Nu.nl Technology|<https://www.nu.nl/rss/tech/>|404|
|Netherlands|Parool|<https://www.parool.nl/rss>|404|
|Netherlands|Parool|<https://www.parool.nl/rss/nieuws/>|404|
|Netherlands|RTL Nieuws|<https://www.rtlnieuws.nl/service/rss/rss.xml>|404|
|Netherlands|RTL Nieuws|<https://www.rtlnieuws.nl/service/rss/rss-alle-nieuws.xml>|404|
|Netherlands|RTL Nieuws Finance|<https://www.rtlnieuws.nl/service/rss/rss-finance.xml>|404|
|Netherlands|Trouw|<https://www.trouw.nl/rss/algemeen/>|404|
|Netherlands|Volkskrant|<https://www.volkskrant.nl/rss>|404|
|Netherlands|Volkskrant|<https://www.volkskrant.nl/rss/algemeen/>|404|
|Norway|Aftenbladet|<https://www.aftenposten.no/rss/entertainment.rss>|404|
|Norway|Aftenbladet|<https://www.aftenbladet.no/rss/toppsaker.rss>|404|
|Norway|Aftenposten|<https://www.aftenposten.no/rss/toppsaker.rss>|404|
|Norway|Aftenposten|<https://www.aftenposten.no/rss/helse.rss>|404|
|Norway|Aftenposten Business|<https://www.aftenposten.no/rss/okonomi.rss>|404|
|Norway|Bergens Tidende|<https://www.bt.no/rss/toppsaker.rss>|404|
|Norway|Dagbladet|<https://www.dagbladet.no/rss/abonnent>|404|
|Norway|Dagbladet|<https://www.dagbladet.no/rss/inside>|404|
|Norway|NRK Finans|<https://www.nrk.no/nyheter/okonomi.rss>|404|
|Norway|NRK Sport|<https://www.nrk.no/sport/rss.xml>|404|
|Norway|NRK Sports|<https://www.nrk.no/sport.rss>|404|
|Norway|NRK Tech|<https://www.nrk.no/klikk.rss>|404|
|Norway|VG|<https://www.vg.no/rss/feed.rss>|404|
|Norway|VG|<https://www.vg.no/rss/nyheter.rss>|404|
|Norway|VG World|<https://www.vg.no/rss/toppsaker.rss>|404|
|Poland|Fakt|<https://www.fakt.pl/rss/wiadomosci>|404|
|Poland|Gazeta Polska|<https://www.gazetapolska.pl/feed/>|404|
|Poland|Gazeta Wyborcza|<https://wyborcza.pl/rss>|404|
|Poland|Gazeta Wyborcza|<https://www.wyborcza.pl/rss.xml>|404|
|Poland|Gazeta.pl|<https://wiadomosci.gazeta.pl/rss>|404|
|Poland|Gazeta.pl|<https://www.gazeta.pl/rss/>|404|
|Poland|Interia|<https://www.interia.pl/feed>|404|
|Poland|Interia|<https://www.interia.pl/rss/najnowsze.xml>|404|
|Poland|Interia|<https://www.interia.pl/rss>|404|
|Poland|Polish News|<https://www.polsatnews.pl/rss/news.xml>|404|
|Poland|Polish Press|<https://www.polsatnews.pl/rss/world.xml>|404|
|Poland|Polsat News|<https://www.polsatnews.pl/rss.xml>|404|
|Poland|Puls Biznesu|<https://www.pb.pl/feed/>|404|
|Poland|RMF FM|<https://www.rmf.fm/rss/news>|404|
|Poland|Rmf24|<https://www.rmf24.pl/rss>|404|
|Poland|Rzeczpospolita|<https://www.rp.pl/rss.xml>|404|
|Poland|Rzeczpospolita|<https://www.rp.pl/rss/>|404|
|Poland|Rzeczpospolita|<https://www.rp.pl/rss/rss>|404|
|Poland|Rzeczpospolita|<https://www.rp.pl/rss/aktualnosci>|404|
|Poland|TVN24|<https://tvn24.pl/rss>|404|
|Poland|TVN24|<https://tvn24.pl/rss.xml>|404|
|Poland|TVP|<https://www.tvp.info/rss/>|404|
|Poland|Wprost|<https://www.wprost.pl/rss.xml>|404|
|Russia|Fontanka|<https://www.fontanka.ru/fontanka.rss>|404|
|Russia|Gazeta.ru|<https://www.gazeta.ru/export/rss/index.xml>|404|
|Russia|Interfax|<https://www.interfax.ru/news.rss>|404|
|Russia|Kommersant|<https://kommersant.ru/feed>|404|
|Russia|Lenta Sports|<https://lenta.ru/rss/sport>|404|
|Russia|Neftgaz|<https://neftegaz.ru/feed>|404|
|Russia|Novaya Gazeta|<https://novayagazeta.eu/feed>|404|
|Russia|Novaya Gazeta|<https://novayagazeta.eu/rss>|404|
|Russia|RBC|<https://www.rbc.ru/rss>|404|
|Russia|RIA|<https://ria.ru/feed>|404|
|Russia|Ria (World)|<https://ria.ru/export/rss2/world/index.xml>|404|
|Russia|RIA Economy|<https://ria.ru/export/rss2/economy/index.xml>|404|
|Russia|RT Crimea|<https://www.rt.com/rss/regions.xml>|404|
|Russia|RT Economy|<https://www.rt.com/rss/business.xml>|404|
|Russia|TASS|<https://tass.com/feed>|404|
|Russia|The Moscow Times|<https://themoscowtimes.com/feed>|404|
|Russia|Vedomosti|<https://vedomosti.ru/feed>|404|
|Saudi Arabia|Akhbar|<https://www.akhbarelyom.com/news/News_rss.xml>|404|
|Saudi Arabia|Al Arabiya|<https://www.alarabiya.net/xml/rss.xml>|404|
|Saudi Arabia|Gulf Daily News|<https://www.gulf-daily-news.com/rss>|404|
|Saudi Arabia|Saudi Gazette|<https://saudigazette.com.sa/ContentFeed>|404|
|Saudi Arabia|Saudi Gazette|<https://saudigazette.com.sa/en/RSS>|404|
|Saudi Arabia|Saudi Gazette|<https://saudigazette.com.sa/ContentFeed?section=business>|404|
|Saudi Arabia|Saudi Gazette (Middle East)|<https://saudigazette.com.sa/ContentFeed?section=middle-east>|404|
|Saudi Arabia|Saudi Gazette (World)|<https://saudigazette.com.sa/ContentFeed?section=world>|404|
|Saudi Arabia|Saudi Gazette Business|<https://saudigazette.com.sa/ContentFeed?sectionId=2>|404|
|Spain|20 Minutos|<https://www.20minutos.es/rss/espana.xml>|404|
|Spain|ABC|<https://www.abc.es/rss/feeds/espana.xml>|404|
|Spain|El Mundo (Politics)|<https://e00-elmundo.uecdn.es/rss/el_mundo_portada.xml>|404|
|Spain|El Mundo Sports|<https://e00-elmundo.uecdn.es/elmundo/rss/deportes.xml>|404|
|Spain|El Periódico|<https://www.elperiodico.com/es/rss/economia.xml>|404|
|Spain|eldiario|<https://www.eldiario.es/rss/vida/>|404|
|Spain|La Razon|<https://www.larazon.es/rss.xml>|404|
|Spain|La Razón|<https://www.larazon.es/rss/economia/>|404|
|Spain|La Sexta|<https://www.lasexta.com/rss.xml>|404|
|Spain|La Vanguardia|<https://www.lavanguardia.com/rss/>|404|
|Spain|La Vanguardia Economy|<https://www.lavanguardia.com/economia/rss.xml>|404|
|Spain|La Vanguardia Politics|<https://www.lavanguardia.com/politica/rss.xml>|404|
|Spain|La Voz de Galicia|<https://www.lavozdegalicia.es/rss/sociedad>|404|
|Spain|Público|<https://www.publico.es/rss/home.xml>|404|
|Spain|RTVE - Economy|<https://www.rtve.es/api/noticias/economia/rss>|404|
|Sweden|Aftonbladet|<https://www.aftonbladet.se/rss>|404|
|Sweden|Aftonbladet|<https://www.aftonbladet.se/rss/kultur.xml>|404|
|Sweden|Aftonbladet Culture|<https://www.aftonbladet.se/rss/kultur>|404|
|Sweden|Aftonbladet Economy|<https://www.aftonbladet.se/rss/ekonomi>|404|
|Sweden|Aftonbladet Politics|<https://www.aftonbladet.se/rss/nyheter>|404|
|Sweden|Aftonbladet Sport|<https://www.aftonbladet.se/rss/sportbladet>|404|
|Sweden|Aftonbladet Sport|<https://www.aftonbladet.se/rss/sport>|404|
|Sweden|Dagens Industri|<https://www.di.se/rss/bors>|404|
|Sweden|Dagens Nyheter Travel|<https://www.dn.se/rese/rss/>|404|
|Sweden|DN|<https://www.dn.se/rss/teknik/>|404|
|Sweden|Expressen|<https://www.expressen.se/rss/feed/>|404|
|Sweden|Expressen Opinion|<https://www.expressen.se/rss/opinion>|404|
|Sweden|Svd|<https://www.svd.se/rss/ekonomi.xml>|404|
|Sweden|SvD|<https://www.svd.se/feeds/latest.rss>|404|
|Sweden|Svenska Dagbladet|<https://www.svd.se/rss>|404|
|Sweden|Sydsvenskan|<https://www.svd.se/sydsvenska>|404|
|Sweden|Sydsvenskan|<https://www.svd.se/rss/sydsvenskan>|404|
|Switzerland|20 Minuten CH|<https://www.20min.ch/feeds/0/feed>|404|
|Switzerland|20min|<https://www.20min.ch/feeds/0/20min.rss>|404|
|Switzerland|Blick|<https://www.blick.ch/feed>|404|
|Switzerland|Blick|<https://www.blick.ch/feed/>|404|
|Switzerland|Le Matin|<https://www.lematin.ch/rss/>|404|
|Switzerland|Le Temps|<https://www.letemps.ch/rss/actualites>|404|
|Switzerland|Neue Zürcher Zeitung|<https://www.nzz.ch/rss/politik.xml>|404|
|Switzerland|NZZ Finance|<https://www.nzz.ch/rss/wirtschaft.xml>|404|
|Switzerland|RTS|<https://www.rts.ch/rss>|404|
|Switzerland|RTS|<https://www.rts.ch/info/news/rss>|404|
|Switzerland|SRF|<https://www.srf.ch/news/feed/>|404|
|Switzerland|SRF|<https://www.srf.ch/radio/srf-news/rss>|404|
|Switzerland|SRF|<https://www.srf.ch/news/bnf/headlines.rss>|404|
|Taiwan|CNA (US)|<https://feeds.feedburner.com/CTEEnergy>|404|
|Taiwan|CNA English|<https://www.cna.com.tw/cnaenglish/feed/>|404|
|Taiwan|Focus Taiwan (Economics - EN)|<https://focustaiwan.tw/rss/economics>|404|
|Taiwan|Focus Taiwan (Sci-Tech - EN)|<https://focustaiwan.tw/rss/science-technology>|404|
|Taiwan|Focus Taiwan (US)|<https://focustaiwan.tw/rss/usa>|404|
|Taiwan|Focus Taiwan (World)|<https://focustaiwan.tw/rss/world>|404|
|Taiwan|Liberty Times (Technology)|<https://news.ltn.com.tw/rss/tech>|404|
|Taiwan|Nownews|<https://www.nownews.com/rss/all.xml>|404|
|Taiwan|Taipei Times - Business|<https://www.taipeitimes.com/xml/biz.rss>|404|
|Taiwan|Taipei Times (Local)|<https://www.taipeitimes.com/rss/local>|404|
|Taiwan|Taipei Times (Politics)|<https://www.taipeitimes.com/rss/politics>|404|
|Taiwan|Taipei Times Tech|<https://www.taipeitimes.com/rss/technology>|404|
|Taiwan|Taiwan News|<https://www.taiwannews.com.tw/rss/headlines.xml>|404|
|Taiwan|Taiwan News (Politics)|<https://www.taiwannews.com.tw/rss/politics.xml>|404|
|Taiwan|Taiwan Panorama|<https://www.taiwanpanorama.com/rss.xml>|404|
|Taiwan|Taiwan Today|<https://www.taiwantoday.tw/feed/>|404|
|Taiwan|Taiwan Today (CN)|<https://www.taiwantoday.tw/rss/zh.xml>|404|
|Taiwan|United Daily News|<https://udn.com/rss/index.xml>|404|
|Taiwan|United Daily News (Politics)|<https://udn.com/rss/udn.xml>|404|
|Taiwan|United News Asia|<https://www.untamednews.com/feed/>|404|
|Thailand|Khaosod|<https://www.khaosod.co.th/rss.xml>|404|
|Thailand|Khaosod|<https://www.khaosod.co.th/rss/world.xml>|404|
|Thailand|Khaosod English|<https://www.khaosodenglish.com/world/rss>|404|
|Thailand|Manager|<https://www.manager.co.th/rss/business>|404|
|Thailand|Manager|<https://www.manager.co.th/rss/market>|404|
|Thailand|Manager Magazine Thailand|<https://www.manager.co.th/rss>|404|
|Thailand|PPTV|<https://www.pptvhd36.com/rss>|404|
|Thailand|PPTV|<https://www.pptvhd36.com/rss/politics.xml>|404|
|Thailand|Thai PBS Politics|<https://www.thaipbs.or.th/rss/politics.xml>|404|
|Thailand|Thaipbs|<https://www.thaipbs.or.th/feed/>|404|
|Thailand|ThaiPBS|<https://www.thaipbs.or.th/rss/home>|404|
|Thailand|The Thaiger|<https://thethaiger.com/thailand/rss>|404|
|Turkey|Anadolu Agency|<https://www.aa.com.tr/tr/rss/default.aspx>|404|
|Turkey|Anadolu Agency Economy|<https://www.aa.com.tr/tr/rss/ekonomi.xml>|404|
|Turkey|Bursa|<https://www.hurriyetdailynews.com/feed>|404|
|Turkey|DHA|<https://www.dha.com.tr/rss>|404|
|Turkey|En Son Haberler|<https://www.ensonhaber.com/rss>|404|
|Turkey|Haber7|<https://www.haber7.com/rss>|404|
|Turkey|Milliyet|<https://www.milliyet.com.tr/rss/rssnew.xml>|404|
|Turkey|Sondakika|<https://www.sondakika.com/rss/>|404|
|Turkey|TRT World|<https://www.trtworld.com/rss>|404|
|Turkey|Yeni Safak|<https://www.yenisafak.com/tr/rss>|404|
|United Arab Emirates|Al Bayan|<https://www.albayan.ae/rss>|404|
|United Arab Emirates|Emirates247|<https://www.emirates247.com/rss>|404|
|United Arab Emirates|Emirates247|<https://www.emirates247.com/rss/business.xml>|404|
|United Arab Emirates|Gulf News|<https://gulfnews.com/rss>|404|
|United Arab Emirates|Gulf News|<https://gulfnews.com/rss/world.xml>|404|
|United Arab Emirates|Gulf News|<https://gulfnews.com/rss/business.xml>|404|
|United Arab Emirates|Gulf News|<https://gulfnews.com/rss/sports.xml>|404|
|United Arab Emirates|Gulf News|<https://gulfnews.com/rss/usa.xml>|404|
|United Arab Emirates|Gulf News|<https://gulfnews.com/rss/middle-east.xml>|404|
|United Arab Emirates|Gulf News Business|<https://gulfnews.com/business/rss>|404|
|United Arab Emirates|Gulf News World|<https://gulfnews.com/world/rss>|404|
|United Arab Emirates|Khaleej Times|<https://www.khaleejtimes.com/rss>|404|
|United Arab Emirates|Khaleej Times|<https://www.khaleejtimes.com/rss/sports.xml>|404|
|United Arab Emirates|Khaleej Times|<https://www.khaleejtimes.com/rss/business.xml>|404|
|United Arab Emirates|Khaleej Times|<https://www.khaleejtimes.com/rss/world.xml>|404|
|United Arab Emirates|Khaleej Times Business|<https://www.khaleejtimes.com/tech/rss>|404|
|United Arab Emirates|Khaleej Times Sports|<https://www.khaleejtimes.com/sport/rss>|404|
|United Arab Emirates|Khaleej Times UAE|<https://www.khaleejtimes.com/uae/rss>|404|
|United Arab Emirates|Kuwait Times|<https://www.kuwaittimes.com/feed/>|404|
|United Arab Emirates|The National|<https://www.thenationalnews.com/rss>|404|
|United Arab Emirates|The National|<https://www.thenationalnews.com/rss/world.xml>|404|
|United Arab Emirates|The National Business|<https://www.thenationalnews.com/rss/business.xml>|404|
|United Arab Emirates|The National Technology|<https://www.thenationalnews.com/rss/tech>|404|
|United Arab Emirates|The National UAE|<https://www.thenationalnews.com/rss/uae.xml>|404|
|United Kingdom|London Evening Standard|<https://www.standard.co.uk/feed>|404|
|United Kingdom|Reuters UK (legacy)|<https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best>|404|
|United Kingdom|The Mirror|<https://www.mirror.co.uk/news/world/rss.xml>|404|
|United Kingdom|The Times|<https://www.thetimes.co.uk/rss/homepage/feed.xml>|404|
|United States|AP News|<https://apnews.com/feed>|404|
|United States|Atlanta Journal-Constitution|<https://www.ajc.com/arc/outboundfeeds/rss/?outputType=xml>|404|
|United States|Austin American-Statesman|<https://statesman.com/feed>|404|
|United States|Bleacher Report|<https://bleacherreport.com/feed>|404|
|United States|CBS Sports|<https://cbssports.com/feed>|404|
|United States|Christian Science Monitor|<https://csmonitor.com/feed>|404|
|United States|Complex|<https://complex.com/feed>|404|
|United States|Dallas Morning News|<https://dallasnews.com/feed>|404|
|United States|Detroit Free Press|<https://freep.com/feed>|404|
|United States|Inc Magazine|<https://www.inc.com/rss.xml>|404|
|United States|National Geographic|<https://nationalgeographic.com/feed>|404|
|United States|People|<https://people.com/feed>|404|
|United States|Philadelphia Inquirer|<https://inquirer.com/feed>|404|
|United States|Refinery29|<https://refinery29.com/feed>|404|
|United States|San Francisco Chronicle|<https://sfchronicle.com/feed>|404|
|United States|Scientific American|<https://www.scientificamerican.com/rss/>|404|
|United States|Scripps News|<https://scrippsnews.com/feed>|404|
|United States|Semafor|<https://semafor.com/feed>|404|
|United States|Star Tribune|<https://startribune.com/feed>|404|
|United States|Tampa Bay Times|<https://tampabay.com/feed>|404|
|United States|The Daily Beast|<https://thedailybeast.com/feed>|404|
|United States|Vice News|<https://vice.com/feed>|404|
|United States|Vulture|<https://vulture.com/feed>|404|
|United States|WebMD|<https://www.webmd.com/rss>|404|

#### HTML_RETURNED (85)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Argentina|Cronista (Crypto)|<https://www.cronista.com/feed/>|200|
|Argentina|La Nacion (Política)|<https://www.lanacion.com.ar/politica/?output=atom>|200|
|Argentina|La Politica Online|<https://www.lapoliticaonline.com/rss>|200|
|Argentina|La Voz|<https://www.lavoz.com.ar/rss/>|200|
|Argentina|La Voz del Interior|<https://www.lavoz.com.ar/rss>|200|
|Argentina|Minuto Uno|<https://www.minutouno.com/rss>|200|
|Argentina|Reporte Energía|<https://www.reporteenergia.com>|200|
|Australia|ABC News Radio|<https://www.abc.net.au/7.30/business/rss.xml>|200|
|Austria|Der Standard|<https://www.derstandard.at/standardplus?output=rss>|200|
|Austria|Die Presse|<https://www.diepresse.com/>|200|
|Belgium|RTBF|<https://www.rtbf.be/auvio/rss>|200|
|Belgium|RTBF|<https://www.rtbf.be/auvio/rss/news>|200|
|Brazil|Gazeta do Povo|<https://www.gazetadopovo.com.br/feed/>|200|
|Brazil|Valor|<https://www.valor.com.br/>|200|
|China|Caijing|<https://www.caijing.com.cn/rss/>|200|
|China|Caixin|<https://www.caixin.com/rss>|200|
|China|CNR|<https://english.cctv.com/rss/>|200|
|China|Liberty Times|<https://ltn.com.tw/feed>|200|
|China|TechNode Alt|<https://technode.com/rss/innovation>|200|
|France|Le Point|<https://www.lepoint.fr/24h-infos/rss.xml>|200|
|Germany|Süddeutsche Zeitung|<https://www.sueddeutsche.de/rss/topthemen>|200|
|Germany|Sueddeutsche Economy|<https://www.sueddeutsche.de/rss/wirtschaft>|200|
|Global Energy & Grid|Greentech Media|<https://www.greentechmedia.com/feeds/all.xml>|200|
|Global Energy & Grid|Renewables Now|<https://www.renewablesnow.com/feed/>|200|
|Iran|Iran International News|<https://www.iranintl.com/en/rss>|200|
|Iran|ISNA (IRNA Satellite)|<https://www.isna.ir/rss>|200|
|Japan|Sangyo Times|<https://sangyo-times.jp/rss/>|200|
|Mexico|Aristegui (Economía)|<https://aristeguinoticias.com/rss/economia/>|200|
|Mexico|Aristegui International|<https://aristeguinoticias.com/feeds/articles/rss/>|200|
|Mexico|Aristegui Noticias|<https://aristeguinoticias.com/feed/>|200|
|Mexico|Reforma|<https://www.reforma.com/rss>|200|
|Mexico|Reforma|<https://www.reforma.com/rss?output=rss>|200|
|Netherlands|Nieuwsuur|<https://nieuwsuur.nl/nieuws/rss.xml>|200|
|Norway|Dagens Næringsliv|<https://www.dn.no/rss/>|200|
|Norway|Nettavisen|<https://www.nettavisen.no/rss>|200|
|Norway|Nettavisen|<https://www.nettavisen.no/rss/nyheter>|200|
|Norway|Nettavisen|<https://www.nettavisen.no/rss/tech>|200|
|Norway|TV2|<https://www.tv2.no/rss>|200|
|Norway|TV2|<https://www.tv2.no/rss/>|200|
|Poland|Dziennik|<https://www.dziennik.pl/rss>|200|
|Poland|Gazeta Wyborcza|<https://www.wyborcza.pl/0,0.html?rss>|200|
|Poland|Puls Biznesu|<https://www.pb.pl/rss>|200|
|Russia|Oil Capital|<https://oilcapital.ru/feed>|200|
|Saudi Arabia|Al Eqtisadiah|<https://www.alriyadh.gov.sa/en/feed>|200|
|Saudi Arabia|Al Eqtisadiah|<https://www.alriyadh.gov.sa/en/rss/economy>|200|
|Saudi Arabia|Makkah Times|<https://www.makkahnewspaper.com/rss>|200|
|Spain|Agencia EFE|<https://www.efe.com/efe/espana/1/rss>|200|
|Spain|El Confidencial|<https://www.elconfidencial.com/rss/>|200|
|Spain|El Periodico|<https://www.elperiodico.com/es/rss>|200|
|Spain|La Vanguardia|<https://www.lavanguardia.com/rss>|200|
|Sweden|Expressen|<https://www.expressen.se/rss/>|200|
|Sweden|Metro Stockholm|<https://www.metro.se/feed>|200|
|Sweden|Metro Stockholm|<https://www.metro.se/rss/nyheter>|200|
|Sweden|Svenska Dagbladet (Ekonomi)|<https://www.svd.se/?output=rss>|200|
|Switzerland|LeTemps|<https://www.letemps.ch/rss>|200|
|Switzerland|NZZ|<https://www.nzz.ch/rss>|200|
|Switzerland|Radio 24|<https://www.rsi.ch/rss>|200|
|Switzerland|Radio Télévision Suisse|<https://www.rts.ch/>|200|
|Switzerland|Swissinfo|<https://www.swissinfo.ch/eng/rss/world>|200|
|Switzerland|Swissinfo Tech|<https://www.swissinfo.ch/eng/rss/tech>|200|
|Taiwan|Ming Pao Taiwan|<https://www.mpweekly.com/rss.xml>|200|
|Thailand|Bangkok Post|<https://www.bangkokpost.com/rss>|200|
|Thailand|Bangkok Post|<https://www.bangkokpost.com/rss/?category=world>|200|
|Thailand|Bangkok Post Business|<https://www.bangkokpost.com/rss/>|200|
|Thailand|Bangkok Post Economy|<https://www.bangkokpost.com/rss/?department=business>|200|
|Thailand|Matichon|<https://www.matichon.co.th/rss/economy>|200|
|Thailand|Matichon|<https://www.matichon.co.th/rss/world>|200|
|Thailand|Nation Thailand|<https://www.nationthailand.com/rss/politics>|200|
|Thailand|Post Today|<https://www.posttoday.com/rss>|200|
|Thailand|The Nation|<https://www.nationthailand.com/feed>|200|
|Thailand|The Nation|<https://www.nationthailand.com/rss/world>|200|
|Thailand|The Nation|<https://www.nationthailand.com/rss/society>|200|
|Turkey|Daily Sabah|<https://www.dailysabah.com/rss>|200|
|Turkey|Evrensel|<https://www.evrensel.net/rss>|200|
|Turkey|Milliyet|<https://www.milliyet.com.tr/rss/rssNews/rssNews>|200|
|Turkey|NTV|<https://www.ntv.com.tr/rss>|200|
|Turkey|Sabah|<https://www.sabah.com.tr/rss/>|200|
|Turkey|Sözcü|<https://www.sozcu.com.tr/rss>|200|
|Turkey|TAKİM|<https://www.t24.com.tr/rss>|200|
|Turkey|Takvim|<https://www.takvim.com.tr/rss>|200|
|United Arab Emirates|WAM|<https://wam.ae/en/xml/rss>|200|
|United Arab Emirates|Wam News|<https://wam.ae/en/rss>|200|
|United Kingdom|The Times|<https://www.thetimes.co.uk/world/world-news/>|200|
|United States|The Athletic|<https://theathletic.com/feed>|200|
|United States|USA Today|<http://rssfeeds.usatoday.com/UsatodaycomNation-TopStories>|200|

#### HTTP_403 (64)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Australia|Herald Sun|<https://www.heraldsun.com.au/rss/>|403|
|Australia|News.com.au|<https://www.news.com.au/>|403|
|Australia|News.com.au - Finance|<https://www.news.com.au/finance/feed>|403|
|Australia|News.com.au Business|<https://www.news.com.au/business/feed>|403|
|Australia|The Australian|<https://www.theaustralian.com.au/rss>|403|
|Australia|The Australian|<https://www.theaustralian.com.au/business/?output=rss>|403|
|Belgium|De Standaard|<https://www.standaard.be/feed>|403|
|Belgium|De Tijd|<https://www.tijd.be/rss>|403|
|Belgium|Le Soir|<https://www.lesoir.be/1/rss>|403|
|Belgium|Le Soir|<https://www.lesoir.be/rss/>|403|
|Belgium|Le Soir World|<https://www.lesoir.be/arc/outboundfeeds/rss/?outputType=xml>|403|
|Belgium|Sudpresse|<https://www.sudpresse.be/rss>|403|
|Canada|Canada's National Observer|<https://nationalobserver.com/front/rss>|403|
|China|China Securities Journal|<https://www.cs.com.cn/rss/>|403|
|France|Marianne|<https://www.marianne.net/rss.xml>|403|
|Germany|Rheinische Post|<https://rp-online.de/feed>|403|
|Germany|taz|<https://taz.de/RSS/>|403|
|Global Energy & Grid|Energy Voice|<https://www.energyvoice.com/feed/>|403|
|Global Energy & Grid|S&P Global|<https://www.spglobal.com/marketintelligence/en/rss>|403|
|Global Energy & Grid|S&P Global|<https://www.spglobal.com/marketintelligence/en/rss/energy>|403|
|India|Business Standard (Latest)|<https://www.business-standard.com/rss/latest.rss>|403|
|Indonesia|Tempo|<https://www.tempo.co/rss>|403|
|Indonesia|Tempo|<https://www.tempo.co/feed>|403|
|Indonesia|Tempo|<https://www.tempo.co/feed/>|403|
|Indonesia|Tribunnews|<https://www.tribunnews.com/rss>|403|
|Indonesia|Tribunnews|<https://www.tribunnews.com/feeds/>|403|
|Iran|Press TV|<https://www.presstv.com/rss>|403|
|Iran|Press TV|<https://www.presstv.com/english/rss>|403|
|Mexico|El Economista (Empresas)|<https://www.eleconomista.com.mx/rss/empresas>|403|
|Mexico|El Economista (Top)|<https://www.eleconomista.com.mx/rss/top-noticias>|403|
|Mexico|El Economista Politics|<https://www.eleconomista.com.mx/rss/politica>|403|
|Mexico|Forbes Mexico|<https://www.forbes.com.mx/feed/>|403|
|Mexico|Forbes México|<https://www.forbes.com.mx/rss/>|403|
|Mexico|Sin Embargo|<https://sinembargo.mx/feed>|403|
|Mexico|Sin Embargo|<https://www.sinembargo.mx/rss/>|403|
|Mexico|Sin Embargo MX|<https://sinembargo.mx/feed/>|403|
|Netherlands|De Telegraaf|<https://www.telegraaf.nl/rss>|403|
|Netherlands|Telegraaf|<https://www.telegraaf.nl/rss/achtergrond/>|403|
|Russia|Kommersant (World)|<https://www.kommersant.ru/rss/1206>|403|
|Russia|Kommersant Business|<https://www.kommersant.ru/rss/1207>|403|
|Saudi Arabia|Al Arabia|<https://www.alarabiya.net/rss/gulf.xml>|403|
|Saudi Arabia|Al Arabiya|<https://www.alarabiya.net/RSS>|403|
|Saudi Arabia|Al Arabiya|<https://www.alarabiya.net/rss/>|403|
|Saudi Arabia|Al Arabiya Science|<https://www.alarabiya.net/rss/world.xml>|403|
|Saudi Arabia|Al Arabiya World|<https://www.alarabiya.net/rss/arab-news.xml>|403|
|Saudi Arabia|Arab News|<https://www.arabnews.com/home/rss>|403|
|Saudi Arabia|Arab News|<https://www.arabnews.com/world/rss>|403|
|Saudi Arabia|Arab News (Business)|<https://www.arabnews.com/economy/rss>|403|
|Saudi Arabia|Riyad News|<https://www.arabnews.com/feed>|403|
|Saudi Arabia|Riyad News|<https://www.arabnews.com/node/2/rss>|403|
|Spain|El Economista|<https://www.eleconomista.es/rss>|403|
|Spain|El Economista|<https://www.eleconomista.es/rss/>|403|
|Spain|El Pais|<https://feeds.elpais.com/mrss-s/sections/politics>|403|
|Thailand|Prachatai|<https://prachatai.com/feed>|403|
|Thailand|Prachatai|<https://prachatai.com/rss/local>|403|
|Turkey|Bianet|<https://www.bianet.org/rss>|403|
|United Arab Emirates|Arabian Business|<https://www.arabianbusiness.com/rss.xml>|403|
|United Arab Emirates|Arabian Business|<https://www.arabianbusiness.com/rss.xml?output=1>|403|
|United Arab Emirates|Arabian Business|<https://www.arabianbusiness.com/rss>|403|
|United Kingdom|Energy Voice (North Sea Oil)|<https://www.energyvoice.com/feed/>|403|
|United Kingdom|The Economist|<https://www.economist.com/sections/united-states/rss.xml>|403|
|United States|Bloomberg|<https://bloomberg.com/feed>|403|
|United States|Houston Chronicle|<https://houstonchronicle.com/feed>|403|
|United States|Politico|<https://www.politico.com/rss/politicopicks.xml>|403|

#### NETWORK (21)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Austria|Presseportal Österreich|<https://www.presseportal.at/>|-|
|Austria|Wirtschaftsblatt|<https://www.wirtschaftsblatt.at/rss>|-|
|Belgium|Le Matin|<https://www.lematindemorgen.be/rss/>|-|
|Global Energy & Grid|Renewable Energy Storage|<https://www.renewableenergystorage.com/feed/>|-|
|Iran|Fars News|<https://www.farsnews.com/rss>|-|
|Iran|Iran News|<https://irannews.org/rss>|-|
|Iran|Tasnim|<https://www.tasnimnews.com/en/rss/all>|-|
|Iran|Tasnim|<https://www.tasnimnews.com/rss/all>|-|
|Iran|Tasnim (Economy)|<https://www.tasnimnews.com/fa/rss/finance>|-|
|Iran|Tasnim (Politics)|<https://www.tasnimnews.com/fa/rss/politics>|-|
|Saudi Arabia|Akhbar Alyom|<https://www.akhbaralyom.com/rss>|-|
|Saudi Arabia|Al Eqtisadiah|<https://www.ekhbarat.com/rss>|-|
|Saudi Arabia|Riyadh Bulletin|<https://www.riyadhebulletin.com/rss>|-|
|Taiwan|China Post Taiwan|<https://chinapostnow.com/rss>|-|
|Taiwan|Free Republic|<https://www.free-r.net/rss>|-|
|Taiwan|Taiwan Journal|<https://www.taiwanjournal.com/feed/>|-|
|Taiwan|Taiwan Review|<https://taiwanreview.net/feed/>|-|
|Taiwan|The China Post|<https://www.chinapost.com.tw/rss.xml>|-|
|Turkey|Anadolu|<https://www.aa.com.tr/rss>|-|
|United Arab Emirates|Dubai Eye|<https://www.dubaieye103.com/feed/>|-|
|United States|Barrons|<https://feeds.barrons.com/rss/TGW>|-|

#### TIMEOUT (14)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Belgium|Gazet van Antwerpen|<https://www.gva.be/feed/>|-|
|Canada|CBC News (Top Stories)|<https://www.cbc.ca/webfeed/rss/rss-topstories>|-|
|Iran|Financial Tribune|<https://financialtribune.com/feed>|-|
|Iran|Tehran Times|<https://www.tehrantimes.com/rss>|-|
|Iran|Tehran Times (Business)|<https://www.tehrantimes.com/rss.aspx?sectionId=2>|-|
|Russia|Meduza|<https://meduza.io/feed>|-|
|Switzerland|24 Heures|<https://www.24heures.ch/rss>|-|
|Switzerland|24 Heures|<https://www.24heures.ch/rss/>|-|
|Switzerland|Tages-Anzeiger|<https://www.tagesanzeiger.ch/rss>|-|
|Switzerland|Tages-Anzeiger|<https://www.tagesanzeiger.ch/wirtschaft/rss.xml>|-|
|Switzerland|Tages-Anzeiger|<https://www.tagesanzeiger.ch/schweiz/rss.xml>|-|
|United Kingdom|ITV News|<https://www.itv.com/news/uk/rss.xml>|-|
|United States|Miami Herald|<https://miamiherald.com/feed>|-|
|United States|Washington Post|<https://washingtonpost.com/feed>|-|

#### TLS (11)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Argentina|Mining Press|<https://miningpress.com>|-|
|China|China Power|<https://www.china.org.cn/eng/rss.xml>|-|
|China|China.org.cn|<https://www.china.org.cn/china/rss.xml>|-|
|China|Xinhua Net|<https://xinhuanet.com/feed>|-|
|Germany|Der Standard (DE)?|<https://www.standard.de/rss>|-|
|Global Energy & Grid|Energy Wire|<https://www.energywire.com/feed/>|-|
|Global Energy & Grid|Grid View|<https://www.grid.co.uk/feed/>|-|
|Japan|Denki Shimbun|<https://denkishimbun.com/feed/>|-|
|Japan|TechCrunch Japan|<https://jp.techcrunch.com/feed/>|-|
|Saudi Arabia|Al Riyadh|<https://www.alriyadh.com/rss/world>|-|
|Saudi Arabia|Al Riyadh|<https://www.alriyadh.com/rss/politics>|-|

#### HTTP_401 (4)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Global Energy & Grid|Reuters Energy|<https://www.reuters.com/energy/feed>|401|
|Japan|Reuters Japan|<https://www.reuters.com/world/asia-pacific/>|401|
|Russia|RG.ru|<https://rg.ru/feed>|401|
|United States|Reuters|<https://reuters.com/feed>|401|

#### HTTP_500 (4)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Australia|ABC News (Sport)|<https://www.abc.net.au/news/feed/2141674/rss.xml>|500|
|Japan|Nikkei Asia|<https://asia.nikkei.com/rss/feed/>|500|
|Japan|Nikkei Asia|<https://asia.nikkei.com/rss/news>|500|
|Japan|Nikkei Net|<https://asia.nikkei.com/rss/NI>|500|

#### HTTP_410 (3)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Austria|Oberösterreichische Nachrichten|<https://www.nachrichten.at/news/>|410|
|Switzerland|Swissinfo EN|<https://www.swissinfo.ch/eng/rss>|410|
|Turkey|Yeni Şafak|<https://www.yenisafak.com/rss.xml>|410|

#### INVALID_JSON (2)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Switzerland|NZZ|<https://www.nzz.ch/rss/themen.rss>|200|
|Switzerland|NZZ|<https://www.nzz.ch/politik.rss>|200|

#### HTTP_307 (1)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|China|Shanghai Daily|<https://www.shine.cn/rss>|307|

#### HTTP_530 (1)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Japan|Japan Macro Advisors|<https://japanmacroadvisors.com/>|530|

#### HTTP_429 (1)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Canada|TheCanadianPressNews (search)|<https://www.thecanadianpressnews.ca/search/?f=rss>|429|

#### HTTP_400 (1)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Brazil|Terra Brasil|<https://www.terra.com.br/rss/>|400|

#### HTTP_370 (1)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Spain|El Pais Politics|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/politica/portada>|370|

#### HTTP_502 (1)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Mexico|La Jornada|<https://www.jornada.com.mx/ultimas/feed>|502|

#### HTTP_405 (1)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Belgium|Le Vif|<https://www.levif.be/rss>|405|

### No-source rows
|Country|Outlet|
|---|---|
|South Korea|BusinessKorea|
|South Korea|Chosun Ilbo|
|South Korea|E Today|
|South Korea|E-Daily|
|South Korea|Hankooki|
|South Korea|Hankyoreh (EN)|
|South Korea|JoongAng (Korean)|
|South Korea|KBS/공영방송(추적용) - RSS directory|
|South Korea|Korea Economic Daily (KED, site)|
|South Korea|Korea JoongAng Daily|
|South Korea|Kyunghyang Shinmun|
|South Korea|MediaToday|
|South Korea|NewDaily|
|South Korea|News1|
|South Korea|OhmyNews|
|South Korea|Pressian|
|South Korea|Pulse (MK)|
|South Korea|Reuters Institute (Korea) - 자료/리포트|
|South Korea|Segye Ilbo|
|United States|Bing US Business Topic|
|United States|Bing US Politics Topic|
|United States|Bing US Tech Topic|
|United States|Bing US World Topic|
|United States|Google Arizona News|
|United States|Google California News|
|United States|Google Florida News|
|United States|Google Georgia News|
|United States|Google Illinois News|
|United States|Google New York News|
|United States|Google Ohio News|
|United States|Google Pennsylvania News|
|United States|Google Texas News|
|United States|Google US Business Topic|
|United States|Google US Politics Topic|
|United States|Google US Tech Topic|
|United States|Google US World Topic|
|United States|Google Washington News|
### United States (US)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|The New York Times|<https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml>|200|02/19/2026|valid|
2|Washington Post|<https://washingtonpost.com/feed>|ERR (TIMEOUT)|02/19/2026|invalid|
3|Wall Street Journal|<https://feeds.a.dj.com/rss/RSSWorldNews.xml>|200|02/19/2026|valid|
4|USA Today|<http://rssfeeds.usatoday.com/UsatodaycomNation-TopStories>|200 (HTML_RETURNED)|02/19/2026|invalid|
5|LA Times|<https://www.latimes.com/local/rss2.0.xml>|200|02/19/2026|valid|
6|CNN|<http://rss.cnn.com/rss/cnn_topstories.rss>|200|02/19/2026|valid|
7|Fox News|<http://moxie.foxnews.com/google-publisher/latest.xml>|200|02/19/2026|valid|
8|NBC News|<http://feeds.nbcnews.com/nbcnews/public/news>|200|02/19/2026|valid|
9|CBS News|<https://www.cbsnews.com/latest/rss/main>|200|02/19/2026|valid|
10|ABC News|<https://abcnews.go.com/abcnews/topstories>|200|02/19/2026|valid|
11|NPR|<https://feeds.npr.org/1001/rss.xml>|200|02/19/2026|valid|
12|AP News|<https://apnews.com/feed>|404 (HTTP_404)|02/19/2026|invalid|
13|Reuters|<https://reuters.com/feed>|401 (HTTP_401)|02/19/2026|invalid|
14|HuffPost|<https://www.huffpost.com/section/front-page/feed>|200|02/19/2026|valid|
15|BuzzFeed News|<https://www.buzzfeednews.com/news.xml>|200|02/19/2026|valid|
16|Vice News|<https://vice.com/feed>|404 (HTTP_404)|02/19/2026|invalid|
17|Vox|<https://www.vox.com/rss/index.xml>|200|02/19/2026|valid|
18|Bloomberg|<https://bloomberg.com/feed>|403 (HTTP_403)|02/19/2026|invalid|
19|CNBC|<https://www.cnbc.com/id/100003114/device/rss/rss.html>|200|02/19/2026|valid|
20|Financial Times|<https://www.ft.com/?format=rss>|200|02/19/2026|valid|
21|Forbes|<https://www.forbes.com/most-popular/feed/>|200|02/19/2026|valid|
22|Fortune|<https://fortune.com/feed>|200|02/19/2026|valid|
23|Business Insider|<https://www.businessinsider.com/rss>|200|02/19/2026|valid|
24|MarketWatch|<http://feeds.marketwatch.com/marketwatch/topstories/>|200|02/19/2026|valid|
25|Barrons|<https://feeds.barrons.com/rss/TGW>|ERR (NETWORK)|02/19/2026|invalid|
26|Inc Magazine|<https://www.inc.com/rss.xml>|404 (HTTP_404)|02/19/2026|invalid|
27|Fast Company|<https://www.fastcompany.com/rss>|200|02/19/2026|valid|
28|TechCrunch|<https://techcrunch.com/feed/>|200|02/19/2026|valid|
29|The Verge|<https://www.theverge.com/rss/index.xml>|200|02/19/2026|valid|
30|Wired|<https://www.wired.com/feed/rss>|200|02/19/2026|valid|
31|Ars Technica|<http://feeds.arstechnica.com/arstechnica/index>|200|02/19/2026|valid|
32|Engadget|<https://www.engadget.com/rss.xml>|200|02/19/2026|valid|
33|VentureBeat|<https://venturebeat.com/feed/>|200|02/19/2026|valid|
34|Mashable|<https://mashable.com/feed>|200|02/19/2026|valid|
35|Gizmodo|<https://gizmodo.com/rss>|200|02/19/2026|valid|
36|CNET|<https://www.cnet.com/rss/news/>|200|02/19/2026|valid|
37|ZDNet|<https://www.zdnet.com/news/rss.xml>|200|02/19/2026|valid|
38|Politico|<https://www.politico.com/rss/politicopicks.xml>|403 (HTTP_403)|02/19/2026|invalid|
39|The Hill|<https://thehill.com/feed>|200|02/19/2026|valid|
40|Axios|<https://api.axios.com/feed/>|200|02/19/2026|valid|
41|Breitbart|<http://feeds.feedburner.com/breitbart>|200|02/19/2026|valid|
42|National Review|<https://www.nationalreview.com/feed/>|200|02/19/2026|valid|
43|Slate|<https://slate.com/feeds/all.rss>|200|02/19/2026|valid|
44|The New Yorker|<https://www.newyorker.com/feed/everything>|200|02/19/2026|valid|
45|The Atlantic|<https://www.theatlantic.com/feed/all/>|200|02/19/2026|valid|
46|Google US World Topic|N/A|❌ NO_SOURCE|02/19/2026|needs verification|
47|Google US Politics Topic|N/A|❌ NO_SOURCE|02/19/2026|needs verification|
48|Google US Business Topic|N/A|❌ NO_SOURCE|02/19/2026|needs verification|
49|Google US Tech Topic|N/A|❌ NO_SOURCE|02/19/2026|needs verification|
50|Google California News|N/A|❌ NO_SOURCE|02/19/2026|needs verification|
51|Google Texas News|N/A|❌ NO_SOURCE|02/19/2026|needs verification|
52|Google Florida News|N/A|❌ NO_SOURCE|02/19/2026|needs verification|
53|Google New York News|N/A|❌ NO_SOURCE|02/19/2026|needs verification|
54|Google Illinois News|N/A|❌ NO_SOURCE|02/19/2026|needs verification|
55|Google Arizona News|N/A|❌ NO_SOURCE|02/19/2026|needs verification|
56|Google Georgia News|N/A|❌ NO_SOURCE|02/19/2026|needs verification|
57|Google Ohio News|N/A|❌ NO_SOURCE|02/19/2026|needs verification|
58|Google Pennsylvania News|N/A|❌ NO_SOURCE|02/19/2026|needs verification|
59|Google Washington News|N/A|❌ NO_SOURCE|02/19/2026|needs verification|
60|Boston Globe|<https://www.bostonglobe.com/arc/outboundfeeds/rss?outputType=xml>|200|02/19/2026|valid|
61|Philadelphia Inquirer|<https://inquirer.com/feed>|404 (HTTP_404)|02/19/2026|invalid|
62|Miami Herald|<https://miamiherald.com/feed>|ERR (TIMEOUT)|02/19/2026|invalid|
63|Atlanta Journal-Constitution|<https://www.ajc.com/arc/outboundfeeds/rss/?outputType=xml>|404 (HTTP_404)|02/19/2026|invalid|
64|New York Post|<https://nypost.com/feed>|200|02/19/2026|valid|
65|Chicago Tribune|<https://chicagotribune.com/feed>|200|02/19/2026|valid|
66|Detroit Free Press|<https://freep.com/feed>|404 (HTTP_404)|02/19/2026|invalid|
67|Star Tribune|<https://startribune.com/feed>|404 (HTTP_404)|02/19/2026|invalid|
68|Cleveland Plain Dealer|<https://www.cleveland.com/arc/outboundfeeds/rss/?outputType=xml>|200|02/19/2026|valid|
69|Houston Chronicle|<https://houstonchronicle.com/feed>|403 (HTTP_403)|02/19/2026|invalid|
70|Dallas Morning News|<https://dallasnews.com/feed>|404 (HTTP_404)|02/19/2026|invalid|
71|Austin American-Statesman|<https://statesman.com/feed>|404 (HTTP_404)|02/19/2026|invalid|
72|Tampa Bay Times|<https://tampabay.com/feed>|404 (HTTP_404)|02/19/2026|invalid|
73|San Francisco Chronicle|<https://sfchronicle.com/feed>|404 (HTTP_404)|02/19/2026|invalid|
74|Seattle Times|<https://seattletimes.com/feed>|200|02/19/2026|valid|
75|Denver Post|<https://denverpost.com/feed>|200|02/19/2026|valid|
76|San Jose Mercury News|<https://mercurynews.com/feed>|200|02/19/2026|valid|
77|Las Vegas Review-Journal|<https://reviewjournal.com/feed>|200|02/19/2026|valid|
78|San Diego Union-Tribune|<https://sandiegouniontribune.com/feed>|200|02/19/2026|valid|
79|Honolulu Star-Advertiser|<https://staradvertiser.com/feed>|200|02/19/2026|valid|
80|Variety|<https://variety.com/feed>|200|02/19/2026|valid|
81|The Hollywood Reporter|<https://hollywoodreporter.com/feed>|200|02/19/2026|valid|
82|Deadline|<https://deadline.com/feed>|200|02/19/2026|valid|
83|Rolling Stone|<https://rollingstone.com/feed>|200|02/19/2026|valid|
84|Billboard|<https://billboard.com/feed>|200|02/19/2026|valid|
85|Vulture|<https://vulture.com/feed>|404 (HTTP_404)|02/19/2026|invalid|
86|Vanity Fair|<http://feeds.feedburner.com/vfdotcomrss>|200|02/19/2026|valid|
87|Esquire|<https://www.esquire.com/rss/entertainment.xml>|200|02/19/2026|valid|
88|GQ|<https://www.gq.com/feed/rss>|200|02/19/2026|valid|
89|People|<https://people.com/feed>|404 (HTTP_404)|02/19/2026|invalid|
90|Scientific American|<https://www.scientificamerican.com/rss/>|404 (HTTP_404)|02/19/2026|invalid|
91|National Geographic|<https://nationalgeographic.com/feed>|404 (HTTP_404)|02/19/2026|invalid|
92|STAT News|<https://statnews.com/feed>|200|02/19/2026|valid|
93|WebMD|<https://www.webmd.com/rss>|404 (HTTP_404)|02/19/2026|invalid|
94|Space.com|<https://www.space.com/feeds/all>|200|02/19/2026|valid|
95|ESPN|<https://www.espn.com/espn/rss/news>|200|02/19/2026|valid|
96|Sports Illustrated|<https://si.com/feed>|200|02/19/2026|valid|
97|Bleacher Report|<https://bleacherreport.com/feed>|404 (HTTP_404)|02/19/2026|invalid|
98|The Athletic|<https://theathletic.com/feed>|200 (HTML_RETURNED)|02/19/2026|invalid|
99|CBS Sports|<https://cbssports.com/feed>|404 (HTTP_404)|02/19/2026|invalid|
100|The Daily Beast|<https://thedailybeast.com/feed>|404 (HTTP_404)|02/19/2026|invalid|
101|Mother Jones|<https://motherjones.com/feed>|200|02/19/2026|valid|
102|ProPublica|<https://propublica.org/feed>|200|02/19/2026|valid|
103|Reason|<https://reason.com/feed>|200|02/19/2026|valid|
104|Jacobin|<https://jacobin.com/feed>|200|02/19/2026|valid|
105|Quartz|<https://qz.com/feed>|200|02/19/2026|valid|
106|The Intercept|<https://theintercept.com/feed>|200|02/19/2026|valid|
107|Complex|<https://complex.com/feed>|404 (HTTP_404)|02/19/2026|invalid|
108|Refinery29|<https://refinery29.com/feed>|404 (HTTP_404)|02/19/2026|invalid|
109|Newsweek|<https://www.newsweek.com/rss>|200|02/19/2026|valid|
110|Time|<https://time.com/feed>|200|02/19/2026|valid|
111|PBS NewsHour|<https://www.pbs.org/newshour/feeds/rss/headlines>|200|02/19/2026|valid|
112|Christian Science Monitor|<https://csmonitor.com/feed>|404 (HTTP_404)|02/19/2026|invalid|
113|Semafor|<https://semafor.com/feed>|404 (HTTP_404)|02/19/2026|invalid|
114|Scripps News|<https://scrippsnews.com/feed>|404 (HTTP_404)|02/19/2026|invalid|
115|Bing US Politics Topic|N/A|❌ NO_SOURCE|02/19/2026|needs verification|
116|Bing US Business Topic|N/A|❌ NO_SOURCE|02/19/2026|needs verification|
117|Bing US Tech Topic|N/A|❌ NO_SOURCE|02/19/2026|needs verification|
118|Bing US World Topic|N/A|❌ NO_SOURCE|02/19/2026|needs verification|

### China (CN)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|Xinhua Net|<https://xinhuanet.com/feed>|ERR (TLS)|02/19/2026|invalid|
2|People's Daily|<https://people.com.cn/feed>|404 (HTTP_404)|02/19/2026|invalid|
3|Global Times|<https://globaltimes.cn/feed>|404 (HTTP_404)|02/19/2026|invalid|
4|China Daily|<http://www.chinadaily.com.cn/rss/world_rss.xml>|200|02/19/2026|valid|
5|Caixin Global|<https://caixinglobal.com/feed>|404 (HTTP_404)|02/19/2026|invalid|
6|The Paper|<https://thepaper.cn/feed>|404 (HTTP_404)|02/19/2026|invalid|
7|Jiemian|<https://jiemian.com/feed>|404 (HTTP_404)|02/19/2026|invalid|
8|Yicaiglobal|<https://yicaiglobal.com/feed>|404 (HTTP_404)|02/19/2026|invalid|
9|TechNode|<https://technode.com/feed>|200|02/19/2026|valid|
10|South China Morning Post|<https://www.scmp.com/rss/91/feed>|200|02/19/2026|valid|
11|Initium|<https://theinitium.com/feed>|200|02/19/2026|valid|
12|United Daily News|<https://udn.com/feed>|404 (HTTP_404)|02/19/2026|invalid|
13|Liberty Times|<https://ltn.com.tw/feed>|200 (HTML_RETURNED)|02/19/2026|invalid|
14|China Times|<https://chinatimes.com/feed>|404 (HTTP_404)|02/19/2026|invalid|
15|Caijing|<https://www.caijing.com.cn/rss/>|200 (HTML_RETURNED)|02/19/2026|invalid|
16|China Securities Journal|<https://www.cs.com.cn/rss/>|403 (HTTP_403)|02/19/2026|invalid|
17|People|<https://www.people.cn/rss/people.xml>|404 (HTTP_404)|02/19/2026|invalid|
18|Xinhua (World)|<https://english.news.cn/rss/english.rss>|404 (HTTP_404)|02/19/2026|invalid|
19|CNR|<https://english.cctv.com/rss/>|200 (HTML_RETURNED)|02/19/2026|invalid|
20|Shanghai Daily|<https://www.shine.cn/rss>|307 (HTTP_307)|02/19/2026|invalid|
21|China Power|<https://www.china.org.cn/eng/rss.xml>|ERR (TLS)|02/19/2026|invalid|
22|Sina China|<https://rss.sina.com.cn/tech/feed.xml>|404 (HTTP_404)|02/19/2026|invalid|
23|People China|<https://people.com.cn/rss/politics.xml>|200|02/19/2026|valid|
24|South China Morning Post (Business)|<https://www.scmp.com/rss/2/0/feed>|404 (HTTP_404)|02/19/2026|invalid|
25|TechNode Alt|<https://technode.com/rss/innovation>|200 (HTML_RETURNED)|02/19/2026|invalid|
26|China Digital Times|<https://chinadigitaltimes.net/china/feed>|404 (HTTP_404)|02/19/2026|invalid|
27|China Daily English|<https://www.chinadaily.com.cn/rss/world_rss.xml>|200|02/19/2026|valid|
28|Caixin|<https://www.caixin.com/rss>|200 (HTML_RETURNED)|02/19/2026|invalid|
29|China.org.cn|<https://www.china.org.cn/china/rss.xml>|ERR (TLS)|02/19/2026|invalid|
30|Global Times US|<https://www.globaltimes.cn/rss/7/>|404 (HTTP_404)|02/19/2026|invalid|

### Japan (JP)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|NHK World (EN)|<https://www3.nhk.or.jp/rss/news/cat0.xml>|200|02/19/2026|valid|
2|Mainichi (Biz)|<https://mainichi.jp/rss/etc/english_latest.rss>|200|02/19/2026|valid|
3|Asahi Shimbun|<https://www.asahi.com/rss/asahi/newsheadlines.rdf>|200|02/19/2026|valid|
4|The Japan Times|<https://www.japantimes.co.jp/feed/>|200|02/19/2026|valid|
5|Nikkei|<https://www.nikkei.com/rss/>|404 (HTTP_404)|02/19/2026|invalid|
6|Yomiuri Shimbun|<https://www.yomiuri.co.jp/rss/>|404 (HTTP_404)|02/19/2026|invalid|
7|Toyo Keizai|<https://toyokeizai.net/feed/>|404 (HTTP_404)|02/19/2026|invalid|
8|DIAMOND|<https://diamond.jp/feed/>|404 (HTTP_404)|02/19/2026|invalid|
9|DIAMOND (President)|<https://president.jp/feed/>|404 (HTTP_404)|02/19/2026|invalid|
10|Japan Macro Advisors|<https://japanmacroadvisors.com/>|530 (HTTP_530)|02/19/2026|invalid|
11|Denki Shimbun|<https://denkishimbun.com/feed/>|ERR (TLS)|02/19/2026|invalid|
12|ITmedia (EEtimes)|<https://eetimes.itmedia.co.jp/rss/>|404 (HTTP_404)|02/19/2026|invalid|
13|Sangyo Times|<https://sangyo-times.jp/rss/>|200 (HTML_RETURNED)|02/19/2026|invalid|
14|Automotive Ten-Navi|<https://automotive.ten-navi.com/rss/>|200|02/19/2026|valid|
15|The Bridge|<https://thebridge.jp/feed/>|200|02/19/2026|valid|
16|TechCrunch Japan|<https://jp.techcrunch.com/feed/>|ERR (TLS)|02/19/2026|invalid|
17|Kabutan|<https://kabutan.jp/rss.xml>|404 (HTTP_404)|02/19/2026|invalid|
18|Bloomberg Japan|<https://www.bloomberg.co.jp/feed/>|404 (HTTP_404)|02/19/2026|invalid|
19|Reuters Japan|<https://www.reuters.com/world/asia-pacific/>|401 (HTTP_401)|02/19/2026|invalid|
20|Nippon|<https://www.nippon.com/en/feed/>|200|02/19/2026|valid|
21|Nikkei Asia|<https://asia.nikkei.com/rss/feed/>|500 (HTTP_500)|02/19/2026|invalid|
22|Nikkei Net|<https://asia.nikkei.com/rss/NI>|500 (HTTP_500)|02/19/2026|invalid|
23|Nikkei 20|<https://www.nikkei.com/markets/asia/rss/>|404 (HTTP_404)|02/19/2026|invalid|
24|NHK General|<https://www3.nhk.or.jp/rss/news/cat0.rdf>|404 (HTTP_404)|02/19/2026|invalid|
25|Mainichi Sports|<https://mainichi.jp/rss/etc/english_latest.rss>|200|02/19/2026|valid|
26|Japan Business Federation|<https://www.keidanren.or.jp/keidanren/rss.xml>|404 (HTTP_404)|02/19/2026|invalid|
27|Nikkei (Business)|<https://www.nikkei.com/rss/nkeg/feed/>|404 (HTTP_404)|02/19/2026|invalid|
28|The Tokyo Shimbun|<https://www.tokyo-np.co.jp/rdf/>|404 (HTTP_404)|02/19/2026|invalid|
29|Nikkei Asia|<https://asia.nikkei.com/rss/news>|500 (HTTP_500)|02/19/2026|invalid|
30|Mainichi World|<https://mainichi.jp/rss/etc/english_latest.rss>|200|02/19/2026|valid|

### Germany (DE)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|Handelsblatt - Top|<https://www.handelsblatt.com/contentexport/feed/top-themen>|200|02/19/2026|valid|
2|Handelsblatt - Finance|<https://www.handelsblatt.com/contentexport/feed/finanzen>|200|02/19/2026|valid|
3|Tagesschau|<https://www.tagesschau.de/xml/rss2>|200|02/19/2026|valid|
4|Der Spiegel|<https://www.spiegel.de/schlagzeilen/tops/index.rss>|200|02/19/2026|valid|
5|FAZ|<https://www.faz.net/rss/aktuell/>|200|02/19/2026|valid|
6|Die Zeit|<https://newsfeed.zeit.de/index>|200|02/19/2026|valid|
7|Manager Magazin|<https://www.manager-magazin.de/unternehmen/index.rss>|200|02/19/2026|valid|
8|WirtschaftsWoche|<https://www.wiwo.de/contentexport/feed/rss/schlagzeilen>|200|02/19/2026|valid|
9|Deutsche Welle (EN)|<https://rss.dw.com/xml/rss-en-all>|200|02/19/2026|valid|
10|Heise Online|<https://www.heise.de/rss/heise-atom.xml>|200|02/19/2026|valid|
11|Süddeutsche Zeitung|<https://rss.sueddeutsche.de/rss/top>|404 (HTTP_404)|02/19/2026|invalid|
12|Der Spiegel|<https://www.spiegel.de/schlagzeilen/index.rss>|200|02/19/2026|valid|
13|Frankfurter Allgemeine|<https://www.faz.net/aktuell/rss.html>|404 (HTTP_404)|02/19/2026|invalid|
14|Die Welt|<https://www.welt.de/feeds/topnews.rss>|200|02/19/2026|valid|
15|Manager Magazin (Startups)|<https://www.manager-magazin.de/magazin/rss/unternehmen/>|404 (HTTP_404)|02/19/2026|invalid|
16|Focus|<https://www.focus.de/rss/>|200|02/19/2026|valid|
17|Handelsblatt Economy|<https://www.handelsblatt.com/contentexport/feed/finanzen/>|200|02/19/2026|valid|
18|Frankfurter Allgemeine|<https://www.faz.net/rss/aktuell/wirtschaft/>|200|02/19/2026|valid|
19|Süddeutsche Zeitung|<https://www.sueddeutsche.de/rss/topthemen>|200 (HTML_RETURNED)|02/19/2026|invalid|
20|Tagesspiegel|<https://www.tagesspiegel.de/contentexport/feed/>|200|02/19/2026|valid|
21|Rheinische Post|<https://rp-online.de/feed>|403 (HTTP_403)|02/19/2026|invalid|
22|Der Standard (DE)?|<https://www.standard.de/rss>|ERR (TLS)|02/19/2026|invalid|
23|Sueddeutsche Economy|<https://www.sueddeutsche.de/rss/wirtschaft>|200 (HTML_RETURNED)|02/19/2026|invalid|
24|Handelsblatt World|<https://www.handelsblatt.com/contentexport/feed/wirtschaft>|200|02/19/2026|valid|
25|Zeit Welt|<https://newsfeed.zeit.de/wirtschaft/index>|200|02/19/2026|valid|
26|SWR|<https://www.swr.de/politik/unternehmen-rss.xml>|404 (HTTP_404)|02/19/2026|invalid|
27|taz|<https://taz.de/RSS/>|403 (HTTP_403)|02/19/2026|invalid|
28|Financial Times Germany|<https://www.ft.com/rss/home>|200|02/19/2026|valid|
29|Financial Times Germany|<https://www.ft.com/world/world?format=rss>|404 (HTTP_404)|02/19/2026|invalid|
30|Der Spiegel|<https://www.spiegel.de/contentfeed/schlagzeilen.rss>|404 (HTTP_404)|02/19/2026|invalid|

### India (IN)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|The Times of India (Top Stories)|<https://timesofindia.indiatimes.com/rssfeedstopstories.cms>|200|02/19/2026|valid|
2|NDTV (Latest)|<https://feeds.feedburner.com/NDTV-LatestNews>|200|02/19/2026|valid|
3|India Today (India)|<https://www.indiatoday.in/rss/1206578>|200|02/19/2026|valid|
4|The Indian Express|<https://indianexpress.com/feed>|200|02/19/2026|valid|
5|The Hindu (National)|<https://www.thehindu.com/news/national/?service=rss>|200|02/19/2026|valid|
6|Firstpost|<https://www.firstpost.com/commonfeeds/v1/mfp/rss/web-stories.xml>|200|02/19/2026|valid|
7|Business Standard (Latest)|<https://www.business-standard.com/rss/latest.rss>|403 (HTTP_403)|02/19/2026|invalid|
8|DNA India (India)|<https://www.dnaindia.com/feeds/india.xml>|200|02/19/2026|valid|
9|Storify News|<https://www.storifynews.com/feed>|200|02/19/2026|valid|
10|Amar Ujala (Breaking)|<https://www.amarujala.com/rss/breaking-news.xml>|200|02/19/2026|valid|
11|Odishabarta|<https://odishabarta.com/feed>|200|02/19/2026|valid|
12|The Times of Bengal|<https://thetimesofbengal.com/feed>|200|02/19/2026|valid|
13|Scroll.in|<https://feeds.feedburner.com/ScrollinArticles.rss>|200|02/19/2026|valid|
14|Northlines|<https://thenorthlines.com/feed>|200|02/19/2026|valid|
15|Chandigarh Metro|<https://chandigarhmetro.com/feed>|200|02/19/2026|valid|
16|Chandigarh City News|<https://feeds.feedburner.com/ChandigarhCityNews>|200|02/19/2026|valid|
17|The Quint|<https://prod-qt-images.s3.amazonaws.com/production/thequint/feed.xml>|200|02/19/2026|valid|
18|Telangana Today|<https://telanganatoday.com/feed>|200|02/19/2026|valid|
19|Daily Excelsior|<https://www.dailyexcelsior.com/feed>|200|02/19/2026|valid|
20|News Today (TN)|<https://newstodaynet.com/feed>|200|02/19/2026|valid|
21|IndiaVision|<https://www.indiavision.com/feed>|200|02/19/2026|valid|
22|OpIndia|<https://www.opindia.com/feed>|200|02/19/2026|valid|
23|OrissaPOST|<https://www.orissapost.com/feed>|200|02/19/2026|valid|
24|India's News.Net|<https://feeds.indiasnews.net/rss/701ee96610c884a6>|200|02/19/2026|valid|
25|TechGenYZ|<https://techgenyz.com/feed>|200|02/19/2026|valid|
26|Kashmir News|<https://kashmirnews.in/feed>|200|02/19/2026|valid|
27|WYM News (Blogspot)|<https://latestnewsupdate4you.blogspot.com/feeds/posts/default>|200|02/19/2026|valid|
28|Star of Mysore|<https://starofmysore.com/feed>|200|02/19/2026|valid|
29|ABP News|<https://news.abplive.com/home/feed>|200|02/19/2026|valid|
30|The India Bizz|<https://theindiabizz.com/feed>|200|02/19/2026|valid|

### United Kingdom (GB)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|Financial Times - World|<https://www.ft.com/rss/world>|200|02/19/2026|valid|
2|Financial Times - Energy|<https://www.ft.com/rss/companies/energy>|200|02/19/2026|valid|
3|BBC News - Business|<https://feeds.bbci.co.uk/news/business/rss.xml>|200|02/19/2026|valid|
4|BBC News - World|<https://feeds.bbci.co.uk/news/world/rss.xml>|200|02/19/2026|valid|
5|The Guardian - World|<https://www.theguardian.com/world/rss>|200|02/19/2026|valid|
6|The Guardian - Business|<https://www.theguardian.com/business/rss>|200|02/19/2026|valid|
7|Sky News - World|<https://feeds.skynews.com/feeds/rss/world.xml>|200|02/19/2026|valid|
8|Sky News - Business|<https://feeds.skynews.com/feeds/rss/business.xml>|200|02/19/2026|valid|
9|Telegraph - Business|<https://www.telegraph.co.uk/business/rss.xml>|200|02/19/2026|valid|
10|City A.M. (London Finance)|<https://www.cityam.com/feed/>|200|02/19/2026|valid|
11|Energy Voice (North Sea Oil)|<https://www.energyvoice.com/feed/>|403 (HTTP_403)|02/19/2026|invalid|
12|Reuters UK (legacy)|<https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best>|404 (HTTP_404)|02/19/2026|invalid|
13|The Independent|<https://www.independent.co.uk/rss>|200|02/19/2026|valid|
14|Financial Times UK|<https://www.ft.com/?format=rss>|200|02/19/2026|valid|
15|The Economist|<https://www.economist.com/sections/united-states/rss.xml>|403 (HTTP_403)|02/19/2026|invalid|
16|The Times|<https://www.thetimes.co.uk/rss/homepage/feed.xml>|404 (HTTP_404)|02/19/2026|invalid|
17|The Telegraph UK|<https://www.telegraph.co.uk/rss.xml>|200|02/19/2026|valid|
18|ITV News|<https://www.itv.com/news/uk/rss.xml>|ERR (TIMEOUT)|02/19/2026|invalid|
19|Daily Mail|<https://www.dailymail.co.uk/home/index.rss>|200|02/19/2026|valid|
20|The Mirror|<https://www.mirror.co.uk/news/world/rss.xml>|404 (HTTP_404)|02/19/2026|invalid|
21|Metro UK|<https://metro.co.uk/feed/>|200|02/19/2026|valid|
22|The Sun|<https://www.thesun.co.uk/feed/>|200|02/19/2026|valid|
23|The Guardian UK|<https://www.theguardian.com/uk/rss>|200|02/19/2026|valid|
24|Sky News|<https://feeds.skynews.com/feeds/rss/uk.xml>|200|02/19/2026|valid|
25|Financial Times|<https://www.ft.com/rss/home>|200|02/19/2026|valid|
26|The Times|<https://www.thetimes.co.uk/world/world-news/>|200 (HTML_RETURNED)|02/19/2026|invalid|
27|iNews|<https://inews.co.uk/rss>|200|02/19/2026|valid|
28|BBC Culture|<https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml>|200|02/19/2026|valid|
29|The Evening Standard|<https://www.standard.co.uk/rss>|200|02/19/2026|valid|
30|London Evening Standard|<https://www.standard.co.uk/feed>|404 (HTTP_404)|02/19/2026|invalid|

### France (FR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|France 24|<https://www.france24.com/en/rss>|200|02/19/2026|valid|
2|The Local (France)|<https://feeds.thelocal.com/rss/fr>|200|02/19/2026|valid|
3|RFI (France)|<https://www.rfi.fr/en/france/rss>|200|02/19/2026|valid|
4|RFI (All / EN)|<https://www.rfi.fr/en/rss>|200|02/19/2026|valid|
5|Mediapart|<https://www.mediapart.fr/articles/feed>|200|02/19/2026|valid|
6|Le Monde diplomatique|<https://mondediplo.com/backend>|200|02/19/2026|valid|
7|Midi Libre|<https://www.midilibre.fr/essentiel/rss.xml>|404 (HTTP_404)|02/19/2026|invalid|
8|Sud Ouest|<https://www.sudouest.fr/essentiel/rss.xml>|200|02/19/2026|valid|
9|L'Est Républicain|<https://www.estrepublicain.fr/rss>|200|02/19/2026|valid|
10|France Soir|<https://www.francesoir.fr/rss.xml>|200|02/19/2026|valid|
11|Dernières Nouvelles d'Alsace (DNA)|<https://www.dna.fr/rss>|200|02/19/2026|valid|
12|La Croix|<https://www.la-croix.com/feeds/rss/site.xml>|200|02/19/2026|valid|
13|Marianne|<https://www.marianne.net/rss.xml>|403 (HTTP_403)|02/19/2026|invalid|
14|La Dépêche|<https://www.ladepeche.fr/rss.xml>|200|02/19/2026|valid|
15|20 Minutes|<https://www.20minutes.fr/feeds/rss-une.xml>|200|02/19/2026|valid|
16|Le Point|<https://www.lepoint.fr/24h-infos/rss.xml>|200 (HTML_RETURNED)|02/19/2026|invalid|
17|Yahoo Actualités|<https://fr.news.yahoo.com/rss>|200|02/19/2026|valid|
18|InfoMigrants (EN)|<https://www.infomigrants.net/en/rss/all.xml>|200|02/19/2026|valid|
19|France Today|<https://www.francetoday.com/feed>|200|02/19/2026|valid|
20|FrenchDailyNews|<https://frenchdailynews.com/feed>|200|02/19/2026|valid|
21|Le Monde (EN – Main)|<https://www.lemonde.fr/en/rss/une.xml>|200|02/19/2026|valid|
22|Le Monde (EN – International)|<https://www.lemonde.fr/en/international/rss_full.xml>|200|02/19/2026|valid|
23|Le Monde (EN – Editorials)|<https://www.lemonde.fr/en/editorials/rss_full.xml>|200|02/19/2026|valid|
24|Le Monde (EN – Europe)|<https://www.lemonde.fr/en/europe/rss_full.xml>|200|02/19/2026|valid|
25|Le Monde (EN – United States)|<https://www.lemonde.fr/en/united-states/rss_full.xml>|200|02/19/2026|valid|
26|Le Monde (EN – Economy)|<https://www.lemonde.fr/en/economy/rss_full.xml>|200|02/19/2026|valid|
27|Le Monde (EN – Culture)|<https://www.lemonde.fr/en/culture/rss_full.xml>|200|02/19/2026|valid|
28|Le Monde (EN – Sports)|<https://www.lemonde.fr/en/sports/rss_full.xml>|200|02/19/2026|valid|
29|Le Monde (EN – Environment)|<https://www.lemonde.fr/en/environment/rss_full.xml>|200|02/19/2026|valid|
30|Le Monde (EN – Science)|<https://www.lemonde.fr/en/science/rss_full.xml>|200|02/19/2026|valid|

### Italy (IT)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|ANSA (Main)|<https://www.ansa.it/sito/ansait_rss.xml>|200|02/19/2026|valid|
2|ANSA (Top News)|<https://www.ansa.it/sito/notizie/topnews/topnews_rss.xml>|200|02/19/2026|valid|
3|ANSA (Cronaca)|<https://www.ansa.it/sito/notizie/cronaca/cronaca_rss.xml>|200|02/19/2026|valid|
4|ANSA (Politica)|<https://www.ansa.it/sito/notizie/politica/politica_rss.xml>|200|02/19/2026|valid|
5|ANSA (Mondo)|<https://www.ansa.it/sito/notizie/mondo/mondo_rss.xml>|200|02/19/2026|valid|
6|ANSA (Economia)|<https://www.ansa.it/sito/notizie/economia/economia_rss.xml>|200|02/19/2026|valid|
7|ANSA (Calcio)|<https://www.ansa.it/sito/notizie/sport/calcio/calcio_rss.xml>|200|02/19/2026|valid|
8|ANSA (Sport)|<https://www.ansa.it/sito/notizie/sport/sport_rss.xml>|200|02/19/2026|valid|
9|ANSA (Cinema)|<https://www.ansa.it/sito/notizie/cultura/cinema/cinema_rss.xml>|200|02/19/2026|valid|
10|ANSA (Cultura e Tendenze)|<https://www.ansa.it/sito/notizie/cultura/cultura_rss.xml>|200|02/19/2026|valid|
11|ANSA (Foto)|<https://www.ansa.it/sito/photogallery/foto_rss.xml>|200|02/19/2026|valid|
12|ANSA (Video)|<https://www.ansa.it/sito/videogallery/video_rss.xml>|200|02/19/2026|valid|
13|Corriere della Sera (Homepage)|<https://www.corriere.it/rss/homepage.xml>|200|02/19/2026|valid|
14|Corriere della Sera (Ultimora)|<https://www.corriere.it/rss/ultimora.xml>|200|02/19/2026|valid|
15|Corriere della Sera (feed-hp Homepage)|<https://www.corriere.it/feed-hp/homepage.xml>|200|02/19/2026|valid|
16|la Repubblica|<https://www.repubblica.it/rss/homepage/rss2.0.xml>|200|02/19/2026|valid|
17|La Stampa|<https://www.lastampa.it/rss/copertina.xml>|200|02/19/2026|valid|
18|Il Sole 24 Ore (Italia)|<https://www.ilsole24ore.com/rss/italia.xml>|200|02/19/2026|valid|
19|Il Fatto Quotidiano|<https://www.ilfattoquotidiano.it/feed/>|200|02/19/2026|valid|
20|La Gazzetta dello Sport|<https://www.gazzetta.it/rss/home.xml>|200|02/19/2026|valid|
21|IL Tempo|<https://www.iltempo.it/rss.xml>|200|02/19/2026|valid|
22|Libero Quotidiano|<https://www.liberoquotidiano.it/rss.xml>|200|02/19/2026|valid|
23|MilanoToday|<https://www.milanotoday.it/rss>|200|02/19/2026|valid|
24|The Florentine|<https://www.theflorentine.net/feed>|200|02/19/2026|valid|
25|Wanted in Rome|<https://www.wantedinrome.com/news?format=rss>|200|02/19/2026|valid|
26|Florence Daily News|<https://florencedailynews.com/feed>|200|02/19/2026|valid|
27|Alto Adige (Cronaca)|<https://www.altoadige.it/feed-rss/cronaca-1.169>|200|02/19/2026|valid|
28|Italia a Tavola|<https://rss.italiaatavola.net/feed.xml>|200|02/19/2026|valid|
29|la Città di Salerno|<https://www.lacittadisalerno.it/feed>|200|02/19/2026|valid|
30|Notizie Geopolitiche|<https://www.notiziegeopolitiche.net/feed>|200|02/19/2026|valid|

### Canada (CA)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|Global News|<https://globalnews.ca/feed>|200|02/19/2026|valid|
2|rabble.ca|<https://rabble.ca/feed>|200|02/19/2026|valid|
3|National Post|<https://nationalpost.com/feed>|200|02/19/2026|valid|
4|Toronto Sun|<https://torontosun.com/feed>|200|02/19/2026|valid|
5|Financial Post|<https://feeds.feedburner.com/FP_TopStories>|200|02/19/2026|valid|
6|CityNews Toronto|<https://toronto.citynews.ca/feed>|200|02/19/2026|valid|
7|Calgary Herald|<https://calgaryherald.com/feed>|200|02/19/2026|valid|
8|Edmonton Journal|<https://edmontonjournal.com/feed>|200|02/19/2026|valid|
9|Windsor Star|<https://windsorstar.com/feed>|200|02/19/2026|valid|
10|The Province|<https://theprovince.com/feed>|200|02/19/2026|valid|
11|Calgary Sun|<https://calgarysun.com/feed>|200|02/19/2026|valid|
12|Ottawa Sun|<https://ottawasun.com/feed>|200|02/19/2026|valid|
13|The Tyee|<https://thetyee.ca/rss2.xml>|200|02/19/2026|valid|
14|The StarPhoenix|<https://thestarphoenix.com/feed>|200|02/19/2026|valid|
15|Edmonton Sun|<https://edmontonsun.com/feed>|200|02/19/2026|valid|
16|Canada.com|<https://o.canada.com/feed>|200|02/19/2026|valid|
17|Canada's National Observer|<https://nationalobserver.com/front/rss>|403 (HTTP_403)|02/19/2026|invalid|
18|Business In Vancouver (BIV)|<https://biv.com/rss>|200|02/19/2026|valid|
19|Regina Leader Post|<https://leaderpost.com/feed>|200|02/19/2026|valid|
20|Owen Sound Sun Times|<https://owensoundsuntimes.com/feed>|200|02/19/2026|valid|
21|Ottawa Citizen|<https://ottawacitizen.com/feed>|200|02/19/2026|valid|
22|Stratford Beacon Herald|<https://stratfordbeaconherald.com/feed>|200|02/19/2026|valid|
23|The Georgia Straight|<https://straight.com/content/rss>|200|02/19/2026|valid|
24|Grande Prairie Daily Herald Tribune|<https://dailyheraldtribune.com/feed>|200|02/19/2026|valid|
25|YGK News (Kingston)|<https://ygknews.ca/feed>|200|02/19/2026|valid|
26|Prince Albert Daily Herald|<https://paherald.sk.ca/feed>|200|02/19/2026|valid|
27|Sunny South News|<https://sunnysouthnews.com/feed>|200|02/19/2026|valid|
28|The Afro News|<https://theafronews.com/feed>|200|02/19/2026|valid|
29|TheCanadianPressNews (search)|<https://www.thecanadianpressnews.ca/search/?f=rss>|429 (HTTP_429)|02/19/2026|invalid|
30|CBC News (Top Stories)|<https://www.cbc.ca/webfeed/rss/rss-topstories>|ERR (TIMEOUT)|02/19/2026|invalid|

### Russia (RU)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|TASS|<https://tass.com/feed>|404 (HTTP_404)|02/19/2026|invalid|
2|RIA|<https://ria.ru/feed>|404 (HTTP_404)|02/19/2026|invalid|
3|RT|<https://rt.com/feed>|200|02/19/2026|valid|
4|RG.ru|<https://rg.ru/feed>|401 (HTTP_401)|02/19/2026|invalid|
5|Kommersant|<https://kommersant.ru/feed>|404 (HTTP_404)|02/19/2026|invalid|
6|Vedomosti|<https://vedomosti.ru/feed>|404 (HTTP_404)|02/19/2026|invalid|
7|Meduza|<https://meduza.io/feed>|ERR (TIMEOUT)|02/19/2026|invalid|
8|The Moscow Times|<https://themoscowtimes.com/feed>|404 (HTTP_404)|02/19/2026|invalid|
9|Novaya Gazeta|<https://novayagazeta.eu/feed>|404 (HTTP_404)|02/19/2026|invalid|
10|The Bell|<https://thebell.io/feed>|200|02/19/2026|valid|
11|Oil Capital|<https://oilcapital.ru/feed>|200 (HTML_RETURNED)|02/19/2026|invalid|
12|Neftgaz|<https://neftegaz.ru/feed>|404 (HTTP_404)|02/19/2026|invalid|
13|Kommersant (World)|<https://www.kommersant.ru/rss/1206>|403 (HTTP_403)|02/19/2026|invalid|
14|Interfax|<https://www.interfax.ru/rss.asp>|200|02/19/2026|valid|
15|RT Economy|<https://www.rt.com/rss/business>|200|02/19/2026|valid|
16|The Bell|<https://thebell.io/feed/>|200|02/19/2026|valid|
17|Ria (World)|<https://ria.ru/export/rss2/world/index.xml>|404 (HTTP_404)|02/19/2026|invalid|
18|Lenta|<https://lenta.ru/rss/news>|200|02/19/2026|valid|
19|RBC|<https://www.rbc.ru/rss>|404 (HTTP_404)|02/19/2026|invalid|
20|Interfax|<https://www.interfax.ru/news.rss>|404 (HTTP_404)|02/19/2026|invalid|
21|Fontanka|<https://www.fontanka.ru/fontanka.rss>|404 (HTTP_404)|02/19/2026|invalid|
22|Gazeta.ru|<https://www.gazeta.ru/export/rss/index.xml>|404 (HTTP_404)|02/19/2026|invalid|
23|TASS Finance|<https://tass.com/rss/v2.xml>|200|02/19/2026|valid|
24|RIA Economy|<https://ria.ru/export/rss2/economy/index.xml>|404 (HTTP_404)|02/19/2026|invalid|
25|RT News|<https://www.rt.com/rss/>|200|02/19/2026|valid|
26|RT Economy|<https://www.rt.com/rss/business.xml>|404 (HTTP_404)|02/19/2026|invalid|
27|Kommersant Business|<https://www.kommersant.ru/rss/1207>|403 (HTTP_403)|02/19/2026|invalid|
28|Novaya Gazeta|<https://novayagazeta.eu/rss>|404 (HTTP_404)|02/19/2026|invalid|
29|Lenta Sports|<https://lenta.ru/rss/sport>|404 (HTTP_404)|02/19/2026|invalid|
30|RT Crimea|<https://www.rt.com/rss/regions.xml>|404 (HTTP_404)|02/19/2026|invalid|

### South Korea (KR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|Yonhap (EN)|<https://en.yna.co.kr/RSS/news.xml>|200|02/19/2026|valid|
2|Donga Ilbo|<https://rss.donga.com/total.xml>|200|02/19/2026|valid|
3|Seoul Newspaper|<https://www.seoul.co.kr/xml/rss/rss_top.xml>|200|02/19/2026|valid|
4|Newsis|<https://www.newsis.com/RSS/sokbo.xml>|200|02/19/2026|valid|
5|Aju News|<https://rss.ajunews.com/sokbo.xml>|200|02/19/2026|valid|
6|KED Global (Korea Economic Daily)|<https://www.kedglobal.com/newsRss>|200|02/19/2026|valid|
7|Daily NK (EN)|<https://www.dailynk.com/english/feed>|200|02/19/2026|valid|
8|Korea Times (RSS directory)|<https://feed.koreatimes.co.kr/k/allnews.xml>|200|02/19/2026|valid|
9|Korea Herald (RSS directory)|<https://www.koreaherald.com/rss/newsAll>|200|02/19/2026|valid|
10|Korea Herald (NewsAll)|<https://www.koreaherald.com/rss/newsAll>|200|02/19/2026|valid|
11|KBS World Radio (RSS directory)|<http://world.kbs.co.kr/rss/rss_news.htm?lang=e>|200|02/19/2026|valid|
12|Hankyoreh (EN)|N/A|❌ NO_SOURCE|02/19/2026|needs verification|
13|Kyunghyang Shinmun|N/A|❌ NO_SOURCE|02/19/2026|needs verification|
14|MediaToday|N/A|❌ NO_SOURCE|02/19/2026|needs verification|
15|Segye Ilbo|N/A|❌ NO_SOURCE|02/19/2026|needs verification|
16|Pressian|N/A|❌ NO_SOURCE|02/19/2026|needs verification|
17|E Today|N/A|❌ NO_SOURCE|02/19/2026|needs verification|
18|E-Daily|N/A|❌ NO_SOURCE|02/19/2026|needs verification|
19|OhmyNews|N/A|❌ NO_SOURCE|02/19/2026|needs verification|
20|Korea JoongAng Daily|N/A|❌ NO_SOURCE|02/19/2026|needs verification|
21|News1|N/A|❌ NO_SOURCE|02/19/2026|needs verification|
22|NewDaily|N/A|❌ NO_SOURCE|02/19/2026|needs verification|
23|JoongAng (Korean)|N/A|❌ NO_SOURCE|02/19/2026|needs verification|
24|Hankooki|N/A|❌ NO_SOURCE|02/19/2026|needs verification|
25|Pulse (MK)|N/A|❌ NO_SOURCE|02/19/2026|needs verification|
26|BusinessKorea|N/A|❌ NO_SOURCE|02/19/2026|needs verification|
27|Korea Economic Daily (KED, site)|N/A|❌ NO_SOURCE|02/19/2026|needs verification|
28|Reuters Institute (Korea) - 자료/리포트|N/A|❌ NO_SOURCE|02/19/2026|needs verification|
29|KBS/공영방송(추적용) - RSS directory|N/A|❌ NO_SOURCE|02/19/2026|needs verification|
30|Chosun Ilbo|N/A|❌ NO_SOURCE|02/19/2026|needs verification|

### Brazil (BR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|G1 (Globo - Economy)|<https://g1.globo.com/rss/g1/economia/>|200|02/19/2026|valid|
2|G1 (Globo - Tech)|<https://g1.globo.com/rss/g1/tecnologia/>|200|02/19/2026|valid|
3|Folha de S.Paulo - Top|<https://feeds.folha.uol.com.br/emcimadahora/rss091.xml>|200|02/19/2026|valid|
4|Folha de S.Paulo - Market|<https://feeds.folha.uol.com.br/mercado/rss091.xml>|200|02/19/2026|valid|
5|Estadão (Economy)|<https://www.estadao.com.br/rss/economia>|404 (HTTP_404)|02/19/2026|invalid|
6|Correio Braziliense|<https://www.correiobraziliense.com.br/rss/noticia/economia/rss.xml>|200|02/19/2026|valid|
7|InfoMoney|<https://www.infomoney.com.br/feed/>|200|02/19/2026|valid|
8|Canaltech|<https://canaltech.com.br/rss/>|200|02/19/2026|valid|
9|Forbes Brazil|<https://forbes.com.br/feed/>|200|02/19/2026|valid|
10|UOL (Economy)|<https://www.uol.com.br/album/rssxml/>|404 (HTTP_404)|02/19/2026|invalid|
11|Estadão (Politics)|<https://www.estadao.com.br/politica/rss>|404 (HTTP_404)|02/19/2026|invalid|
12|Folha (World)|<https://www.folha.uol.com.br/ultilinks/noticias/mundo/rss091.xml>|404 (HTTP_404)|02/19/2026|invalid|
13|Brasil de Fato|<https://www.brasildefato.com.br/rss>|200|02/19/2026|valid|
14|Estado de Minas|<https://www.em.com.br/feed/>|200|02/19/2026|valid|
15|R7|<https://noticias.r7.com/rss/>|404 (HTTP_404)|02/19/2026|invalid|
16|Valor (Invest)|<https://valor.globo.com/rss/feed.xml>|404 (HTTP_404)|02/19/2026|invalid|
17|Veja|<https://veja.abril.com.br/feed/>|200|02/19/2026|valid|
18|Estadão World|<https://www.estadao.com.br/ultimas/feed>|404 (HTTP_404)|02/19/2026|invalid|
19|R7 Economy|<https://noticias.r7.com/economia/feed/>|404 (HTTP_404)|02/19/2026|invalid|
20|Globo Esporte|<https://ge.globo.com/rss/>|404 (HTTP_404)|02/19/2026|invalid|
21|O Estado de Minas|<https://www.em.com.br/site/rss/em_d.php>|404 (HTTP_404)|02/19/2026|invalid|
22|Gazeta do Povo|<https://www.gazetadopovo.com.br/feed/>|200 (HTML_RETURNED)|02/19/2026|invalid|
23|Estado de S. Paulo|<https://www.estadao.com.br/rss/>|404 (HTTP_404)|02/19/2026|invalid|
24|Terra Brasil|<https://www.terra.com.br/rss/>|400 (HTTP_400)|02/19/2026|invalid|
25|Bolsas|<https://valor.globo.com/rss/ultimas.xml>|404 (HTTP_404)|02/19/2026|invalid|
26|Canal Tech Brasil|<https://canaltech.com.br/feed/>|404 (HTTP_404)|02/19/2026|invalid|
27|UOL Economia|<https://www.uol.com.br/album/rssxml/economia/>|404 (HTTP_404)|02/19/2026|invalid|
28|Valor|<https://www.valor.com.br/>|200 (HTML_RETURNED)|02/19/2026|invalid|
29|Estadão|<https://www.estadao.com.br/rss/ultimas>|404 (HTTP_404)|02/19/2026|invalid|
30|UOL Brasil|<https://www.uol.com.br/urbe/rss>|404 (HTTP_404)|02/19/2026|invalid|

### Australia (AU)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|ABC News - Business|<https://www.abc.net.au/news/feed/51892/rss.xml>|200|02/19/2026|valid|
2|ABC News - World|<https://www.abc.net.au/news/feed/52278/rss.xml>|404 (HTTP_404)|02/19/2026|invalid|
3|Sydney Morning Herald - Business|<https://www.smh.com.au/rss/business.xml>|200|02/19/2026|valid|
4|The Age - Business|<https://www.theage.com.au/rss/business.xml>|200|02/19/2026|valid|
5|News.com.au - Finance|<https://www.news.com.au/finance/feed>|403 (HTTP_403)|02/19/2026|invalid|
6|The Australian - Business|<https://www.theaustralian.com.au/business/rss>|200|02/19/2026|valid|
7|The Guardian Australia|<https://www.theguardian.com/au/rss>|200|02/19/2026|valid|
8|ABC News (Top)|<https://www.abc.net.au/news/feed/1106/rss.xml>|200|02/19/2026|valid|
9|Financial Review|<https://www.afr.com/rss/headlines>|404 (HTTP_404)|02/19/2026|invalid|
10|Australian Broadcasting Corporation - World|<https://www.abc.net.au/news/feed/51892/rss.xml?edition=world>|200|02/19/2026|valid|
11|The Guardian Australia|<https://www.theguardian.com/au/rugby/rss>|404 (HTTP_404)|02/19/2026|invalid|
12|The Australian|<https://www.theaustralian.com.au/rss>|403 (HTTP_403)|02/19/2026|invalid|
13|News.com.au|<https://www.news.com.au/>|403 (HTTP_403)|02/19/2026|invalid|
14|SBS World News|<https://www.sbs.com.au/news/rss.xml>|404 (HTTP_404)|02/19/2026|invalid|
15|SBS News (Breaking)|<https://www.sbs.com.au/news/feed/>|404 (HTTP_404)|02/19/2026|invalid|
16|9News|<https://www.9news.com.au/rss>|200|02/19/2026|valid|
17|Sydney Morning Herald|<https://www.smh.com.au/rss/>|404 (HTTP_404)|02/19/2026|invalid|
18|The Age|<https://www.theage.com.au/rss/>|404 (HTTP_404)|02/19/2026|invalid|
19|Herald Sun|<https://www.heraldsun.com.au/rss/>|403 (HTTP_403)|02/19/2026|invalid|
20|Canberra Times|<https://www.canberratimes.com.au/rss/>|404 (HTTP_404)|02/19/2026|invalid|
21|The Saturday Paper|<https://www.thesaturdaypaper.com.au/feed>|404 (HTTP_404)|02/19/2026|invalid|
22|ABC News Radio|<https://www.abc.net.au/7.30/business/rss.xml>|200 (HTML_RETURNED)|02/19/2026|invalid|
23|News.com.au Business|<https://www.news.com.au/business/feed>|403 (HTTP_403)|02/19/2026|invalid|
24|Financial Review - CEO|<https://www.afr.com/rss/ceo>|404 (HTTP_404)|02/19/2026|invalid|
25|The Australian|<https://www.theaustralian.com.au/business/?output=rss>|403 (HTTP_403)|02/19/2026|invalid|
26|PerthNow|<https://www.perthnow.com.au/rss.xml>|404 (HTTP_404)|02/19/2026|invalid|
27|ABC News Science|<https://www.abc.net.au/news/feed/1077/rss.xml>|404 (HTTP_404)|02/19/2026|invalid|
28|The Australian|<https://www.theaustralian.com.au/business/markets/rss>|200|02/19/2026|valid|
29|ABC News (Sport)|<https://www.abc.net.au/news/feed/2141674/rss.xml>|500 (HTTP_500)|02/19/2026|invalid|
30|7news|<https://7news.com.au/feed>|200|02/19/2026|valid|

### Spain (ES)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|Expansión (Financial)|<https://e00-expansion.uecdn.es/rss/empresas.xml>|200|02/19/2026|valid|
2|Cinco Días (Economy)|<https://cincodias.elpais.com/arc/outboundfeeds/rss/?outputType=xml>|200|02/19/2026|valid|
3|El País - Economy|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/economia/portada>|200|02/19/2026|valid|
4|El Mundo - Economy|<https://e00-elmundo.uecdn.es/elmundo/rss/economia.xml>|200|02/19/2026|valid|
5|RTVE - Economy|<https://www.rtve.es/api/noticias/economia/rss>|404 (HTTP_404)|02/19/2026|invalid|
6|La Vanguardia|<https://www.lavanguardia.com/rss>|200 (HTML_RETURNED)|02/19/2026|invalid|
7|El Confidencial|<https://www.elconfidencial.com/rss/>|200 (HTML_RETURNED)|02/19/2026|invalid|
8|El Mundo (Politics)|<https://e00-elmundo.uecdn.es/rss/el_mundo_portada.xml>|404 (HTTP_404)|02/19/2026|invalid|
9|ABC|<https://www.abc.es/rss/feeds/espana.xml>|404 (HTTP_404)|02/19/2026|invalid|
10|La Razon|<https://www.larazon.es/rss.xml>|404 (HTTP_404)|02/19/2026|invalid|
11|El Periodico|<https://www.elperiodico.com/es/rss>|200 (HTML_RETURNED)|02/19/2026|invalid|
12|20 Minutos|<https://www.20minutos.es/rss/>|200|02/19/2026|valid|
13|El Economista|<https://www.eleconomista.es/rss>|403 (HTTP_403)|02/19/2026|invalid|
14|El Diario|<https://www.eldiario.es/rss/>|200|02/19/2026|valid|
15|Agencia EFE|<https://www.efe.com/efe/espana/1/rss>|200 (HTML_RETURNED)|02/19/2026|invalid|
16|eldiario|<https://www.eldiario.es/rss/vida/>|404 (HTTP_404)|02/19/2026|invalid|
17|La Vanguardia|<https://www.lavanguardia.com/rss/>|404 (HTTP_404)|02/19/2026|invalid|
18|El Pais Politics|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/politica/portada>|370 (HTTP_370)|02/19/2026|invalid|
19|Marca|<https://www.marca.com/rss/>|200|02/19/2026|valid|
20|Público|<https://www.publico.es/rss/home.xml>|404 (HTTP_404)|02/19/2026|invalid|
21|La Sexta|<https://www.lasexta.com/rss.xml>|404 (HTTP_404)|02/19/2026|invalid|
22|El Economista|<https://www.eleconomista.es/rss/>|403 (HTTP_403)|02/19/2026|invalid|
23|La Voz de Galicia|<https://www.lavozdegalicia.es/rss/sociedad>|404 (HTTP_404)|02/19/2026|invalid|
24|La Vanguardia Economy|<https://www.lavanguardia.com/economia/rss.xml>|404 (HTTP_404)|02/19/2026|invalid|
25|El Pais|<https://feeds.elpais.com/mrss-s/sections/politics>|403 (HTTP_403)|02/19/2026|invalid|
26|El Periódico|<https://www.elperiodico.com/es/rss/economia.xml>|404 (HTTP_404)|02/19/2026|invalid|
27|La Razón|<https://www.larazon.es/rss/economia/>|404 (HTTP_404)|02/19/2026|invalid|
28|20 Minutos|<https://www.20minutos.es/rss/espana.xml>|404 (HTTP_404)|02/19/2026|invalid|
29|El Mundo Sports|<https://e00-elmundo.uecdn.es/elmundo/rss/deportes.xml>|404 (HTTP_404)|02/19/2026|invalid|
30|La Vanguardia Politics|<https://www.lavanguardia.com/politica/rss.xml>|404 (HTTP_404)|02/19/2026|invalid|

### Mexico (MX)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|El Economista (Top)|<https://www.eleconomista.com.mx/rss/top-noticias>|403 (HTTP_403)|02/19/2026|invalid|
2|El Economista (Empresas)|<https://www.eleconomista.com.mx/rss/empresas>|403 (HTTP_403)|02/19/2026|invalid|
3|El Universal|<https://www.eluniversal.com.mx/rss.xml>|404 (HTTP_404)|02/19/2026|invalid|
4|Milenio|<https://www.milenio.com/rss>|200|02/19/2026|valid|
5|Excelsior|<https://www.excelsior.com.mx/rss.xml>|404 (HTTP_404)|02/19/2026|invalid|
6|Proceso (Investigative)|<https://www.proceso.com.mx/rss/feed.html>|200|02/19/2026|valid|
7|Aristegui Noticias|<https://aristeguinoticias.com/feed/>|200 (HTML_RETURNED)|02/19/2026|invalid|
8|Expansion (Biz)|<https://expansion.mx/rss>|200|02/19/2026|valid|
9|Reforma|<https://www.reforma.com/rss>|200 (HTML_RETURNED)|02/19/2026|invalid|
10|Excélsior (Politics)|<https://www.excelsior.com.mx/politica.xml>|404 (HTTP_404)|02/19/2026|invalid|
11|Milenio (Economy)|<https://www.milenio.com/negocios/rss>|404 (HTTP_404)|02/19/2026|invalid|
12|Forbes México|<https://www.forbes.com.mx/rss/>|403 (HTTP_403)|02/19/2026|invalid|
13|Aristegui (Economía)|<https://aristeguinoticias.com/rss/economia/>|200 (HTML_RETURNED)|02/19/2026|invalid|
14|Sin Embargo|<https://sinembargo.mx/feed>|403 (HTTP_403)|02/19/2026|invalid|
15|Proceso (Política)|<https://www.proceso.com.mx/politica/rss>|404 (HTTP_404)|02/19/2026|invalid|
16|Animal Político|<https://www.animalpolitico.com/feed/>|404 (HTTP_404)|02/19/2026|invalid|
17|Contralínea|<https://www.contralinea.com.mx/feed>|200|02/19/2026|valid|
18|El Financiero|<https://www.elfinanciero.com.mx/rss/mundo>|200|02/19/2026|valid|
19|Reforma|<https://www.reforma.com/rss?output=rss>|200 (HTML_RETURNED)|02/19/2026|invalid|
20|Excélsior Internacional|<https://www.excelsior.com.mx/opinion/rss>|404 (HTTP_404)|02/19/2026|invalid|
21|El Economista Politics|<https://www.eleconomista.com.mx/rss/politica>|403 (HTTP_403)|02/19/2026|invalid|
22|Aristegui International|<https://aristeguinoticias.com/feeds/articles/rss/>|200 (HTML_RETURNED)|02/19/2026|invalid|
23|Proceso World|<https://www.proceso.com.mx/rss/feed.html?output=xml>|200|02/19/2026|valid|
24|Sin Embargo MX|<https://sinembargo.mx/feed/>|403 (HTTP_403)|02/19/2026|invalid|
25|La Jornada|<https://www.jornada.com.mx/ultimas/feed>|502 (HTTP_502)|02/19/2026|invalid|
26|Milenio Politics|<https://www.milenio.com/politica/rss>|404 (HTTP_404)|02/19/2026|invalid|
27|Forbes Mexico|<https://www.forbes.com.mx/feed/>|403 (HTTP_403)|02/19/2026|invalid|
28|Sin Embargo|<https://www.sinembargo.mx/rss/>|403 (HTTP_403)|02/19/2026|invalid|
29|Proceso (Opinion)|<https://www.proceso.com.mx/opinion/rss>|404 (HTTP_404)|02/19/2026|invalid|
30|El Financiero|<https://www.elfinanciero.com.mx/rss>|200|02/19/2026|valid|

### Indonesia (ID)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|Antara News|<https://www.antaranews.com/feed/>|200|02/19/2026|valid|
2|The Jakarta Post|<https://www.thejakartapost.com/rss>|404 (HTTP_404)|02/19/2026|invalid|
3|CNBC Indonesia|<https://www.cnbcindonesia.com/feed>|404 (HTTP_404)|02/19/2026|invalid|
4|Detik|<https://www.detik.com/rss>|404 (HTTP_404)|02/19/2026|invalid|
5|Kompas|<https://www.kompas.com/rss>|404 (HTTP_404)|02/19/2026|invalid|
6|Tempo|<https://www.tempo.co/rss>|403 (HTTP_403)|02/19/2026|invalid|
7|Viva|<https://www.viva.co.id/rss>|404 (HTTP_404)|02/19/2026|invalid|
8|Tribunnews|<https://www.tribunnews.com/rss>|403 (HTTP_403)|02/19/2026|invalid|
9|Republika|<https://www.republika.co.id/rss>|200|02/19/2026|valid|
10|Bisnis|<https://www.bisnis.com/rss>|404 (HTTP_404)|02/19/2026|invalid|
11|Tempo|<https://www.tempo.co/feed>|403 (HTTP_403)|02/19/2026|invalid|
12|Jakarta Globe|<https://jakartaglobe.id/feed>|404 (HTTP_404)|02/19/2026|invalid|
13|BisnisIndonesia|<https://www.bisnis.com/id/home/feed>|404 (HTTP_404)|02/19/2026|invalid|
14|Sindo News|<https://www.sindonews.com/rss/home/>|200|02/19/2026|valid|
15|Kapanlagi|<https://www.kapanlagi.com/feed/>|200|02/19/2026|valid|
16|Bisnis (Teknologi)|<https://www.bisnis.com/rss/technology>|404 (HTTP_404)|02/19/2026|invalid|
17|Kompas|<https://www.kompas.com/feed>|404 (HTTP_404)|02/19/2026|invalid|
18|Antara TV|<https://www.antaranews.com/rss/terkini>|200|02/19/2026|valid|
19|Kompas|<https://www.kompas.com/rss/>|404 (HTTP_404)|02/19/2026|invalid|
20|Viva|<https://www.viva.co.id/rss/terkini>|404 (HTTP_404)|02/19/2026|invalid|
21|Sindonews|<https://www.sindonews.com/rss/>|200|02/19/2026|valid|
22|Tribunnews|<https://www.tribunnews.com/feeds/>|403 (HTTP_403)|02/19/2026|invalid|
23|Tempo|<https://www.tempo.co/rss/feed.xml>|404 (HTTP_404)|02/19/2026|invalid|
24|Republika|<https://www.republika.co.id/rss/terkini>|200|02/19/2026|valid|
25|Bisnis|<https://www.bisnis.com/feed/>|404 (HTTP_404)|02/19/2026|invalid|
26|CNN Indonesia|<https://www.cnnindonesia.com/feed/>|404 (HTTP_404)|02/19/2026|invalid|
27|Liputan6|<https://www.liputan6.com/rss>|404 (HTTP_404)|02/19/2026|invalid|
28|Kumparan|<https://kumparan.com/rss>|404 (HTTP_404)|02/19/2026|invalid|
29|Detik|<https://www.detik.com/rss/sport>|404 (HTTP_404)|02/19/2026|invalid|
30|Tempo|<https://www.tempo.co/feed/>|403 (HTTP_403)|02/19/2026|invalid|

### Netherlands (NL)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|NOS|<https://www.nos.nl/rss>|404 (HTTP_404)|02/19/2026|invalid|
2|NRC|<https://www.nrc.nl/rss>|200|02/19/2026|valid|
3|AD|<https://www.ad.nl/rss.xml>|200|02/19/2026|valid|
4|Nu|<https://www.nu.nl/rss/algemeen>|200|02/19/2026|valid|
5|Volkskrant|<https://www.volkskrant.nl/rss>|404 (HTTP_404)|02/19/2026|invalid|
6|RTL Nieuws|<https://www.rtlnieuws.nl/service/rss/rss.xml>|404 (HTTP_404)|02/19/2026|invalid|
7|De Telegraaf|<https://www.telegraaf.nl/rss>|403 (HTTP_403)|02/19/2026|invalid|
8|Trouw|<https://www.trouw.nl/rss/algemeen/>|404 (HTTP_404)|02/19/2026|invalid|
9|Financieel Dagblad|<https://fd.nl/rss.xml>|404 (HTTP_404)|02/19/2026|invalid|
10|Parool|<https://www.parool.nl/rss>|404 (HTTP_404)|02/19/2026|invalid|
11|NRC|<https://www.nrc.nl/rss/nieuws/>|404 (HTTP_404)|02/19/2026|invalid|
12|NPO Radio 1|<https://www.npo3fm.nl/rss/>|200|02/19/2026|valid|
13|NOS Sport|<https://feeds.nos.nl/nossport>|404 (HTTP_404)|02/19/2026|invalid|
14|NOS Tech|<https://feeds.nos.nl/nostechniek>|404 (HTTP_404)|02/19/2026|invalid|
15|RTL Nieuws Finance|<https://www.rtlnieuws.nl/service/rss/rss-finance.xml>|404 (HTTP_404)|02/19/2026|invalid|
16|NOS Culture|<https://feeds.nos.nl/noscultuur>|404 (HTTP_404)|02/19/2026|invalid|
17|Nu.nl Technology|<https://www.nu.nl/rss/tech/>|404 (HTTP_404)|02/19/2026|invalid|
18|NOS Sport|<https://www.nos.nl/rss/sport/>|404 (HTTP_404)|02/19/2026|invalid|
19|AD|<https://www.ad.nl/nieuws/rss>|404 (HTTP_404)|02/19/2026|invalid|
20|RTL Nieuws|<https://www.rtlnieuws.nl/service/rss/rss-alle-nieuws.xml>|404 (HTTP_404)|02/19/2026|invalid|
21|NU|<https://www.nu.nl/rss/algemeen/rss.xml>|404 (HTTP_404)|02/19/2026|invalid|
22|Volkskrant|<https://www.volkskrant.nl/rss/algemeen/>|404 (HTTP_404)|02/19/2026|invalid|
23|NRC|<https://www.nrc.nl/nieuws/rss/>|200|02/19/2026|valid|
24|NOS Politiek|<https://feeds.nos.nl/nospolitiek>|404 (HTTP_404)|02/19/2026|invalid|
25|Nieuwsuur|<https://nieuwsuur.nl/nieuws/rss.xml>|200 (HTML_RETURNED)|02/19/2026|invalid|
26|FD|<https://fd.nl/rss/economie>|404 (HTTP_404)|02/19/2026|invalid|
27|RTL|<https://www.rtlnieuws.nl/nieuws/rss.xml>|200|02/19/2026|valid|
28|Telegraaf|<https://www.telegraaf.nl/rss/achtergrond/>|403 (HTTP_403)|02/19/2026|invalid|
29|Parool|<https://www.parool.nl/rss/nieuws/>|404 (HTTP_404)|02/19/2026|invalid|
30|NRC|<https://www.nrc.nl/rss/>|200|02/19/2026|valid|

### Switzerland (CH)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|Swissinfo EN|<https://www.swissinfo.ch/eng/rss>|410 (HTTP_410)|02/19/2026|invalid|
2|NZZ|<https://www.nzz.ch/rss>|200 (HTML_RETURNED)|02/19/2026|invalid|
3|LeTemps|<https://www.letemps.ch/rss>|200 (HTML_RETURNED)|02/19/2026|invalid|
4|Tages-Anzeiger|<https://www.tagesanzeiger.ch/rss>|ERR (TIMEOUT)|02/19/2026|invalid|
5|Blick|<https://www.blick.ch/feed>|404 (HTTP_404)|02/19/2026|invalid|
6|20 Minuten CH|<https://www.20min.ch/feeds/0/feed>|404 (HTTP_404)|02/19/2026|invalid|
7|SRF|<https://www.srf.ch/news/feed/>|404 (HTTP_404)|02/19/2026|invalid|
8|RTS|<https://www.rts.ch/rss>|404 (HTTP_404)|02/19/2026|invalid|
9|Radio Télévision Suisse|<https://www.rts.ch/>|200 (HTML_RETURNED)|02/19/2026|invalid|
10|Le Temps Economy|<https://www.letemps.ch/economie.rss>|200|02/19/2026|valid|
11|24 Heures|<https://www.24heures.ch/rss>|ERR (TIMEOUT)|02/19/2026|invalid|
12|NZZ Finance|<https://www.nzz.ch/rss/wirtschaft.xml>|404 (HTTP_404)|02/19/2026|invalid|
13|Neue Zürcher Zeitung|<https://www.nzz.ch/rss/politik.xml>|404 (HTTP_404)|02/19/2026|invalid|
14|NZZ|<https://www.nzz.ch/rss/themen.rss>|200 (INVALID_JSON)|02/19/2026|invalid|
15|Radio 24|<https://www.rsi.ch/rss>|200 (HTML_RETURNED)|02/19/2026|invalid|
16|Le Temps|<https://www.letemps.ch/rss/actualites>|404 (HTTP_404)|02/19/2026|invalid|
17|24 Heures|<https://www.24heures.ch/rss/>|ERR (TIMEOUT)|02/19/2026|invalid|
18|20min|<https://www.20min.ch/feeds/0/20min.rss>|404 (HTTP_404)|02/19/2026|invalid|
19|Blick|<https://www.blick.ch/feed/>|404 (HTTP_404)|02/19/2026|invalid|
20|NZZ|<https://www.nzz.ch/reisen.rss>|200|02/19/2026|valid|
21|Tages-Anzeiger|<https://www.tagesanzeiger.ch/wirtschaft/rss.xml>|ERR (TIMEOUT)|02/19/2026|invalid|
22|SRF|<https://www.srf.ch/radio/srf-news/rss>|404 (HTTP_404)|02/19/2026|invalid|
23|RTS|<https://www.rts.ch/info/news/rss>|404 (HTTP_404)|02/19/2026|invalid|
24|Le Matin|<https://www.lematin.ch/rss/>|404 (HTTP_404)|02/19/2026|invalid|
25|NZZ|<https://www.nzz.ch/politik.rss>|200 (INVALID_JSON)|02/19/2026|invalid|
26|Tages-Anzeiger|<https://www.tagesanzeiger.ch/schweiz/rss.xml>|ERR (TIMEOUT)|02/19/2026|invalid|
27|Swissinfo|<https://www.swissinfo.ch/eng/rss/world>|200 (HTML_RETURNED)|02/19/2026|invalid|
28|NDR|<https://www.ndr.ch/rss/>|200|02/19/2026|valid|
29|Swissinfo Tech|<https://www.swissinfo.ch/eng/rss/tech>|200 (HTML_RETURNED)|02/19/2026|invalid|
30|SRF|<https://www.srf.ch/news/bnf/headlines.rss>|404 (HTTP_404)|02/19/2026|invalid|

### Turkey (TR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|Anadolu Agency|<https://www.aa.com.tr/tr/rss/default.aspx>|404 (HTTP_404)|02/19/2026|invalid|
2|Hürriyet|<https://www.hurriyet.com.tr/rss/anasayfa>|200|02/19/2026|valid|
3|Daily Sabah|<https://www.dailysabah.com/rss>|200 (HTML_RETURNED)|02/19/2026|invalid|
4|TRT World|<https://www.trtworld.com/rss>|404 (HTTP_404)|02/19/2026|invalid|
5|Sabah|<https://www.sabah.com.tr/rss/sondakika.xml>|200|02/19/2026|valid|
6|Anadolu|<https://www.aa.com.tr/rss>|ERR (NETWORK)|02/19/2026|invalid|
7|Bursa|<https://www.hurriyetdailynews.com/feed>|404 (HTTP_404)|02/19/2026|invalid|
8|Milliyet|<https://www.milliyet.com.tr/rss/rssnew.xml>|404 (HTTP_404)|02/19/2026|invalid|
9|Haberturk|<https://www.haberturk.com/rss>|200|02/19/2026|valid|
10|Bianet|<https://www.bianet.org/rss>|403 (HTTP_403)|02/19/2026|invalid|
11|Cumhuriyet|<https://www.cumhuriyet.com.tr/Rss/>|200|02/19/2026|valid|
12|Sözcü|<https://www.sozcu.com.tr/rss>|200 (HTML_RETURNED)|02/19/2026|invalid|
13|TAKİM|<https://www.t24.com.tr/rss>|200 (HTML_RETURNED)|02/19/2026|invalid|
14|Aksam|<https://www.aksam.com.tr/rss>|200|02/19/2026|valid|
15|Takvim|<https://www.takvim.com.tr/rss>|200 (HTML_RETURNED)|02/19/2026|invalid|
16|Evrensel|<https://www.evrensel.net/rss>|200 (HTML_RETURNED)|02/19/2026|invalid|
17|Anadolu Agency Economy|<https://www.aa.com.tr/tr/rss/ekonomi.xml>|404 (HTTP_404)|02/19/2026|invalid|
18|Yeni Şafak|<https://www.yenisafak.com/rss.xml>|410 (HTTP_410)|02/19/2026|invalid|
19|Takvim|<https://www.takvim.com.tr/rss/feed>|200|02/19/2026|valid|
20|Haber7|<https://www.haber7.com/rss>|404 (HTTP_404)|02/19/2026|invalid|
21|Sabah|<https://www.sabah.com.tr/rss/>|200 (HTML_RETURNED)|02/19/2026|invalid|
22|Sondakika|<https://www.sondakika.com/rss/>|404 (HTTP_404)|02/19/2026|invalid|
23|DHA|<https://www.dha.com.tr/rss>|404 (HTTP_404)|02/19/2026|invalid|
24|NTV|<https://www.ntv.com.tr/rss>|200 (HTML_RETURNED)|02/19/2026|invalid|
25|Milliyet|<https://www.milliyet.com.tr/rss/rssNews/rssNews>|200 (HTML_RETURNED)|02/19/2026|invalid|
26|Cumhuriyet|<https://www.cumhuriyet.com.tr/RSS>|200|02/19/2026|valid|
27|HuffPost Turkey|<https://www.hurriyetdailynews.com/rss>|200|02/19/2026|valid|
28|En Son Haberler|<https://www.ensonhaber.com/rss>|404 (HTTP_404)|02/19/2026|invalid|
29|Yeni Safak|<https://www.yenisafak.com/tr/rss>|404 (HTTP_404)|02/19/2026|invalid|
30|Haber Turk|<https://www.haberturk.com/rss/>|200|02/19/2026|valid|

### Saudi Arabia (SA)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|Arab News|<https://www.arabnews.com/home/rss>|403 (HTTP_403)|02/19/2026|invalid|
2|Saudi Gazette|<https://saudigazette.com.sa/ContentFeed>|404 (HTTP_404)|02/19/2026|invalid|
3|Al Arabiya|<https://www.alarabiya.net/RSS>|403 (HTTP_403)|02/19/2026|invalid|
4|Al Eqtisadiah|<https://www.alriyadh.gov.sa/en/feed>|200 (HTML_RETURNED)|02/19/2026|invalid|
5|Riyad News|<https://www.arabnews.com/feed>|403 (HTTP_403)|02/19/2026|invalid|
6|Riyad News|<https://www.arabnews.com/node/2/rss>|403 (HTTP_403)|02/19/2026|invalid|
7|Al Riyadh|<https://www.alriyadh.com/rss/world>|ERR (TLS)|02/19/2026|invalid|
8|Saudi Gazette Business|<https://saudigazette.com.sa/ContentFeed?sectionId=2>|404 (HTTP_404)|02/19/2026|invalid|
9|Al Arabiya World|<https://www.alarabiya.net/rss/arab-news.xml>|403 (HTTP_403)|02/19/2026|invalid|
10|Al Arabiya Economy|<https://www.alarabiya.net/rss/economy.xml>|200|02/19/2026|valid|
11|Al Arabiya Science|<https://www.alarabiya.net/rss/world.xml>|403 (HTTP_403)|02/19/2026|invalid|
12|Al Eqtisadiah|<https://www.alriyadh.gov.sa/en/rss/economy>|200 (HTML_RETURNED)|02/19/2026|invalid|
13|Al Arabia|<https://www.alarabiya.net/rss/gulf.xml>|403 (HTTP_403)|02/19/2026|invalid|
14|Makkah Times|<https://www.makkahnewspaper.com/rss>|200 (HTML_RETURNED)|02/19/2026|invalid|
15|Al Riyadh|<https://www.alriyadh.com/rss/politics>|ERR (TLS)|02/19/2026|invalid|
16|Arab News|<https://www.arabnews.com/world/rss>|403 (HTTP_403)|02/19/2026|invalid|
17|Saudi Gazette|<https://saudigazette.com.sa/en/RSS>|404 (HTTP_404)|02/19/2026|invalid|
18|Okaz|<https://www.okaz.com.sa/rss/news>|200|02/19/2026|valid|
19|Akhbar Alyom|<https://www.akhbaralyom.com/rss>|ERR (NETWORK)|02/19/2026|invalid|
20|Al Eqtisadiah|<https://www.ekhbarat.com/rss>|ERR (NETWORK)|02/19/2026|invalid|
21|Al Jazirah|<https://www.aljazeera.net/rss>|200|02/19/2026|valid|
22|Saudi Gazette (Middle East)|<https://saudigazette.com.sa/ContentFeed?section=middle-east>|404 (HTTP_404)|02/19/2026|invalid|
23|Arab News (Business)|<https://www.arabnews.com/economy/rss>|403 (HTTP_403)|02/19/2026|invalid|
24|Riyadh Bulletin|<https://www.riyadhebulletin.com/rss>|ERR (NETWORK)|02/19/2026|invalid|
25|Akhbar|<https://www.akhbarelyom.com/news/News_rss.xml>|404 (HTTP_404)|02/19/2026|invalid|
26|Gulf Daily News|<https://www.gulf-daily-news.com/rss>|404 (HTTP_404)|02/19/2026|invalid|
27|Saudi Gazette (World)|<https://saudigazette.com.sa/ContentFeed?section=world>|404 (HTTP_404)|02/19/2026|invalid|
28|Al Arabiya|<https://www.alarabiya.net/xml/rss.xml>|404 (HTTP_404)|02/19/2026|invalid|
29|Al Arabiya|<https://www.alarabiya.net/rss/>|403 (HTTP_403)|02/19/2026|invalid|
30|Saudi Gazette|<https://saudigazette.com.sa/ContentFeed?section=business>|404 (HTTP_404)|02/19/2026|invalid|

### Taiwan (TW)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|Focus Taiwan (Economics - EN)|<https://focustaiwan.tw/rss/economics>|404 (HTTP_404)|02/19/2026|invalid|
2|Focus Taiwan (Sci-Tech - EN)|<https://focustaiwan.tw/rss/science-technology>|404 (HTTP_404)|02/19/2026|invalid|
3|Taipei Times - Business|<https://www.taipeitimes.com/xml/biz.rss>|404 (HTTP_404)|02/19/2026|invalid|
4|Liberty Times - Business|<https://news.ltn.com.tw/rss/business.xml>|200|02/19/2026|valid|
5|TechNews Taiwan|<https://technews.tw/feed/>|200|02/19/2026|valid|
6|CNA (Central News Agency)|<https://feeds.feedburner.com/cnaFirstNews>|200|02/19/2026|valid|
7|United Daily News (Politics)|<https://udn.com/rss/udn.xml>|404 (HTTP_404)|02/19/2026|invalid|
8|Taipei Times Tech|<https://www.taipeitimes.com/rss/technology>|404 (HTTP_404)|02/19/2026|invalid|
9|Focus Taiwan (US)|<https://focustaiwan.tw/rss/usa>|404 (HTTP_404)|02/19/2026|invalid|
10|Taiwan News|<https://www.taiwannews.com.tw/rss/headlines.xml>|404 (HTTP_404)|02/19/2026|invalid|
11|Liberty Times (Technology)|<https://news.ltn.com.tw/rss/tech>|404 (HTTP_404)|02/19/2026|invalid|
12|CNA (US)|<https://feeds.feedburner.com/CTEEnergy>|404 (HTTP_404)|02/19/2026|invalid|
13|Taiwan Journal|<https://www.taiwanjournal.com/feed/>|ERR (NETWORK)|02/19/2026|invalid|
14|Formosa Reporter|<https://www.formosapost.com/feed/>|200|02/19/2026|valid|
15|CNA English|<https://www.cna.com.tw/cnaenglish/feed/>|404 (HTTP_404)|02/19/2026|invalid|
16|United Daily News|<https://udn.com/rss/index.xml>|404 (HTTP_404)|02/19/2026|invalid|
17|Taiwan News (Politics)|<https://www.taiwannews.com.tw/rss/politics.xml>|404 (HTTP_404)|02/19/2026|invalid|
18|Taiwan Review|<https://taiwanreview.net/feed/>|ERR (NETWORK)|02/19/2026|invalid|
19|Nownews|<https://www.nownews.com/rss/all.xml>|404 (HTTP_404)|02/19/2026|invalid|
20|Ming Pao Taiwan|<https://www.mpweekly.com/rss.xml>|200 (HTML_RETURNED)|02/19/2026|invalid|
21|China Post Taiwan|<https://chinapostnow.com/rss>|ERR (NETWORK)|02/19/2026|invalid|
22|Taiwan Today|<https://www.taiwantoday.tw/feed/>|404 (HTTP_404)|02/19/2026|invalid|
23|The China Post|<https://www.chinapost.com.tw/rss.xml>|ERR (NETWORK)|02/19/2026|invalid|
24|United News Asia|<https://www.untamednews.com/feed/>|404 (HTTP_404)|02/19/2026|invalid|
25|Free Republic|<https://www.free-r.net/rss>|ERR (NETWORK)|02/19/2026|invalid|
26|Taiwan Panorama|<https://www.taiwanpanorama.com/rss.xml>|404 (HTTP_404)|02/19/2026|invalid|
27|Taiwan Today (CN)|<https://www.taiwantoday.tw/rss/zh.xml>|404 (HTTP_404)|02/19/2026|invalid|
28|Focus Taiwan (World)|<https://focustaiwan.tw/rss/world>|404 (HTTP_404)|02/19/2026|invalid|
29|Taipei Times (Local)|<https://www.taipeitimes.com/rss/local>|404 (HTTP_404)|02/19/2026|invalid|
30|Taipei Times (Politics)|<https://www.taipeitimes.com/rss/politics>|404 (HTTP_404)|02/19/2026|invalid|

### Poland (PL)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|Gazeta Wyborcza|<https://wyborcza.pl/rss>|404 (HTTP_404)|02/19/2026|invalid|
2|Onet|<https://wiadomosci.onet.pl/rss>|200|02/19/2026|valid|
3|TVN24|<https://tvn24.pl/tvnmeteo.xml>|200|02/19/2026|valid|
4|Interia|<https://www.interia.pl/feed>|404 (HTTP_404)|02/19/2026|invalid|
5|Gazeta.pl|<https://wiadomosci.gazeta.pl/rss>|404 (HTTP_404)|02/19/2026|invalid|
6|Rzeczpospolita|<https://www.rp.pl/rss.xml>|404 (HTTP_404)|02/19/2026|invalid|
7|Gazeta Wyborcza|<https://www.wyborcza.pl/0,0.html?rss>|200 (HTML_RETURNED)|02/19/2026|invalid|
8|TVN24|<https://tvn24.pl/rss>|404 (HTTP_404)|02/19/2026|invalid|
9|Rmf24|<https://www.rmf24.pl/rss>|404 (HTTP_404)|02/19/2026|invalid|
10|Rzeczpospolita|<https://www.rp.pl/rss/>|404 (HTTP_404)|02/19/2026|invalid|
11|Interia|<https://www.interia.pl/rss/najnowsze.xml>|404 (HTTP_404)|02/19/2026|invalid|
12|Fakt|<https://www.fakt.pl/rss/>|200|02/19/2026|valid|
13|Wprost|<https://www.wprost.pl/rss.xml>|404 (HTTP_404)|02/19/2026|invalid|
14|Puls Biznesu|<https://www.pb.pl/rss>|200 (HTML_RETURNED)|02/19/2026|invalid|
15|Gazeta Polska|<https://www.gazetapolska.pl/feed/>|404 (HTTP_404)|02/19/2026|invalid|
16|TVP|<https://www.tvp.info/rss/>|404 (HTTP_404)|02/19/2026|invalid|
17|Polsat News|<https://www.polsatnews.pl/rss.xml>|404 (HTTP_404)|02/19/2026|invalid|
18|Polish Press|<https://www.polsatnews.pl/rss/world.xml>|404 (HTTP_404)|02/19/2026|invalid|
19|TVN24|<https://tvn24.pl/rss.xml>|404 (HTTP_404)|02/19/2026|invalid|
20|Gazeta Wyborcza|<https://www.wyborcza.pl/rss.xml>|404 (HTTP_404)|02/19/2026|invalid|
21|Interia|<https://www.interia.pl/rss>|404 (HTTP_404)|02/19/2026|invalid|
22|Wprost|<https://www.wprost.pl/rss/>|200|02/19/2026|valid|
23|Puls Biznesu|<https://www.pb.pl/feed/>|404 (HTTP_404)|02/19/2026|invalid|
24|Fakt|<https://www.fakt.pl/rss/wiadomosci>|404 (HTTP_404)|02/19/2026|invalid|
25|Rzeczpospolita|<https://www.rp.pl/rss/rss>|404 (HTTP_404)|02/19/2026|invalid|
26|Gazeta.pl|<https://www.gazeta.pl/rss/>|404 (HTTP_404)|02/19/2026|invalid|
27|RMF FM|<https://www.rmf.fm/rss/news>|404 (HTTP_404)|02/19/2026|invalid|
28|Polish News|<https://www.polsatnews.pl/rss/news.xml>|404 (HTTP_404)|02/19/2026|invalid|
29|Dziennik|<https://www.dziennik.pl/rss>|200 (HTML_RETURNED)|02/19/2026|invalid|
30|Rzeczpospolita|<https://www.rp.pl/rss/aktualnosci>|404 (HTTP_404)|02/19/2026|invalid|

### Sweden (SE)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|Aftonbladet|<https://www.aftonbladet.se/rss>|404 (HTTP_404)|02/19/2026|invalid|
2|Dagens Nyheter|<https://www.dn.se/nyheter/rss/>|200|02/19/2026|valid|
3|Svenska Dagbladet|<https://www.svd.se/rss>|404 (HTTP_404)|02/19/2026|invalid|
4|Svenska Dagbladet (Ekonomi)|<https://www.svd.se/?output=rss>|200 (HTML_RETURNED)|02/19/2026|invalid|
5|SvD|<https://www.svd.se/feeds/latest.rss>|404 (HTTP_404)|02/19/2026|invalid|
6|Expressen|<https://www.expressen.se/rss/feed/>|404 (HTTP_404)|02/19/2026|invalid|
7|Dagens Industri|<https://www.di.se/rss/>|200|02/19/2026|valid|
8|SVT Nyheter|<https://www.svt.se/nyheter/rss.xml>|200|02/19/2026|valid|
9|Göteborgs-Posten|<https://www.gp.se/rss>|200|02/19/2026|valid|
10|Sydsvenskan|<https://www.svd.se/sydsvenska>|404 (HTTP_404)|02/19/2026|invalid|
11|Metro Stockholm|<https://www.metro.se/feed>|200 (HTML_RETURNED)|02/19/2026|invalid|
12|Aftonbladet Sport|<https://www.aftonbladet.se/rss/sportbladet>|404 (HTTP_404)|02/19/2026|invalid|
13|Aftonbladet Economy|<https://www.aftonbladet.se/rss/ekonomi>|404 (HTTP_404)|02/19/2026|invalid|
14|Aftonbladet Politics|<https://www.aftonbladet.se/rss/nyheter>|404 (HTTP_404)|02/19/2026|invalid|
15|Aftonbladet Culture|<https://www.aftonbladet.se/rss/kultur>|404 (HTTP_404)|02/19/2026|invalid|
16|Dagens Nyheter Travel|<https://www.dn.se/rese/rss/>|404 (HTTP_404)|02/19/2026|invalid|
17|Sveriges Television|<https://www.svt.se/nyheter/ekonomi/rss.xml>|200|02/19/2026|valid|
18|Dagens Industri|<https://www.di.se/rss/bors>|404 (HTTP_404)|02/19/2026|invalid|
19|Svd|<https://www.svd.se/rss/ekonomi.xml>|404 (HTTP_404)|02/19/2026|invalid|
20|Expressen|<https://www.expressen.se/rss/>|200 (HTML_RETURNED)|02/19/2026|invalid|
21|Aftonbladet Sport|<https://www.aftonbladet.se/rss/sport>|404 (HTTP_404)|02/19/2026|invalid|
22|Metro Stockholm|<https://www.metro.se/rss/nyheter>|200 (HTML_RETURNED)|02/19/2026|invalid|
23|Sydsvenskan|<https://www.svd.se/rss/sydsvenskan>|404 (HTTP_404)|02/19/2026|invalid|
24|Svt|<https://www.svt.se/nyheter/rss.xml?sectionId=2>|200|02/19/2026|valid|
25|Dagens Nyheter Sport|<https://www.dn.se/sport/rss>|200|02/19/2026|valid|
26|Expressen Opinion|<https://www.expressen.se/rss/opinion>|404 (HTTP_404)|02/19/2026|invalid|
27|Dagens Nyheter Business|<https://www.dn.se/ekonomi/rss>|200|02/19/2026|valid|
28|Norran|<https://www.norran.se/rss>|200|02/19/2026|valid|
29|DN|<https://www.dn.se/rss/teknik/>|404 (HTTP_404)|02/19/2026|invalid|
30|Aftonbladet|<https://www.aftonbladet.se/rss/kultur.xml>|404 (HTTP_404)|02/19/2026|invalid|

### Belgium (BE)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|Le Soir|<https://www.lesoir.be/1/rss>|403 (HTTP_403)|02/19/2026|invalid|
2|De Morgen|<https://www.demorgen.be/rss.xml>|200|02/19/2026|valid|
3|RTBF|<https://www.rtbf.be/auvio/rss>|200 (HTML_RETURNED)|02/19/2026|invalid|
4|La Libre|<https://www.lalibre.be/feed/>|404 (HTTP_404)|02/19/2026|invalid|
5|De Standaard|<https://www.standaard.be/feed>|403 (HTTP_403)|02/19/2026|invalid|
6|Knack|<https://www.knack.be/feed/>|200|02/19/2026|valid|
7|VRT News|<https://www.vrt.be/vrtnws/nl.rss>|404 (HTTP_404)|02/19/2026|invalid|
8|De Tijd|<https://www.tijd.be/rss>|403 (HTTP_403)|02/19/2026|invalid|
9|Gazet van Antwerpen|<https://www.gva.be/feed/>|ERR (TIMEOUT)|02/19/2026|invalid|
10|Het Laatste Nieuws|<https://www.hln.be/rss/nieuws>|404 (HTTP_404)|02/19/2026|invalid|
11|La Dernière Heure|<https://www.dhnet.be/rss.xml>|200|02/19/2026|valid|
12|Le Vif|<https://www.levif.be/rss>|405 (HTTP_405)|02/19/2026|invalid|
13|RTBF|<https://www.rtbf.be/rss/rss_activites.xml>|404 (HTTP_404)|02/19/2026|invalid|
14|Sudpresse|<https://www.sudpresse.be/rss>|403 (HTTP_403)|02/19/2026|invalid|
15|Lavenir|<https://www.lavenir.net/flux.xml>|404 (HTTP_404)|02/19/2026|invalid|
16|Het Nieuwsblad|<https://www.nieuwsblad.be/rss/>|200|02/19/2026|valid|
17|De Morgen Economy|<https://www.demorgen.be/rss/economie/>|404 (HTTP_404)|02/19/2026|invalid|
18|Le Soir World|<https://www.lesoir.be/arc/outboundfeeds/rss/?outputType=xml>|403 (HTTP_403)|02/19/2026|invalid|
19|La Libre Belgique|<https://www.lalibre.be/rss/>|200|02/19/2026|valid|
20|De Morgen|<https://www.demorgen.be/feed/>|404 (HTTP_404)|02/19/2026|invalid|
21|Le Soir|<https://www.lesoir.be/rss/>|403 (HTTP_403)|02/19/2026|invalid|
22|La Libre Belgique|<https://www.lalibre.be/feeds/all>|404 (HTTP_404)|02/19/2026|invalid|
23|RTBF|<https://www.rtbf.be/auvio/rss/news>|200 (HTML_RETURNED)|02/19/2026|invalid|
24|De Tijd|<https://www.tijd.be/rss/international>|404 (HTTP_404)|02/19/2026|invalid|
25|RTBF|<https://www.rtbf.be/rss/>|404 (HTTP_404)|02/19/2026|invalid|
26|Le Matin|<https://www.lematindemorgen.be/rss/>|ERR (NETWORK)|02/19/2026|invalid|
27|La Libre|<https://www.lalibre.be/rss>|200|02/19/2026|valid|
28|VRT|<https://www.vrt.be/vrtnws/en/rss>|404 (HTTP_404)|02/19/2026|invalid|
29|RTL Belgium|<https://www.rtbf.be/newsline/rss>|404 (HTTP_404)|02/19/2026|invalid|
30|Belgium RTL|<https://www.rtbf.be/rss>|404 (HTTP_404)|02/19/2026|invalid|

### Thailand (TH)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|Bangkok Post|<https://www.bangkokpost.com/rss>|200 (HTML_RETURNED)|02/19/2026|invalid|
2|The Nation|<https://www.nationthailand.com/feed>|200 (HTML_RETURNED)|02/19/2026|invalid|
3|Prachatai|<https://prachatai.com/feed>|403 (HTTP_403)|02/19/2026|invalid|
4|ThaiPBS|<https://www.thaipbs.or.th/rss/home>|404 (HTTP_404)|02/19/2026|invalid|
5|Khaosod|<https://www.khaosod.co.th/rss.xml>|404 (HTTP_404)|02/19/2026|invalid|
6|Manager Magazine Thailand|<https://www.manager.co.th/rss>|404 (HTTP_404)|02/19/2026|invalid|
7|The Nation|<https://www.nationthailand.com/rss/world>|200 (HTML_RETURNED)|02/19/2026|invalid|
8|Bangkok Post Business|<https://www.bangkokpost.com/rss/>|200 (HTML_RETURNED)|02/19/2026|invalid|
9|Thai PBS Politics|<https://www.thaipbs.or.th/rss/politics.xml>|404 (HTTP_404)|02/19/2026|invalid|
10|Post Today|<https://www.posttoday.com/rss>|200 (HTML_RETURNED)|02/19/2026|invalid|
11|The Thaiger|<https://thethaiger.com/feed>|200|02/19/2026|valid|
12|Khaosod English|<https://www.khaosodenglish.com/rss>|200|02/19/2026|valid|
13|Matichon|<https://www.matichon.co.th/rss>|200|02/19/2026|valid|
14|PPTV|<https://www.pptvhd36.com/rss>|404 (HTTP_404)|02/19/2026|invalid|
15|Bangkok Post|<https://www.bangkokpost.com/rss/?category=world>|200 (HTML_RETURNED)|02/19/2026|invalid|
16|Manager|<https://www.manager.co.th/rss/business>|404 (HTTP_404)|02/19/2026|invalid|
17|Matichon|<https://www.matichon.co.th/rss/economy>|200 (HTML_RETURNED)|02/19/2026|invalid|
18|Prachachat|<https://prachachat.net/feed/>|200|02/19/2026|valid|
19|Khaosod|<https://www.khaosod.co.th/rss/world.xml>|404 (HTTP_404)|02/19/2026|invalid|
20|Manager|<https://www.manager.co.th/rss/market>|404 (HTTP_404)|02/19/2026|invalid|
21|Thaipbs|<https://www.thaipbs.or.th/feed/>|404 (HTTP_404)|02/19/2026|invalid|
22|PPTV|<https://www.pptvhd36.com/rss/politics.xml>|404 (HTTP_404)|02/19/2026|invalid|
23|Nation Thailand|<https://www.nationthailand.com/rss/politics>|200 (HTML_RETURNED)|02/19/2026|invalid|
24|Khaosod English|<https://www.khaosodenglish.com/world/rss>|404 (HTTP_404)|02/19/2026|invalid|
25|Daily News|<https://www.dailynews.co.th/rss>|200|02/19/2026|valid|
26|Bangkok Post Economy|<https://www.bangkokpost.com/rss/?department=business>|200 (HTML_RETURNED)|02/19/2026|invalid|
27|The Thaiger|<https://thethaiger.com/thailand/rss>|404 (HTTP_404)|02/19/2026|invalid|
28|Matichon|<https://www.matichon.co.th/rss/world>|200 (HTML_RETURNED)|02/19/2026|invalid|
29|Prachatai|<https://prachatai.com/rss/local>|403 (HTTP_403)|02/19/2026|invalid|
30|The Nation|<https://www.nationthailand.com/rss/society>|200 (HTML_RETURNED)|02/19/2026|invalid|

### Iran (IR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|Tehran Times|<https://www.tehrantimes.com/rss>|ERR (TIMEOUT)|02/19/2026|invalid|
2|IRNA|<https://www.irna.ir/rss>|200|02/19/2026|valid|
3|Mehr News|<https://www.mehrnews.com/rss>|200|02/19/2026|valid|
4|Tasnim|<https://www.tasnimnews.com/en/rss/all>|ERR (NETWORK)|02/19/2026|invalid|
5|Fars News|<https://www.farsnews.com/rss>|ERR (NETWORK)|02/19/2026|invalid|
6|ISNA (IRNA Satellite)|<https://www.isna.ir/rss>|200 (HTML_RETURNED)|02/19/2026|invalid|
7|Press TV|<https://www.presstv.com/rss>|403 (HTTP_403)|02/19/2026|invalid|
8|ILNA|<https://www.ilna.news/rss>|200|02/19/2026|valid|
9|Khabar Online|<https://www.khabaronline.ir/rss>|200|02/19/2026|valid|
10|Iran International|<https://www.iranintl.com/feed>|200|02/19/2026|valid|
11|Aftab Press|<https://www.aftabnews.ir/rss>|404 (HTTP_404)|02/19/2026|invalid|
12|Tasnim (Politics)|<https://www.tasnimnews.com/fa/rss/politics>|ERR (NETWORK)|02/19/2026|invalid|
13|Mehr News (Politics)|<https://www.mehrnews.com/rss/politic>|404 (HTTP_404)|02/19/2026|invalid|
14|Tehran Times (Business)|<https://www.tehrantimes.com/rss.aspx?sectionId=2>|ERR (TIMEOUT)|02/19/2026|invalid|
15|ILNA|<https://www.ilna.ir/rss>|200|02/19/2026|valid|
16|Tasnim|<https://www.tasnimnews.com/rss/all>|ERR (NETWORK)|02/19/2026|invalid|
17|Mehr News|<https://www.mehrnews.com/feed/>|404 (HTTP_404)|02/19/2026|invalid|
18|Financial Tribune|<https://financialtribune.com/feed>|ERR (TIMEOUT)|02/19/2026|invalid|
19|Iran News|<https://irannews.org/rss>|ERR (NETWORK)|02/19/2026|invalid|
20|Shargh|<https://www.sharghdaily.com/rss>|404 (HTTP_404)|02/19/2026|invalid|
21|Mehr News English|<https://www.mehrnews.com/rss/english>|404 (HTTP_404)|02/19/2026|invalid|
22|Iran International News|<https://www.iranintl.com/en/rss>|200 (HTML_RETURNED)|02/19/2026|invalid|
23|Press TV|<https://www.presstv.ir/en/rss/iran.xml>|404 (HTTP_404)|02/19/2026|invalid|
24|Tasnim (Economy)|<https://www.tasnimnews.com/fa/rss/finance>|ERR (NETWORK)|02/19/2026|invalid|
25|Tejarat News|<https://www.tejaratnews.com/rss>|200|02/19/2026|valid|
26|Aftab|<https://www.aftabnews.ir/rss/1>|404 (HTTP_404)|02/19/2026|invalid|
27|IRNA (Culture)|<https://www.irna.ir/rss/culture.xml>|404 (HTTP_404)|02/19/2026|invalid|
28|IRNA English|<https://www.irna.ir/rss/en>|404 (HTTP_404)|02/19/2026|invalid|
29|Press TV|<https://www.presstv.com/english/rss>|403 (HTTP_403)|02/19/2026|invalid|
30|ILNA|<https://www.ilna.ir/rss/1>|404 (HTTP_404)|02/19/2026|invalid|

### Argentina (AR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|La Nacion (Economy)|<https://www.lanacion.com.ar/arc/outboundfeeds/rss/?outputType=xml&rotation=economia>|200|02/19/2026|valid|
2|Clarín (Politics)|<https://www.clarin.com/rss/politica/>|200|02/19/2026|valid|
3|Infobae (General)|<https://www.infobae.com/arc/outboundfeeds/rss/?outputType=xml>|200|02/19/2026|valid|
4|Cronista (Finance)|<https://www.cronista.com/files/rss/news.xml>|200|02/19/2026|valid|
5|Ambito Financiero|<https://www.ambito.com/rss/pages/home.xml>|200|02/19/2026|valid|
6|Perfil|<https://www.perfil.com/feed/>|200|02/19/2026|valid|
7|EconoJournal|<https://www.econojournal.com.ar/rss>|200|02/19/2026|valid|
8|Reporte Energía|<https://www.reporteenergia.com>|200 (HTML_RETURNED)|02/19/2026|invalid|
9|Mining Press|<https://miningpress.com>|ERR (TLS)|02/19/2026|invalid|
10|LA Nacion (Politics)|<https://www.lanacion.com.ar/politica/feed/>|404 (HTTP_404)|02/19/2026|invalid|
11|Clarín (Economy)|<https://www.clarin.com/rss/economia/>|200|02/19/2026|valid|
12|Infobae (Arg)|<https://www.infobae.com/arc/outboundfeeds/rss/?outputType=xml>|200|02/19/2026|valid|
13|Cronista (Crypto)|<https://www.cronista.com/feed/>|200 (HTML_RETURNED)|02/19/2026|invalid|
14|Clarín (Mundo)|<https://www.clarin.com/rss/mundo/>|200|02/19/2026|valid|
15|La Nacion (Política)|<https://www.lanacion.com.ar/politica/?output=atom>|200 (HTML_RETURNED)|02/19/2026|invalid|
16|Perfil (Política)|<https://www.perfil.com/politica/feed>|404 (HTTP_404)|02/19/2026|invalid|
17|Página/12 (Mundo)|<https://www.pagina12.com.ar/feed/rss2>|404 (HTTP_404)|02/19/2026|invalid|
18|La Voz del Interior|<https://www.lavoz.com.ar/rss>|200 (HTML_RETURNED)|02/19/2026|invalid|
19|Cronica|<https://www.cronica.com.ar/rss>|404 (HTTP_404)|02/19/2026|invalid|
20|Infobae (Mundo)|<https://www.infobae.com/arc/outboundfeeds/rss/?outputType=xml>|200|02/19/2026|valid|
21|Ambito Financiero|<https://www.ambito.com/rss/negocios.xml>|200|02/19/2026|valid|
22|El Destape|<https://eldestapeweb.com/rss>|404 (HTTP_404)|02/19/2026|invalid|
23|Minuto Uno|<https://www.minutouno.com/rss>|200 (HTML_RETURNED)|02/19/2026|invalid|
24|La Politica Online|<https://www.lapoliticaonline.com/rss>|200 (HTML_RETURNED)|02/19/2026|invalid|
25|Tiempo Argentino|<https://www.tiempoar.com.ar/feed>|200|02/19/2026|valid|
26|Todo Noticias|<https://tn.com.ar/rss>|404 (HTTP_404)|02/19/2026|invalid|
27|Perfil (Negocios)|<https://www.perfil.com/economia/feed>|404 (HTTP_404)|02/19/2026|invalid|
28|Ciudad|<https://www.ciudad.com.ar/rss>|404 (HTTP_404)|02/19/2026|invalid|
29|La Voz|<https://www.lavoz.com.ar/rss/>|200 (HTML_RETURNED)|02/19/2026|invalid|
30|CNM Noticias|<https://www.cronica.com.ar/rss/cnm>|404 (HTTP_404)|02/19/2026|invalid|

### Austria (AT)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|Der Standard|<https://www.derstandard.at/standardplus?output=rss>|200 (HTML_RETURNED)|02/19/2026|invalid|
2|Kronen Zeitung|<https://www.krone.at/2/2.0.0?output=rss>|404 (HTTP_404)|02/19/2026|invalid|
3|ORF|<https://rss.orf.at/news.xml>|200|02/19/2026|valid|
4|Salzburg24|<https://www.salzburg24.at/rss>|404 (HTTP_404)|02/19/2026|invalid|
5|Die Presse|<https://www.diepresse.com/rss>|200|02/19/2026|valid|
6|Kurier|<https://www.kurier.at/1.0.0/feed.rss>|404 (HTTP_404)|02/19/2026|invalid|
7|Kleine Zeitung|<https://www.kleinezeitung.at/home/rss.xml>|404 (HTTP_404)|02/19/2026|invalid|
8|Tiroler Tageszeitung|<https://www.tt.com/rss/allnews.xml>|404 (HTTP_404)|02/19/2026|invalid|
9|Salzburger Nachrichten|<https://www.sn.at/rss>|404 (HTTP_404)|02/19/2026|invalid|
10|Wiener Zeitung|<https://www.wienerzeitung.at/rss>|404 (HTTP_404)|02/19/2026|invalid|
11|Der Standard|<https://www.derstandard.at/rss>|200|02/19/2026|valid|
12|Heute|<https://www.heute.at/feed/>|404 (HTTP_404)|02/19/2026|invalid|
13|Wirtschaftsblatt|<https://www.wirtschaftsblatt.at/rss>|ERR (NETWORK)|02/19/2026|invalid|
14|ORF Aktuell|<https://rss.orf.at/>|200|02/19/2026|valid|
15|Presseportal Österreich|<https://www.presseportal.at/>|ERR (NETWORK)|02/19/2026|invalid|
16|Kurier (Top News)|<https://www.kurier.at/feed>|404 (HTTP_404)|02/19/2026|invalid|
17|Neue Donau|<https://www.neue.at/feed>|200|02/19/2026|valid|
18|Kleine Zeitung (Sport)|<https://www.kleinezeitung.at/sport/rss>|404 (HTTP_404)|02/19/2026|invalid|
19|ORF Sport|<https://rss.orf.at/ardienst>|404 (HTTP_404)|02/19/2026|invalid|
20|Kurier (Economy)|<https://www.kurier.at/rss/business.xml>|404 (HTTP_404)|02/19/2026|invalid|
21|Die Presse|<https://www.diepresse.com/>|200 (HTML_RETURNED)|02/19/2026|invalid|
22|Der Standard|<https://www.derstandard.at/rss?section=welt>|200|02/19/2026|valid|
23|Kurier|<https://www.kurier.at/2/2.0.0?output=rss>|404 (HTTP_404)|02/19/2026|invalid|
24|Kleine Zeitung|<https://www.kleinezeitung.at/rss/home>|200|02/19/2026|valid|
25|ORF TOP|<https://rss.orf.at/world.xml>|404 (HTTP_404)|02/19/2026|invalid|
26|Der Standard|<https://www.derstandard.at/rss?output=amp>|200|02/19/2026|valid|
27|Wiener Zeitung|<https://www.wienerzeitung.at/rss/>|404 (HTTP_404)|02/19/2026|invalid|
28|Oberösterreichische Nachrichten|<https://www.nachrichten.at/news/>|410 (HTTP_410)|02/19/2026|invalid|
29|ORF|<https://rss.orf.at/wirtschaft.xml>|404 (HTTP_404)|02/19/2026|invalid|
30|Der Standard Plus|<https://www.derstandard.at/rss/wirtschaft>|200|02/19/2026|valid|

### Norway (NO)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|NRK|<https://www.nrk.no/toppsaker.rss>|200|02/19/2026|valid|
2|VG|<https://www.vg.no/rss/feed.rss>|404 (HTTP_404)|02/19/2026|invalid|
3|Aftenbladet|<https://www.aftenposten.no/rss/entertainment.rss>|404 (HTTP_404)|02/19/2026|invalid|
4|TV2|<https://www.tv2.no/rss>|200 (HTML_RETURNED)|02/19/2026|invalid|
5|NRK News|<https://www.nrk.no/nyheter/siste.rss>|200|02/19/2026|valid|
6|Aftenposten|<https://www.aftenposten.no/rss/toppsaker.rss>|404 (HTTP_404)|02/19/2026|invalid|
7|Dagbladet|<https://www.dagbladet.no/rss/abonnent>|404 (HTTP_404)|02/19/2026|invalid|
8|Bergens Tidende|<https://www.bt.no/rss/toppsaker.rss>|404 (HTTP_404)|02/19/2026|invalid|
9|Dagens Næringsliv|<https://www.dn.no/rss/>|200 (HTML_RETURNED)|02/19/2026|invalid|
10|TV2|<https://www.tv2.no/rss/toppsaker.xml>|200|02/19/2026|valid|
11|Nettavisen|<https://www.nettavisen.no/rss>|200 (HTML_RETURNED)|02/19/2026|invalid|
12|E24|<https://e24.no/rss>|200|02/19/2026|valid|
13|NRK Sport|<https://www.nrk.no/sport/rss.xml>|404 (HTTP_404)|02/19/2026|invalid|
14|Aftenposten Business|<https://www.aftenposten.no/rss/okonomi.rss>|404 (HTTP_404)|02/19/2026|invalid|
15|VG World|<https://www.vg.no/rss/toppsaker.rss>|404 (HTTP_404)|02/19/2026|invalid|
16|Dagbladet|<https://www.dagbladet.no/rss/nyheter>|200|02/19/2026|valid|
17|VG|<https://www.vg.no/rss/nyheter.rss>|404 (HTTP_404)|02/19/2026|invalid|
18|TV2|<https://www.tv2.no/rss/nyheter/>|200|02/19/2026|valid|
19|Aftenposten|<https://www.aftenposten.no/rss/helse.rss>|404 (HTTP_404)|02/19/2026|invalid|
20|Nettavisen|<https://www.nettavisen.no/rss/nyheter>|200 (HTML_RETURNED)|02/19/2026|invalid|
21|NRK Finans|<https://www.nrk.no/nyheter/okonomi.rss>|404 (HTTP_404)|02/19/2026|invalid|
22|E24|<https://e24.no/rss/okonomi.xml>|200|02/19/2026|valid|
23|NRK Sports|<https://www.nrk.no/sport.rss>|404 (HTTP_404)|02/19/2026|invalid|
24|Dagbladet|<https://www.dagbladet.no/rss/inside>|404 (HTTP_404)|02/19/2026|invalid|
25|Aftenbladet|<https://www.aftenbladet.no/rss/toppsaker.rss>|404 (HTTP_404)|02/19/2026|invalid|
26|Nettavisen|<https://www.nettavisen.no/rss/tech>|200 (HTML_RETURNED)|02/19/2026|invalid|
27|TV2|<https://www.tv2.no/rss/politikk.xml>|200|02/19/2026|valid|
28|NRK Tech|<https://www.nrk.no/klikk.rss>|404 (HTTP_404)|02/19/2026|invalid|
29|TV2|<https://www.tv2.no/rss/>|200 (HTML_RETURNED)|02/19/2026|invalid|
30|E24|<https://e24.no/rss/nyheter.xml>|200|02/19/2026|valid|

### United Arab Emirates (AE)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|Gulf News|<https://gulfnews.com/rss>|404 (HTTP_404)|02/19/2026|invalid|
2|Khaleej Times|<https://www.khaleejtimes.com/rss>|404 (HTTP_404)|02/19/2026|invalid|
3|The National|<https://www.thenationalnews.com/rss>|404 (HTTP_404)|02/19/2026|invalid|
4|Khaleej Times Business|<https://www.khaleejtimes.com/tech/rss>|404 (HTTP_404)|02/19/2026|invalid|
5|Arabian Business|<https://www.arabianbusiness.com/rss.xml>|403 (HTTP_403)|02/19/2026|invalid|
6|The National UAE|<https://www.thenationalnews.com/rss/uae.xml>|404 (HTTP_404)|02/19/2026|invalid|
7|Gulf News Business|<https://gulfnews.com/business/rss>|404 (HTTP_404)|02/19/2026|invalid|
8|Khaleej Times UAE|<https://www.khaleejtimes.com/uae/rss>|404 (HTTP_404)|02/19/2026|invalid|
9|Gulf News World|<https://gulfnews.com/world/rss>|404 (HTTP_404)|02/19/2026|invalid|
10|The National Business|<https://www.thenationalnews.com/rss/business.xml>|404 (HTTP_404)|02/19/2026|invalid|
11|The National Technology|<https://www.thenationalnews.com/rss/tech>|404 (HTTP_404)|02/19/2026|invalid|
12|Emirates247|<https://www.emirates247.com/rss>|404 (HTTP_404)|02/19/2026|invalid|
13|Wam News|<https://wam.ae/en/rss>|200 (HTML_RETURNED)|02/19/2026|invalid|
14|Khaleej Times Sports|<https://www.khaleejtimes.com/sport/rss>|404 (HTTP_404)|02/19/2026|invalid|
15|Gulf News|<https://gulfnews.com/rss/world.xml>|404 (HTTP_404)|02/19/2026|invalid|
16|Gulf News|<https://gulfnews.com/rss/business.xml>|404 (HTTP_404)|02/19/2026|invalid|
17|Khaleej Times|<https://www.khaleejtimes.com/rss/sports.xml>|404 (HTTP_404)|02/19/2026|invalid|
18|Khaleej Times|<https://www.khaleejtimes.com/rss/business.xml>|404 (HTTP_404)|02/19/2026|invalid|
19|Emirates247|<https://www.emirates247.com/rss/business.xml>|404 (HTTP_404)|02/19/2026|invalid|
20|Gulf News|<https://gulfnews.com/rss/sports.xml>|404 (HTTP_404)|02/19/2026|invalid|
21|The National|<https://www.thenationalnews.com/rss/world.xml>|404 (HTTP_404)|02/19/2026|invalid|
22|WAM|<https://wam.ae/en/xml/rss>|200 (HTML_RETURNED)|02/19/2026|invalid|
23|Dubai Eye|<https://www.dubaieye103.com/feed/>|ERR (NETWORK)|02/19/2026|invalid|
24|Kuwait Times|<https://www.kuwaittimes.com/feed/>|404 (HTTP_404)|02/19/2026|invalid|
25|Gulf News|<https://gulfnews.com/rss/usa.xml>|404 (HTTP_404)|02/19/2026|invalid|
26|Gulf News|<https://gulfnews.com/rss/middle-east.xml>|404 (HTTP_404)|02/19/2026|invalid|
27|Khaleej Times|<https://www.khaleejtimes.com/rss/world.xml>|404 (HTTP_404)|02/19/2026|invalid|
28|Arabian Business|<https://www.arabianbusiness.com/rss.xml?output=1>|403 (HTTP_403)|02/19/2026|invalid|
29|Arabian Business|<https://www.arabianbusiness.com/rss>|403 (HTTP_403)|02/19/2026|invalid|
30|Al Bayan|<https://www.albayan.ae/rss>|404 (HTTP_404)|02/19/2026|invalid|

### Global Energy & Grid (Global)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|OilPrice|<https://oilprice.com/rss/main>|200|02/19/2026|valid|
2|Energy Intelligence|<https://www.energyintel.com/rss>|404 (HTTP_404)|02/19/2026|invalid|
3|Power Engineering|<https://www.power-eng.com/feed/>|200|02/19/2026|valid|
4|Renewable Energy World|<https://www.renewableenergyworld.com/feed/>|200|02/19/2026|valid|
5|Utility Dive|<https://www.utilitydive.com/feeds/news/>|200|02/19/2026|valid|
6|CleanTechnica|<https://cleantechnica.com/feed/>|200|02/19/2026|valid|
7|Energy Storage Report|<https://www.energystorage.org/feed/>|404 (HTTP_404)|02/19/2026|invalid|
8|Grid View|<https://www.grid.co.uk/feed/>|ERR (TLS)|02/19/2026|invalid|
9|Energy Voice|<https://www.energyvoice.com/feed/>|403 (HTTP_403)|02/19/2026|invalid|
10|Greentech Media|<https://www.greentechmedia.com/feeds/all.xml>|200 (HTML_RETURNED)|02/19/2026|invalid|
11|Carbon Brief|<https://www.carbonbrief.org/feed/>|200|02/19/2026|valid|
12|Power Magazine|<https://www.powermag.com/feed/>|200|02/19/2026|valid|
13|Energy Central|<https://energycentral.com/feed>|404 (HTTP_404)|02/19/2026|invalid|
14|Energy Wire|<https://www.energywire.com/feed/>|ERR (TLS)|02/19/2026|invalid|
15|PV Magazine|<https://www.pv-magazine.com/feed/>|200|02/19/2026|valid|
16|Renewables Now|<https://www.renewablesnow.com/feed/>|200 (HTML_RETURNED)|02/19/2026|invalid|
17|Energy Post|<https://energypost.eu/feed/>|200|02/19/2026|valid|
18|S&P Global|<https://www.spglobal.com/marketintelligence/en/rss>|403 (HTTP_403)|02/19/2026|invalid|
19|IEA|<https://iea.blob.core.windows.net/assets/3d6b5c8a-4f90-4dcb-8f4b-abc.xml>|404 (HTTP_404)|02/19/2026|invalid|
20|Clean Energy Wire|<https://www.cleanenergywire.org/rss>|404 (HTTP_404)|02/19/2026|invalid|
21|EIA|<https://www.eia.gov/xml/rss/eia.xml>|404 (HTTP_404)|02/19/2026|invalid|
22|IEA|<https://iea.blob.core.windows.net/assets/energy.xml>|404 (HTTP_404)|02/19/2026|invalid|
23|IEA Oil|<https://iea.blob.core.windows.net/assets/oil.xml>|404 (HTTP_404)|02/19/2026|invalid|
24|Reuters Energy|<https://www.reuters.com/energy/feed>|401 (HTTP_401)|02/19/2026|invalid|
25|S&P Global|<https://www.spglobal.com/marketintelligence/en/rss/energy>|403 (HTTP_403)|02/19/2026|invalid|
26|Argus Media|<https://www.argusmedia.com/rss>|404 (HTTP_404)|02/19/2026|invalid|
27|Energy Central|<https://energycentral.com/feed/>|404 (HTTP_404)|02/19/2026|invalid|
28|Energy Storage News|<https://www.energy-storage.news/rss>|200|02/19/2026|valid|
29|Energy Storage News|<https://www.energy-storage.news/feed>|200|02/19/2026|valid|
30|Renewable Energy Storage|<https://www.renewableenergystorage.com/feed/>|ERR (NETWORK)|02/19/2026|invalid|
