# Korekta pochodzenia bazy — bez zmian aplikacji

Pierwszy baseFiles w dostawie b4cbb172 pochodził z zachowanej lokalnej paczki 6532e6406b9291de0712dadd4b78435dab57d5c1. Błędnie opisano go jako dokładny build Actions c29b166. Kod aplikacji, locki, modele i runtime były zgodne; dwa pliki artefaktowe nie były identyczne.

Koordynator ponownie zweryfikował wszystkie 73 wpisy oryginalnego manifestu Actions c29b166 z runu 40008774472. Pozostałe 68 wpisów baseFiles odpowiada lokalnej bazie. Manifest aktualizacji zawiera teraz dokładny wariant Actions:

| Plik | Bajty | SHA-256 |
|---|---:|---|
| notices.txt | 448544 | 4db9869166bcab6406f70376f6e3d33434fb3e4ea8c3a0c76792709f1f5c1bbc |
| sw.js | 2839 | 5316760ba31e7998457869eadf94262204725e1da0f954d339237721dc57ccf9 |

Lokalne notices miały 450325 B (fe5ad0cd437239601e278732db6497e067786f67129a59c0fa1856f2cddea9c2), a SW f3e388828a491e999e9c47e91ac3e370b0475fc3868b9ed0e279e566af293bb9. Generator copy-assets.mjs:34–51 pomija nieobecne pakiety opcjonalne i zbiera licencje z faktycznie zainstalowanego node_modules. Sam lock nie zapewnia więc identycznego notices między takimi instalacjami. Nie porównywano treści dwóch notesów, więc konkretnego różniącego się pakietu nie ustalono.

Vite liczy wersję powłoki z zawartości plików, w tym notices.txt (vite.config.ts:85–90). Różne notices wystarczają do innego klucza w starym SW. Nowy SW nie waliduje starych hashy ani zawartości notices: instaluje cache.addAll(FILES) po ścieżkach i zachowa oryginalne noty Actions z serwera overlay. Model cache pozostaje odrębny i nie jest kasowany.

Nie zmieniono package.json, package-lock.json, models.lock.json, generatora notices, Vite ani generatora SW względem c29b166. Nie zmieniono żadnego z pięciu plików patcha 648554 B, modeli, runtime ani licencji. Nowy manifest koryguje wyłącznie dwa wpisy bazowe i opis pochodzenia; nie dopuszcza dowolnych różnic. QA-update.json dokumentuje rzeczywiście wykonaną wcześniejszą próbę na wariancie lokalnym, nie na kopii artefaktu Actions. Próba Windows na dokładnej bazie Actions należy do koordynatora.
