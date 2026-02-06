# LATAM Source HTTP Verification

- Generated at: 2026-02-06T16:40:36.155Z
- Total endpoints checked: 11

## Status Counts

- ok_xml: 9
- unexpected_content: 2

| Source | Country | Method | Status | HTTP | XML | URL | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Argentina Top Mix | Argentina | rss | ok_xml | 200 | yes | https://news.google.com/rss/search?q=(site:clarin.com+OR+site:lanacion.com.ar+OR+site:infobae.com)+when:2d&hl=es-419&gl=AR&ceid=AR:es-419 | xml markers detected |
| Bing News Argentina | Argentina | rss | unexpected_content | 200 | no | https://www.bing.com/news/search?q=Argentina+ultimas+noticias&format=rss | non-xml response snippet: <!doctype html><html xml:lang="en" xmlns=http://www.w3.org/1999/xhtml xmlns:web=http://schemas.live.com/web><head><meta  |
| Bing News Chile | Chile | rss | unexpected_content | 200 | no | https://www.bing.com/news/search?q=Chile+ultimas+noticias&format=rss | non-xml response snippet: <!doctype html><html xml:lang="en" xmlns=http://www.w3.org/1999/xhtml xmlns:web=http://schemas.live.com/web><head><meta  |
| Bing News Uruguay | Uruguay | rss | ok_xml | 200 | yes | https://www.bing.com/news/search?q=Uruguay+ultimas+noticias&format=rss | xml markers detected |
| Chile Top Mix | Chile | rss | ok_xml | 200 | yes | https://news.google.com/rss/search?q=(site:emol.com+OR+site:latercera.com+OR+site:biobiochile.cl)+when:2d&hl=es-419&gl=CL&ceid=CL:es-419 | xml markers detected |
| Google News Argentina | Argentina | rss | ok_xml | 200 | yes | https://news.google.com/rss?hl=es-419&gl=AR&ceid=AR:es-419 | xml markers detected |
| Google News Chile | Chile | rss | ok_xml | 200 | yes | https://news.google.com/rss?hl=es-419&gl=CL&ceid=CL:es-419 | xml markers detected |
| Google News Uruguay | Uruguay | rss | ok_xml | 200 | yes | https://news.google.com/rss?hl=es-419&gl=UY&ceid=UY:es-419 | xml markers detected |
| Latin America | LATAM | rss | ok_xml | 200 | yes | https://news.google.com/rss/search?q=(Argentina+OR+Chile+OR+Uruguay)+when:2d&hl=es-419&gl=US&ceid=US:en | xml markers detected |
| LAVCA | LATAM | rss | ok_xml | 200 | yes | https://lavca.org/feed/ | xml markers detected |
| Uruguay Top Mix | Uruguay | rss | ok_xml | 200 | yes | https://news.google.com/rss/search?q=(site:elpais.com.uy+OR+site:elobservador.com.uy+OR+site:montevideo.com.uy)+when:2d&hl=es-419&gl=UY&ceid=UY:es-419 | xml markers detected |
