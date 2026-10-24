# Ocena zależności — etapy 1 i 2, 23.10.2026

## Aktualizacja etapu 2 — wąski override sharp

Punkt wyjścia etapu 2: PR #1 / `e80f07afd9c215b04bb222ed698c2dca9a25e946`. Porównanie `24820238b8da7c26f2bd297d1024404f4204eec8..e80f07afd9c215b04bb222ed698c2dca9a25e946` wykazało wyłącznie zmianę `TEST_REPORT.md`. Nie ponawiano trzech prób audio przed zmianą zależności — sprawdzono zapisane logi, SHA i asercje. Nowy zakres/testowany SHA są odnotowane w aktualnej części `TEST_REPORT.md` po regresji.

**Wprowadzona mała poprawka:** `overrides["@huggingface/transformers@3.8.1"].sharp = "0.35.5"`. Transformers pozostaje 3.8.1, ONNX/WASM i modele pozostają bez zmian; locka nie usunięto. Nie użyto `audit fix --force`, atrap pakietu sharp ani migracji Transformers v4. Override obejmuje wyłącznie zależność tego dokładnego rodzica w prototypie, nie główny projekt Sokuji.

### Co dokładnie zgłaszał audit

To **trzy odrębne advisory dotyczące sharp**, propagowane także do pakietu nadrzędnego — nie jedno advisory ani dwie niezależne biblioteki podatne na tę samą wadę. Npm liczył **2 pakiety high**: `sharp@0.34.5` oraz `@huggingface/transformers@3.8.1` (`via: sharp`).

| Oficjalne advisory | Zakres podatny | Pierwsza poprawiona wersja sharp | Warunki / dostarczane biblioteki |
|---|---|---|---|
| [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) | `<0.35.0` | 0.35.0 | Nieufne obrazy; libvips, m.in. dekodery GIF/TIFF/VIPS. Advisory zaleca poprawione libvips 8.18.3. |
| [GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) | `<0.35.4` | 0.35.4 | libheif/AVIF; możliwe RCE na glibc Linux w określonych warunkach. Poprawione libheif ≥1.23.2. |
| [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) | `<0.35.5` | 0.35.5 | librsvg/SVG; wada pamięci, w określonych warunkach RCE. Poprawione librsvg 2.63.2. |

Oficjalne źródła dodatkowe: [sharp 0.35.0 — zmiany niezgodne](https://github.com/lovell/sharp/releases/tag/v0.35.0), [0.35.4](https://github.com/lovell/sharp/releases/tag/v0.35.4), [0.35.5](https://github.com/lovell/sharp/releases/tag/v0.35.5), [binaria libvips 1.3.4](https://github.com/lovell/sharp-libvips/releases/tag/v1.3.4). Odczytane także metadane npm 3.8.1, 0.34.5, 0.35.5 i 4.3.1; to dowody wersji/deklaracji, nie samodzielny dowód zgodności aplikacji.

### Zakres i sprawdzenie kompatybilności

`^0.34.1` oznacza `>=0.34.1 <0.35.0`: **0.35.5 leży poza deklaracją upstream**, dlatego nie nazywamy tego zwykłą zgodną aktualizacją semver. To jawny, wąski wyjątek uzasadniony użyciem i sprawdzany testami. Przy aktualizacji rodzica trzeba ponownie ocenić zasadność/usunąć override; nie rozszerzać go automatycznie na kolejne wersje.

Release notes 0.35.0 wymieniają m.in. rezygnację z Node 18 (wymagane ≥20.9.0), usunięcie skryptu install i wybranych przestarzałych opcji (`failOnError`, `paletteBitDepth`, stare parametry sharpen, zmiana jp2k→jp2), limit kanałów wejścia i zmiany AVIF. W tym projekcie wymagany jest Node 24 (sprawdzono **24.19.0**), te usunięte opcje nie są używane przez importowany moduł obrazów Transformers 3.8.1, a aplikacja nie przyjmuje obrazów. Nie jest to gwarancja wszystkich API sharp ani wszystkich platform.

Kontrola przed i po aktualizacji sprawdziła dekodowanie i resize syntetycznego RGBA w `RawImage`: ten sam piksel `[5,10,15,255]`. Dodany test RGB/RGBA sprawdza rzeczywistą ścieżkę Node `RawImage.fromBlob → metadata/rotate/raw/toBuffer → resize`, a istniejący test tokenizera sprawdza używaną funkcję aplikacyjnego toolchainu. Nie użyto nieufnych obrazów ani nie dodano funkcji obrazowej do aplikacji. Faktycznie załadowane wersje natywne zmieniły się z sharp 0.34.5 / libvips 8.17.3 / libheif 1.20.2 / librsvg 2.61.2 na **0.35.5 / 8.18.7 / 1.23.5 / 2.63.2**.

### Osiągalność — etap po etapie

| Odcinek | Ustalenie |
|---|---|
| Przygotowanie modeli | `scripts/prepare-models.py` to Python: pobranie/kwantyzacja/tokenizer, bez Node/sharp. Nie uruchamiano ponownie pobrań modeli w etapie 2. |
| Kopiowanie assets/notices | `copy-assets.mjs` czyta pliki, package.json i licencje zależności; nie importuje sharp ani nie dekoduje obrazów. Notices odtworzono po zmianie locka. |
| TypeScript/Vite build | Rozwiązuje przeglądarkowy export `transformers.web.js`, nie uruchamia Node pipeline obrazowego. Nie ma wywołania sharp w konfiguracji budowania. |
| Test tokenizera Node | `tests/tokenizer.node.ts:4` importuje publiczny Node export Transformers. Diagnostyka zimnego importu potwierdziła 14 wpisów sharp i załadowanie `@img/sharp-linux-x64/lib/sharp-linux-x64.node`, mimo braku dekodowania obrazu. **Nie można twierdzić, że sharp w ogóle nie jest ładowany w Node.** |
| Nowy test zgodności | Celowo dekoduje własny mały PNG i wykonuje resize w Node, aby sprawdzić wyjątek zależności; dane to wyłącznie wygenerowane piksele. |
| Browser QA | Node uruchamia Playwright i ffmpeg; inferencja wykonuje się w przeglądarce, bez obrazów/Node sharp. |
| Gotowe WWW | Brak `.node/.so/.dll`, importu sharp i libvips. Po przebudowie **JS/CSS/WASM i pliki VAD były bajtowo identyczne** z bazą etapu 2; zmieniły się tylko `notices.txt` i hash `sw.js`. Nie wykazano ścieżki tych dekoderów w interfejsie WWW. |

`npm audit` po poprawce zwrócił **0 podatności** (w odczytanym rejestrze), zamiast dwóch pakietów high. Nie oznacza to audytu całego produktu, akceptacji ryzyk przez właściciela, walidacji medycznej ani zatwierdzenia wdrożenia. Brak CI, fizycznych testów, odsłuchu i oceny semantyki pozostaje otwarty.

Migracja Transformers do 4.3.1 nie jest potrzebna do tej poprawki. Jeżeli wąski override zostanie odrzucony przy przeglądzie, alternatywy do osobnej decyzji to migracja v4 (nowe tokenizery/runtime, szacunkowo 2–4 dni prac + fizyczne QA) albo utrzymywany wariant/fork v3 dla przeglądarki bez natywnego pakietu obrazowego (szacunkowo 2–4 dni, dodatkowy stały koszt utrzymania zależności). To orientacyjne nakłady techniczne, nie wycena ani nowy obowiązek finansowy. **Żadnej z tych większych zmian nie wdrożono.**

## Historia — ocena etapu 1, przed wąskim override

Zakres: lock niezależnego prototypu, `npm audit --json` oraz publiczne rekordy GitHub Advisory odczytane przez API. Nie uruchamiano `audit fix --force`. Nie jest to pełny audyt bezpieczeństwa ani zatwierdzenie publikacji.

## Zgłoszenia i decyzje

| Ścieżka i wersja bazowa | Konkretne advisory | Zasięg i decyzja |
|---|---|---|
| devDependency `vite@8.1.5` | [GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm), [GHSA-698v-4r3x-3vcv](https://github.com/advisories/GHSA-698v-4r3x-3vcv), [GHSA-r825-w8mm-5pxw](https://github.com/advisories/GHSA-r825-w8mm-5pxw) | launch-editor: wykonanie poleceń/interpretacja argumentów, w tym ścieżki Windows. Dotyczy narzędzia deweloperskiego, nie statycznego tłumacza na Apache. Aktualizacja zgodna semver do **8.3.5**, bez instalacji nowego narzędzia. API advisory podaje m.in. poprawki w 8.1.6 / 8.3.3. |
| devDependency `vite@8.1.5` | [GHSA-rq7h-c2jc-7f22](https://github.com/advisories/GHSA-rq7h-c2jc-7f22), [GHSA-9jrq-w75r-8gcw](https://github.com/advisories/GHSA-9jrq-w75r-8gcw) | Dostęp poza `server.fs.allow` na niektórych ścieżkach oraz wykonanie skryptu przez custom middleware. Ta sama aktualizacja do 8.3.5 usuwa zgłoszenia z audytu. Podczas testów serwery uruchamiane na loopback; dev nie jest serwerem produkcyjnym. |
| `@huggingface/transformers@3.8.1 → sharp@0.34.5` | [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) | Dziedziczone podatności libvips; pierwsza poprawka sharp 0.35.0. |
| ten sam łańcuch | [GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) | libheif; pierwsza poprawka sharp 0.35.4. |
| ten sam łańcuch | [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) | librsvg; pierwsza poprawka sharp 0.35.5. |

Npm początkowo raportował **3 pakiety high**, nie trzy niezależne luki: Vite, sharp i Transformers.js jako zależny od sharp. Po aktualizacji Vite pozostały **2 pakiety high w jednym łańcuchu Transformers.js → sharp**. Audyt nadal kończy się kodem 1; nie oznaczamy go jako PASS/clean.

## Osiągalność sharp i otwarte ryzyko P1

Sharp jest natywną biblioteką przetwarzania obrazów w wariancie Node Transformers.js. Przeglądarkowy export to `transformers.web.js`; prototyp przyjmuje audio/tekst, nie obrazy. W sprawdzonym `dist/` nie ma natywnych `.node/.so/.dll`, importu sharp ani libvips. Vite i sharp nie są procesami serwera na planowanym hostingu statycznym. Nie potwierdzono zatem ścieżki wykorzystania tych luk przez interfejs przeglądarkowy prototypu.

Pozostaje ryzyko narzędzi/instalacji Node oraz przyszłego użycia innych ścieżek biblioteki. Nie wolno utożsamiać braku kodu sharp w pakiecie WWW z usunięciem advisory. Odczyt metadanych npm potwierdził, że ostatnim wydaniem linii 3 jest 3.8.1, deklarujące `sharp ^0.34.1`; wymuszenie 0.35.5 poza tym zakresem nie jest rutynową zgodną aktualizacją. Npm proponuje Transformers.js 4.3.1 — zmianę głównej wersji. **Odłożono ją do osobnego przeglądu**, wraz z wariantem usunięcia nieużywanej zależności Node bez naruszenia eksportów/licencji. Nie dodano wymuszonego override ani nowych modeli.

Przed publicznym udostępnieniem należy zamknąć lub formalnie ocenić to ryzyko, potwierdzić brak osiągalnej ścieżki i powtórzyć testy ASR/MT/tokenizera po ewentualnej migracji. Nie przetwarzać nieufnych obrazów za pomocą tej instalacji sharp. Testy używają tylko fikcyjnego lokalnego audio/tekstu.

## Odtworzenie kontroli

```bash
npm audit --json
npm run build
npm run test:csp
```

`test:csp` korzysta z istniejącego preview na 5180 i sam uruchamia tymczasowy dev na loopback. Sprawdza style, świeży nonce na każde żądanie dev, blokadę niezaufanego inline JS/CSS oraz brak produkcyjnego `unsafe-inline`, `unsafe-eval` i nonce dev. `wasm-unsafe-eval` pozostaje celowo potrzebne runtime WASM.
