# Etap 1 — ocena zależności, 23.10.2026

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
