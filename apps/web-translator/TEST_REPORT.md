# Wyniki prototypu — 23 października 2026

## Aktualne wyniki — etap 3: prywatny pakiet i lokalne Basic Auth

**Testowany SHA kodu/builda: `6532e6406b9291de0712dadd4b78435dab57d5c1`**, czyste źródła (`sourceDirty: false` we wszystkich pięciu raportach). Pełny lokalny test Basic Auth **23.10.2026 14:03:29–14:06:01 UTC**. CSP 14:05:25–14:05:31; równolegle osobna regresja podglądu od 14:05:31. Późniejsze zmiany dotyczą wyłącznie dokumentacji prototypu; pakowanie weryfikuje tę różnicę i SHA wszystkich bajtów payloadu względem testu.

Właściciel zatwierdził prywatne wdrożenie testowe **wyłącznie `https://ai.lekarz.nl/translator-test/`**, na istniejącym hostingu i dla fikcyjnych danych. **Nie wykonano uploadu ani konfiguracji hostingu.** Brakuje bezpiecznego dostępu ograniczonego do katalogu i zweryfikowanej ochrony HTTPS Basic Auth. Samo współdzielenie originu z WP, opisane w PRIVATE_TESTING.md, nie jest blokerem przyjętego wariantu. Bez zmian DNS/WP/DB/kont/main/Actions/uprawnień, płatnych API lub nowych narzędzi/modeli.

### Poprawki i zakres

- `src/installation.ts`, `src/cache.ts`: kanoniczna baza własnego originu z końcowym `/`, bez userinfo/query/hash; bez obcych originów, dot-segments, kodowanego traversal i nieprawidłowych ścieżek. Wszystkie wybrane URL sprawdzane przed pobieraniem. Zweryfikowane żądania mają **credentials same-origin i redirect error**. Bez haseł/Authorization w aplikacji, SHA-256 i timeout bezczynności nadal obowiązują; częściowy plik nie staje się poprawnym cache.
- `src/service-worker.ts`: guard GET/origin/path przed respondWith, fallback we własnym katalogu. Shell i modele mają nazwy per zakodowana ścieżka instalacji, spójne z main/worker/downloaderem. Aktywacja sprząta tylko własny stary shell; przycisk usuwa tylko własne modele. Legacy i WP pozostają nietknięte. Odczyt SW używa caches.match bez open, aby nie tworzyć ponownie usuniętego shella.
- `public/.htaccess`: **domyślna blokada publikacji Require all denied**, wygenerowany hash CSP, zachowane COOP/COEP, CORP same-origin, MIME WASM/MJS, nosniff, noindex i private/no-store. Noindex nie jest kontrolą dostępu; nagłówki cache nie odwołują jawnego Cache API.
- `scripts/copy-assets.mjs`, `scripts/package-private.py`: dołączone notices/licencje/karty; archiwum poza Git, manifest rozmiarów/SHA i kontrola wyodrębnienia. Pakowanie nie pobiera modeli ani nie wysyła plików. Szablon ochrony jest nieaktywny, bez fikcyjnej aktywnej ścieżki lub poświadczeń. Publikacja wymaga rzeczywistej ochrony przygotowanej przez administratora.

### Bieżące wyniki lokalne

| Bramka | Wynik |
|---|---|
| npm test | **20/20 PASS**, w tym timeout/progress/cancel/SHA, granice bazy/path i rzeczywisty HTTP redirect bez wejścia w target, guard SW dla POST/obcego originu/obcej ścieżki/nawigacji |
| TypeScript/Vite build | **PASS**, przenośny base `./` |
| Integralność | **34 artefakty / 514 438 880 B**, SHA i manifest zgodne z lockiem; uwierzytelnione rzeczywiste HTTP pobrało i sprawdziło wszystkie 34 |
| Basic Auth anonimowo | **401** dla index, JS, SW i artefaktu katalogu modelu; bez publicznego wyjątku dla modeli |
| Browser downloader | **PASS**: zatrzymane po 4 B HTTP, anulowanie i udane ponowienie/SHA, zły hash bez cache; odmowa manifest/path/base/userinfo/cross-origin i redirect; brak żądania do obcego targetu |
| Rzeczywiste MT w chronionym `/translator-test/` | **18/18 technicznych PASS**: 6 online + 6 reuse bez pobrania wag + 6 offline |
| Ten sam pakiet na osobnym lokalnym originie `/` | **18/18 technicznych PASS**, analogiczna seria; bez osobnego builda. Łącznie 36 MT, 6 audio. |
| Audio | **3 kolejne pełne rozpoznania w każdym wariancie**, bez automatycznych ponowień porażek; kontrolowane WebAudio/WAV, rzeczywiste VAD/Whisper/MT |
| Cache/WP/druga instalacja | **PASS**: kontrolne cache WP, legacy i modeli drugiego katalogu zachowane przy aktywacji/usuwaniu modeli; rzeczywista druga rejestracja SW; zewnętrzne GET/POST/nawigacja bez fallbacku aplikacji |
| Aktualizacja SW | **PASS**: kontrolowana nowa wersja SW instaluje się/przejmuje klienta i usuwa tylko poprzedni shell własnego katalogu, zachowując inne cache |
| Odebranie dostępu sieciowego | **PASS ograniczenia**: po wyłączeniu dostępu prawidłowe wcześniej poświadczenia otrzymują 401; następnie przeładowanie offline i wszystkie 6 kierunków nadal działają z lokalnej kopii, w obu wariantach. **Brak zdalnego revoke cache potwierdzony.** |
| Stop/odmowa mikrofonu/fallback TTS | **PASS** w obu wariantach; brak późnych wierszy, zakończone fake-track, czytelny błąd zgody, komunikat braku głosu i zachowane pole/tekst |
| CSP/dev/preview/proxy | **PASS**, świeży nonce tylko dev, blokada obcego inline JS/CSS, produkcyjne CSP bez unsafe-inline/unsafe-eval; prefiksy z/bez slash, awarie/timeouts startu i ponowienie, rzeczywisty MT przy blokadzie mikrofonu iframe |
| Fizyczne telefony / odsłuch / semantyka | **NIEPRZETESTOWANE**. Voices=[]; techniczny PASS nie zatwierdza błędu `stoi → ligt`. |
| Hosting/TLS/FTPS/Apache-LiteSpeed | **NIEPRZETESTOWANE**. Lokalny Node nie wykonuje .htaccess, nie weryfikuje infrastruktury WP ani dostępności ai.lekarz.nl. |
| CI / npm audit | Nie uruchamiano CI ani ponownego audytu npm. Nie przenosić historycznego audit 0 na ocenę całego produktu. |

Podczas QA generowane są efemeryczne dane Basic Auth wyłącznie w pamięci lokalnego harnessu, niewpisywane do raportów, repo ani pakietu. Negatywne HTTP używa małej syntetycznej zawartości do testu integralności, **nie zastępuje ASR/MT**. Rzeczywiste inferencje korzystają z istniejących przypiętych wag.

### Audio — dokładne czasy

Każdy przebieg rozpoznał **The blue bicycle is next to the house.** i przetłumaczył **De blauwe fiets ligt naast het huis.** Pełne asercje po normalizacji zachowane.

| Lokalizacja | Próba | Start→gotowość | WAV→MT | Łącznie |
|---|---:|---:|---:|---:|
| /translator-test/ | 1 | 2,210 s | 6,508 s | 8,720 s |
| /translator-test/ | 2 | 1,789 s | 6,643 s | 8,434 s |
| /translator-test/ | 3 | 1,485 s | 6,050 s | 7,536 s |
| Osobny origin / | 1 | 1,963 s | 6,596 s | 8,563 s |
| Osobny origin / | 2 | 2,072 s | 6,808 s | 8,882 s |
| Osobny origin / | 3 | 1,441 s | 5,927 s | 7,370 s |

W obu wariantach nativeCalls 1/2/3, phaseAtPlay listening, trackEnabled true, AudioContext running. Natywne getUserMedia używa fake-device i zgody nadanej programowo przez Playwright; jego wyciszony sygnał zastępuje strumień WebAudio/WAV dopiero po gotowości VAD. Helper opakowuje Stop i zwalnia fake-input. **Nie jest to fizyczny E2E, test systemowego okna zgody ani odsłuch.** Pomiary chmurowego Chromium z równoległym QA nie są benchmarkiem telefonu.

### Dowody i historia prób etapu 3

Wszystkie poniższe pliki w ignorowanym `test-results/` mają sourceSha `6532e640...` i raporty passed true/sourceDirty false:

| Dowód | SHA-256 |
|---|---|
| auth-results.json (w tym SHA/rozmiary wszystkich 70 plików payloadu) | 3f248df5775112571eb3d2b41596c130c1de85716e62f249ef5b91554e140387 |
| auth-prefix-browser-results.json | 6040757343e74bf11b0953a17bc083c12fad68c37079cc31167cb9cbf501b608 |
| auth-root-browser-results.json | 11ceb9403d73a01f54ee55951b3adbee201d19aa796bd2ee175b855d80dc092d |
| csp-results.json | d45b70d1854ed9eec9930117911503da59f3d31f21bd8859c556215af913de45 |
| preview-results.json | 2c6d8244d17d3c87ac2e2e50e91ea07d7f2cce89a7c5b72e3e2671a9a079ef6b |
| stage3-validation.log | 7adf433ed2109e8ccaef6b424d42b43b0012e0543a648952c1de55e251120fd7 |

Payload obu wariantów identyczny: **70 plików / 529 488 950 B**, wraz z 34 artefaktami modeli; niezmienność bajtów sprawdzona przed i po obu seriach. Archiwum, jego hash, manifest oraz wynik wyodrębnienia będą odnotowane po pakowaniu; nie są dowodem przesłania na hosting ani dostępnego załącznika.

Wcześniejsze próby nie były PASS pełnej serii: 8239ea80 zatrzymało się na zbyt mocnej asercji nieistnienia cache (UI legalnie otwiera pusty cache); 584c74c9/93186fd8 na przedwczesnym odczycie stanu aktualizacji. Odczyt kodu Playwright 1.62 wykazał, że waitForFunction traktuje zwrócony Promise jako truthy, zanim pozna jego boolean; zastąpiono to ograniczonym pollingiem rzeczywiście rozwiązanej wartości CacheStorage i oczekiwaniem controllerchange. Pełny MT/audio wykonano dopiero po przejściu tych bramek w 6532e640. Logi wcześniejszych prób pozostają lokalne; nie ukrywają nieudanego audio ani automatycznych retry.

Instrukcja dostępu katalogowego FTPS, preflight i rollback bez Clear-Site-Data/WP: **PRIVATE_TESTING.md**. Fizyczna akceptacja: **MOBILE_ACCEPTANCE.md**. Brak ograniczonego dostępu zatrzymuje upload, nie kod/testy/pakiet. Nie ma podstaw do twierdzenia, że katalog jest osobnym originem.

---

## Historia — etap 2

**Testowany commit kodu i zależności: `23c1a7af34c28f996213c62ddccdf978717e730e`.** `sourceDirty: false` w trzech raportach przeglądarkowych. Kontrole CSP: **23.10.2026, 12:51:38–12:51:42 UTC**; pełna seria Chromium przez proxy: **12:52:29–12:53:42 UTC**, poprzedzona buildem/logiką i kontrolami uruchamiania. Późniejszy commit raportu zmienia wyłącznie ten plik; testowanym SHA pozostaje powyższy commit.

Na początku etapu GitHub potwierdził head PR #1 `e80f07afd9c215b04bb222ed698c2dca9a25e946`, Draft/open. Porównanie `24820238b8da7c26f2bd297d1024404f4204eec8..e80f07afd9c215b04bb222ed698c2dca9a25e946` obejmowało **wyłącznie `apps/web-translator/TEST_REPORT.md`**. Sprawdzono historyczne logi i asercje trzech prób, bez ich ponawiania przed zmianą zależności. Po aktualizacji sharp wykonano poniższą pełną regresję na czystym SHA.

### Zmiana i osiągalność sharp

`@huggingface/transformers@3.8.1 → sharp@0.34.5` dawał **2 pakiety high, ale 3 odrębne advisory**: [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj), [GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c), [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w). Zakresy to odpowiednio `<0.35.0`, `<0.35.4`, `<0.35.5`. Transformers dziedziczył zgłoszenie przez sharp; nie był drugim niezależnym dekoderem.

Wąski override do **sharp 0.35.5** obejmuje wyłącznie dokładnego rodzica Transformers 3.8.1 ([package.json](package.json)). **Jest poza deklarowanym zakresem upstream `^0.34.1`**: jawny wyjątek sprawdzony testami, nie gwarancja kompatybilności upstream ani zwykła aktualizacja semver. Sprawdzono oficjalne advisory/release notes, wymagania Node i używane API. Nie migrowano Transformers do v4, nie usunięto locka i nie użyto `audit fix --force`. Szczegóły i ograniczenia: [SECURITY_REVIEW.md](SECURITY_REVIEW.md).

Zimny import Node Transformers rzeczywiście ładuje natywny sharp, także w istniejącym teście tokenizera; nie należy pisać, że sharp nigdy nie jest ładowany. Przygotowanie modeli jest w Pythonie, kopiowanie zasobów nie dekoduje obrazów, a Vite rozwiązuje export przeglądarkowy. Aplikacja WWW nie przyjmuje obrazów i nie zawiera natywnych dekoderów sharp/libvips. Po zmianie wszystkie pliki JS/CSS/WASM/VAD i HTML były **bajtowo identyczne** z bazą etapu 2; z 15 plików innych niż wagi zmieniły się jedynie `notices.txt` i hash cache w `sw.js`. Osobno potwierdzono SHA wag. Nowy test sprawdza rzeczywisty Node `RawImage` (dekodowanie własnego RGB/RGBA PNG i resize), bez nieufnych obrazów.

### Bieżące bramki automatyczne

| Bramka | Wynik dla `23c1a7a` |
|---|---|
| `npm test` | **17/17 PASS**, w tym nowy test zgodności sharp/RawImage i istniejące znaczące testy zatrzymanego HTTP, ponowienia, SHA i Stop |
| `npm run build` | **PASS**, TypeScript + Vite 8.3.5 |
| `python3 scripts/verify-models.py --directory dist` | **PASS**: 34 artefakty / 514 438 880 B, długości i SHA-256 zgodne z lockiem |
| `npm run test:csp` | **PASS**: dev ma style i świeży nonce na żądanie; dev/preview blokują obce inline JS/CSS; brak produkcyjnego `unsafe-inline`/`unsafe-eval` i nonce dev |
| `FULL_PREVIEW_TEST=1 npm run test:preview` | **PASS**, prefiksy proxy z/bez `/`, odzyskanie po awariach/timeoutach startu, HTTP/SHA wszystkich modeli, rzeczywisty MT przy zablokowanym mikrofonie iframe |
| Rzeczywisty MT PL–NL–EN | **18/18 technicznych PASS**: 6 kierunków online + 6 powtórzeń z cache + 6 po przeładowaniu offline. To nie jest ocena językowa całych tłumaczeń. |
| Kontrolowany WAV → VAD → Whisper → MT | **3/3 kolejne PASS**, pełne zdanie EN→NL, bez ponawiania porażek i bez atrap ASR/MT |
| Stop / odmowa mikrofonu / historia | **PASS** w zakresie automatyzacji; Stop w mowie nie dopisuje późnych wierszy, natywne fake-track kończą się, odmowa jest czytelna, historia usuwalna |
| Brak głosu lokalnego | **PASS fallbacku**: czytelne „Brak lokalnego głosu: Niderlandzki”, zachowane tłumaczenie i aktywne pole tekstowe; `voices: []` |
| Zewnętrzne originy / błędy strony | **0 / 0** w obserwowanym przebiegu; nie jest to audyt połączeń całego systemu operacyjnego |
| `npm audit --json` | **0 podatności**, exit 0 w bieżącym rejestrze. Nie jest to audyt całego produktu ani akceptacja ryzyk przez właściciela. |
| Fizyczny Android/iPhone, lokalny TTS i odsłuch offline | **NIEPRZETESTOWANE** |
| GitHub CI | **BRAK** kontroli/uruchomień dla poprzedniego head; nie dodawano ani nie zmieniano Actions. Lokalny PASS nie oznacza PASS CI. |

### Co test audio rzeczywiście sprawdza

| Odcinek | Rzeczywisty zakres / substytucja |
|---|---|
| Zgoda / urządzenie | Playwright nadaje uprawnienie programowo, Chromium używa `--use-fake-device-for-media-stream`. Wywołanie natywnego `getUserMedia` jest rzeczywiste, ale **nie ma fizycznego mikrofonu ani kliknięcia zgody w systemowym UI**. Osobny kontekst sprawdza odmowę. |
| Strumień zwracany aplikacji | [scripts/audio-fixture.mjs:13](scripts/audio-fixture.mjs#L13) opakowuje `getUserMedia`. Natywny sygnał fake-device przechodzi przez gain=0; aplikacja dostaje **zastępczy, rzeczywisty WebAudio MediaStreamDestination** z jednorazowym fikcyjnym WAV (linie 18–21, 35–40, 57). |
| Synchronizacja | Odtwarzanie dopiero przy `listening`, żywej/włączonej ścieżce i AudioContext `running` (linie 30–42). Brak arbitralnych 20 s ciszy, pętli lub próby odtwarzania przed gotowością VAD. |
| VAD / ASR / MT | Produkcyjny capture/AudioWorklet, Silero VAD, Whisper i Opus-MT wykonują rzeczywiste obliczenia z wagami. Nie podmieniono modeli, transkrypcji, funkcji inferencji ani tłumaczeń. |
| Asercje | [scripts/browser-test.mjs:242](scripts/browser-test.mjs#L242) wymaga **całego** znormalizowanego zdania ASR i MT oraz osobnego wywołania natywnego API dla każdej próby. Sprawdzana jest gotowość, nie samo upłynięcie czasu. |
| Stop | Helper opakowuje `track.stop()` i sam zwalnia fake-input/AudioContext (linie 45–54); asercje sprawdzają zakończenie ścieżek i brak nowych wyników. To integracja aplikacji z glue testowym, **nie dowód zwolnienia fizycznego sterownika telefonu**. |

Wyniki trzech kolejnych prób po zmianie zależności:

| Próba | Start → gotowość | WAV → wynik | Łącznie | ASR / MT wg UI |
|---|---:|---:|---:|---|
| 1 | 2,406 s | 6,887 s | 9,296 s | 2,5 / 1,1 s |
| 2 | 1,825 s | 6,299 s | 8,127 s | 2,2 / 0,8 s |
| 3 | 1,462 s | 6,084 s | 7,549 s | 2,0 / 0,8 s |

Każda próba: **ASR `The blue bicycle is next to the house.` → MT `De blauwe fiets ligt naast het huis.`**; `phaseAtPlay: listening`, `trackEnabled: true`, `contextState: running`, nativeCalls 1/2/3. WAV trwa 4,615 s; czasy obejmują wypowiedź i decyzję VAD, nie są benchmarkiem telefonu. Wynik `stoi → ligt` pozostaje znanym **błędem semantycznym**, mimo technicznego PASS. Nie obniżono kryteriów rozpoznania całej wypowiedzi.

### Dowody, odtworzenie i otwarte bramki

Surowe wyniki są lokalne i ignorowane przez Git, bez wag/nagrań w commicie. Raporty zawierają SHA i `passed: true`; zestawienie skrótów pozwala rozpoznać ten konkretny przebieg, ale nie zastępuje jego powtórzenia:

| Plik w `test-results/` | SHA-256 |
|---|---|
| `stage2-validation.log` | `a74d79107446b14eeeb1c7df4f34f4304ca453f5b3ff968bead548a93250a7ac` |
| `browser-results.json` | `10dee16a35b94f38caf69c4425e530bc6d297a5619c2770de506428833831272` |
| `preview-results.json` | `90e3ad22fd40629818a0fffe5e410e2cb226375b8e2b77d51c6e0f46ebc08b8c` |
| `csp-results.json` | `68f7424b709aee33d7200b36d4f74366f4c24917d1b899508f275a3e6b996a17` |
| `stage2-npm-audit.json` | `ccdfb4e40159698212cd681272a8b801322820f2f312e426c04eb16c3ac94c8a` |

Odtworzenie z istniejącymi zależnościami/modelami: `npm test`, `npm run build`, `python3 scripts/verify-models.py --directory dist`; uruchomić lokalny preview na 5180, następnie `npm run test:csp` i `FULL_PREVIEW_TEST=1 npm run test:preview`. Polecenia instalacji/pozyskania wag są w README. Nie pobierano nowych modeli ani narzędzi w etapie 2; zaktualizowano istniejącą zależność sharp i jej lock.

[MOBILE_ACCEPTANCE.md](MOBILE_ACCEPTANCE.md) oddziela automatyzację od fizycznych prób: tekst 6 kierunków, ASR PL/NL/EN, rzeczywisty lokalny TTS każdego języka z odsłuchem offline, fallback bez głosu, 514 MB pobrania i dodatkowe miejsce, RAM/opóźnienia, przerwania/Stop/PWA/cache/historia/prywatność. Negacje, liczby, jednostki i ich zachowanie ocenia człowiek dwujęzyczny; utrata/zmiana daje FAIL próbki. **Odsłuch, pomiary telefonów i ocena językowa pozostają NIEPRZETESTOWANE.** Do ich wykonania potrzebny jest zatwierdzony istniejący prywatny HTTPS i dostępni testerzy/urządzenia; zebrano wymagania, nie uruchomiono HTTPS, tunelu ani nowej usługi. Brak CI pozostaje otwarty. UK/RU/ES, architektura i modele bez zmian; brak wdrożenia/merge lub zmian main/uprawnień/Issues.

---

## Historia — etap 1 (wyniki dla 24820238)

**Testowany commit kodu: `24820238b8da7c26f2bd297d1024404f4204eec8`.** Raporty przeglądarkowe zawierają `sourceSha` z tą wartością i `sourceDirty: false`. Bieżący pełny przebieg Chromium: **23.10.2026, 12:05:13–12:06:22 UTC**; poprzedzały go build/logika i kontrola CSP (12:04 UTC). Późniejszy commit tego raportu zmienia wyłącznie dokumentację wyników; nie należy mylić jego SHA z SHA testowanego kodu.

| Bramka | Aktualny wynik |
|---|---|
| `npm test` | **16/16 PASS**; w tym 2 nowe testy pobierania z rzeczywistym lokalnym HTTP |
| `npm run build` | **PASS**, TypeScript + Vite **8.3.5** |
| `python3 scripts/verify-models.py --directory dist` | **PASS**, 34 artefakty / 514 438 880 B, długości/SHA-256 i manifest zgodne z lockiem |
| `npm run test:csp` | **PASS**, style dev i preview; świeży nonce dev na każde żądanie, blokowanie niezaufanego inline JS/CSS w obu trybach, bez produkcyjnego `unsafe-inline`/`unsafe-eval` i bez nonce dev w buildzie |
| `FULL_PREVIEW_TEST=1 npm run test:preview` | **PASS**, prefiksy proxy, błędy/timeouty startu i ponowienie, ramka blokująca mikrofon z działającym MT, HTTP/SHA-256 34 modeli oraz pełna seria poniżej |
| Rzeczywisty MT | **18/18 PASS**: wszystkie 6 kierunków online, ponownie z cache bez pobrania wag i wszystkie 6 po przeładowaniu offline |
| VAD → Whisper → MT | **3/3 kolejne PASS** po synchronizacji, pełna asercja zdania, bez automatycznych ponowień nieudanych prób |
| Stop i uprawnienia | **PASS**: Stop podczas mowy bez późnych wierszy, zwolnienie natywnych ścieżek, odmowa mikrofonu z czytelnym błędem; testy logiki obejmują też spóźnione ASR i brak wznowienia po Stop |
| Prywatność w przebiegu | 0 zewnętrznych originów, 0 nieobsłużonych błędów strony, historia usuwalna; bez danych pacjentów |
| Lokalny TTS / fizyczne urządzenia | **NIEPRZETESTOWANE** — `voices: []`, brak rzeczywistego odsłuchu oraz fizycznego Androida/iPhone’a |
| `npm audit` | **NIEZALICZONY jako clean**: po poprawce Vite pozostały 2 pakiety high w łańcuchu Transformers.js → sharp; ocena w [SECURITY_REVIEW.md](SECURITY_REVIEW.md) |

### Trzy kolejne próby audio — osobne czasy i wyniki

| Próba | Start → gotowość | Start WAV → wynik MT | Łącznie | Pełny tekst ASR | Pełne tłumaczenie |
|---|---:|---:|---:|---|---|
| 1 | 2,022 s | 6,259 s | 8,284 s | The blue bicycle is next to the house. | De blauwe fiets ligt naast het huis. |
| 2 | 1,433 s | 6,143 s | 7,580 s | The blue bicycle is next to the house. | De blauwe fiets ligt naast het huis. |
| 3 | 1,488 s | 5,974 s | 7,463 s | The blue bicycle is next to the house. | De blauwe fiets ligt naast het huis. |

ASR/MT raportowane przez aplikację odpowiednio: 2,0/0,9 s, 1,9/0,9 s i 1,9/0,7 s (wartości zaokrąglone). Czasy od WAV obejmują także wypowiedź i decyzję VAD; nie są czasem samego modelu ani benchmarkiem telefonu.

Chromiumowy plik fake-device wcześniej biegł od otwarcia `getUserMedia`, również gdy aplikacja wyciszała ścieżkę podczas inicjalizacji. Audyt bazy `488a23ea2f2522182ec04335679f942824742317` zakończył pełną serię FAIL z transkrypcją `to the house.`. Preroll 20 s pomógł w diagnozie, ale **nie jest używany w nowym teście**.

Nowy [scripts/audio-fixture.mjs](scripts/audio-fixture.mjs) wywołuje natywne `getUserMedia` z uprawnieniem nadanym programowo przez Playwright i urządzeniem fake-device, wycisza natywny fake-input i podaje fikcyjny WAV przez rzeczywisty strumień WebAudio. Źródło jest jednorazowe i nie rusza przed `listening`, włączoną żywą ścieżką i działającym AudioContext. Stan `listening` w aplikacji następuje po oczekiwaniu na `capture.start()`/VAD. Wszystkie 3 raporty potwierdzają `phaseAtPlay: listening`, `trackEnabled: true`, `contextState: running` i osobne wywołania natywnego API 1/2/3. ASR i MT nie są przechwytywane ani zastępowane. Asercja porównuje całe zdanie po normalizacji wielkości liter/interpunkcji, zamiast samego słowa bicycle/fiets.

To kontrolowany test integracyjny MediaStream/VAD/ASR/MT z wywołaniem natywnego API; **nie test fizycznego mikrofonu, systemowego okna zgody ani akustyki telefonu**. UI przypomina, by zaczekać na „Słucham”. Wynik holenderski pozostaje znanym przypadkiem do ludzkiej oceny semantyki, nie zatwierdzonym tłumaczeniem medycznym.

### Timeout, poprawki i granice weryfikacji

- Pobranie ma **30 s bezczynności** przy oczekiwaniu na nagłówki/porcje, odnawiane przez postęp; nie limituje całkowitego czasu transferu. Abort przerywa odczyt, a cache otrzymuje wyłącznie cały plik po SHA-256.
- Test rzeczywistego HTTP zatrzymuje odpowiedź po 4 bajtach: skrócony testowy limit 100 ms anuluje połączenie, cache pozostaje pusty, ponowienie pobiera całość i przechodzi SHA. Drugi test potwierdza transfer dłuższy od limitu dzięki postępowi, anulowanie przez użytkownika i odrzucenie błędnej sumy. Nie jest to 30-sekundowy test wymuszonej awarii UI na telefonie — ten scenariusz pozostaje w planie fizycznym.
- Dev CSS korzysta z nonce stylów osobnego dla każdej odpowiedzi HTML; build/preview pozostaje restrykcyjny. Vite 8.1.5 → 8.3.5 usuwa jego zgłoszenia npm. Nie migrowano Transformers do v4 ani nie wymuszano niezgodnego sharp.
- Modele, języki i architektura produkcyjnego toru inferencji pozostają bez rozszerzeń. UK/RU/ES są osobnym etapem.
- Plan akceptacji fizycznej: [MOBILE_ACCEPTANCE.md](MOBILE_ACCEPTANCE.md), wraz z testowym HTTPS poza domenami produkcyjnymi. Nie utworzono endpointu, płatnego środowiska ani wdrożenia. Odsłuch TTS, ASR PL/NL, RAM i semantyka wymagają dalszych dowodów.

Surowe bieżące wyniki są ignorowane przez Git: `test-results/stage1-validation.log`, `browser-results.json`, `preview-results.json`, `csp-results.json`, `stage1-npm-audit.json`. Odtwarzalne polecenia są w README; przed uznaniem nowego przebiegu należy sprawdzić SHA, `sourceDirty` i `passed`. Poniższa część dokumentu jest **historią wcześniejszego stanu**, a nie dodatkowym aktualnym przebiegiem.

## Historia — baza `488a23ea2f2522182ec04335679f942824742317`

Gałąź: `feature/voice-translator-mvp`. Testy w chmurowym środowisku Codex, Linux, Node 24, systemowy Chromium 154, CPU/WASM. Nie wykonywano wdrożenia ani testów fizycznych telefonów.

## Wynik funkcjonalny

Wszystkie sześć kierunków wykonało rzeczywiste obliczenia ONNX w przeglądarce. Nie zastępowano silnika atrapą. PL↔NL wykorzystuje angielski jako język pośredni.

| Kierunek | Fikcyjne zdanie wejściowe | Rzeczywisty wynik |
|---|---|---|
| EN→NL | The blue bicycle is next to the house. | De blauwe fiets ligt naast het huis. |
| NL→EN | De blauwe fiets staat naast het huis. | The blue bike is next to the house. |
| PL→EN | Niebieski rower stoi obok domu. | The blue bike is right next to the house. |
| EN→PL | The blue bicycle is next to the house. | Niebieski rower jest obok domu. |
| PL→NL | Niebieski rower stoi obok domu. | De blauwe fiets ligt naast het huis. |
| NL→PL | De blauwe fiets staat naast het huis. | Niebieski rower jest obok domu. |

Widać różnicę znaczeniową `stoi` → `ligt` (leży) w holenderskim wyniku. Testy potwierdzają działanie silnika i zachowanie głównego obiektu zdania, nie pełną poprawność semantyczną. Nie jest to walidacja medyczna.

## Sprawdzone

- `npm run build`: TypeScript i budowanie Vite zakończone sukcesem.
- `npm test`: **14 testów zaliczonych**, bez pominięć; planowanie sześciu kierunków, wybór wyłącznie potrzebnych modeli, odrzucanie niedostępnych modeli i niedozwolonego manifestu, dokładny SHA-256/długość, odmowa mikrofonu, brak wyboru głosu chmurowego, anulowanie sesji i spóźnionych wyników, blokowanie nakładania się wypowiedzi, pauza mikrofonu przez ASR→MT→TTS oraz zgodność tokenizera EN→PL z SentencePiece.
- `npm run test:browser`: wszystkie kontrole zakończone sukcesem, rzeczywiste modele, mobilny viewport 390×844 bez przewijania poziomego.
- Wejście mikrofonowe Chromium zasilał lokalny fikcyjny WAV, wygenerowany przez ffmpeg/flite. Rzeczywiste `getUserMedia`, Silero VAD i Whisper rozpoznały: `The blue bicycle is next to the house.`; rzeczywisty MT zwrócił `De blauwe fiets ligt naast het huis.`
- Ponowne tłumaczenie nie pobierało wag ONNX po raz drugi.
- Po przełączeniu kontekstu przeglądarki w tryb offline aplikacja załadowała się ponownie i wykonała rzeczywiste PL→EN→NL z zapisanych plików.
- Odmowa dostępu do mikrofonu w osobnym kontekście dawała widoczny, możliwy do ponowienia błąd.
- Stop uniemożliwiał dopisywanie wyników po zakończeniu; historia była usuwalna.
- **0 żądań do zewnętrznych originów**, **0 nieobsłużonych błędów strony** w przebiegu przeglądarkowym.
- Ponowne `npm run models` sprawdziło istniejące artefakty i zakończyło się sukcesem.

## Rozmiary i pomiary

- Modele: **514 438 880 B** (514,44 MB dziesiętnie).
- Statyczna aplikacja bez modeli, z runtime WASM, Silero i notices: **14 668 700 B** (14,67 MB) po naprawie uruchamiania.
- Cały `dist/`: **529 107 580 B** (529,11 MB), przed kompresją HTTP/ZIP.
- Pakiet JavaScript głównego UI: około 19,85 kB; worker inferencji około 541,91 kB; moduł przechwytywania około 68,80 kB. Pozostały rozmiar to przede wszystkim runtime i modele.
- Czasy od kliknięcia do wyniku tekstowego w jednym przebiegu: EN→NL 15,94 s przy pierwszym przygotowaniu; NL→EN 3,00 s; PL→EN 16,42 s przy przygotowaniu nowej pary; EN→PL 2,61 s; PL→NL 4,65 s; NL→PL 5,87 s. Ponowne EN→NL 2,76 s; offline PL→NL 4,79 s.

To czasy ścienne w tym środowisku, obejmujące przygotowanie, cache i inicjalizację, gdy były potrzebne. Nie są benchmarkiem samej generacji, testem obciążeniowym ani obietnicą wydajności telefonu. Maksymalnego RAM i zużycia baterii na telefonach nie zmierzono.

## Ograniczenia potwierdzenia

- Headless Chromium nie udostępnił żadnego systemowego głosu. TTS jest zaimplementowany jako lokalny SpeechSynthesis z komunikatem przy braku głosu; **rzeczywistego odsłuchu TTS nie potwierdzono**. Testy logiki potwierdzają brak doboru głosu chmurowego i kolejność blokowania mikrofonu.
- Pełny tor mikrofonowy sprawdzono dla EN→NL. Sześć kierunków MT sprawdzono osobno na tekście. Mikrofonowego ASR PL/NL oraz sześciu kombinacji głosowych nie należy przedstawiać jako przetestowanych.
- Brak fizycznych testów Chrome Android, Safari iOS, Bluetooth, połączeń telefonicznych, przegrzewania oraz długich sesji.
- Nie potwierdzono konfiguracji nagłówków ani limitów dhosting.pl i nie wysłano plików na `ai.lekarz.nl`.
- Audyt żądań strony nie mierzy niezależnych połączeń systemu operacyjnego ani pobierania głosów w ustawieniach systemowych.

## Odtworzenie i surowe wyniki

Zobacz polecenia w [README.md](README.md). Skrypt testowy zapisuje wyniki bieżącego przebiegu w ignorowanym `test-results/browser-results.json`, zrzut mobilny w `test-results/mobile.png` i fikcyjny WAV w `test-results/fictional-english.wav`. Po uruchomieniu należy sprawdzić `passed: true`; starszy plik wyników sam w sobie nie dowodzi sukcesu nowego uruchomienia.

Podczas pracy wykryto i usunięto brak właściwego runtime CPU, błąd cache offline dla `Vary: Origin` oraz problemy typowania. Opisany wyżej pozytywny wynik dotyczy przebiegu po tych poprawkach.

## Diagnostyka nieaktywnych przycisków i brakujących stylów

Sprawdzono działający proces Node PID 16112 (`vite preview --host 0.0.0.0 --port 5180 --strictPort`), odpowiedzi lokalnego serwera, jego log `/tmp/web-translator-preview.log`, konsolę i odpowiedzi sieciowe rzeczywistego systemowego Chromium. Port 5180 zwracał HTML, JS i CSS z poprawnymi typami; brak błędu serwera w logu. Bezpośrednio pod `http://127.0.0.1:5180/` aplikacja osiągała „Gotowe, kiedy Ty jesteś.” i aktywowała przycisk rozmowy. Nie odtworzono zawieszenia na katalogu modeli pod tym adresem.

**Potwierdzony błąd przed poprawką:** serwowanie przez proxy pod ścieżką `/site/5180` bez końcowego ukośnika powodowało rozwiązywanie względnych adresów `./assets/...` jako `/site/assets/...`. Chromium otrzymywał 404 dla JS, CSS i ikony. Font zmieniał się na Times New Roman, pozostawał statyczny napis „Sprawdzam dostępne pakiety…”, oba przyciski były nieaktywne. To odtworzyło komplet zgłoszonych objawów. Ten sam proxy i adres `/site/5180/` działały. Kod `base: './'` w [vite.config.ts](vite.config.ts) oraz brak normalizacji przed względnymi zasobami w [index.html](index.html) wyjaśniały różnicę. Dodatkowo dawny `new URL(BASE_URL, location.href)` w [src/main.ts](src/main.ts) analogicznie źle wybierał katalog manifestu/modeli.

**Granica ustalenia:** narzędzia tej sesji nie umożliwiają podłączenia do zintegrowanego panelu Codex, odczytania jego adresu, konsoli ani polityki ramki. Użytkownik nie ma osobnego URL. Wykazano rzeczywisty błąd aplikacji i jego zgodność z objawami przez lokalne Chromium oraz rzeczywiste HTTP proxy; nie udowodniono, że panel użytkownika używa dokładnie takiego prefiksu lub blokuje mikrofon. Nie przedstawiamy testu proxy jako obserwacji samego panelu.

Naprawy w obrębie tego prototypu:

- [scripts/startup.js](scripts/startup.js): normalizacja katalogu przed względnymi zasobami, zachowanie query/hash, osobny komunikat błędu zasobów/uruchomienia i ponowne ładowanie. Ukośnik zapewnia też wejście strony w zakres service workera.
- [vite.config.ts](vite.config.ts): osadzenie skryptu przed zasobami i dopuszczenie wyłącznie jego SHA-256 w obu politykach CSP. Nie dodano `unsafe-inline` ani obcych originów.
- [src/main.ts](src/main.ts): katalog wyznaczany z `document.baseURI`, jawny scope service workera, limit 15 sekund na katalog modeli, zachowanie komunikatu przy braku CSS/JS oraz rozróżnienie blokady mikrofonu od trybu tekstowego.
- [index.html](index.html): widoczny przycisk odzyskania działania i osobny komunikat o blokadzie mikrofonu.

Wyniki po poprawce:

- `npm run build` i 14 testów Node: sukces.
- Rzeczywiste Chromium przez prefiks `/site/5180`, `/site/5180/` oraz `/site/5180/index.html`: poprawny CSS, gotowość JS, aktywne przyciski, działający service worker, zachowane query/hash, brak błędów strony i odpowiedzi HTTP ≥400. Test obejmuje także nagłówek CSP z wygenerowanego `.htaccess`.
- Kontrolowane awarie ładowania JS, CSS, niepoprawny katalog modeli i brak odpowiedzi katalogu: widoczny błąd oraz przycisk ponowienia. Brak odpowiedzi katalogu kończy się po około 15 sekundach; nie wymaga pobierania wag. Zawieszone pobieranie modułu JS kończy oczekiwanie po około 20 sekundach, a przycisk ponowienia działa również przed `DOMContentLoaded`. Ponowienie po usunięciu awarii odzyskuje gotowość.
- Ramka z rzeczywistym nagłówkiem `Permissions-Policy: microphone=()`: przycisk mikrofonu nieaktywny z wyjaśnieniem; wpisany tekst EN→NL nadal uruchamia prawdziwy Opus-MT i zwraca `De blauwe fiets ligt naast het huis.`.
- Wszystkie **34 pliki modeli / 514 438 880 B** pobrane przez prefiks proxy, nie tylko sprawdzone na dysku: HTTP 200 oraz zgodne długości i SHA-256 z `models.lock.json`. Nie ma brakującego kierunku PL–NL–EN.
- `FULL_PREVIEW_TEST=1 npm run test:preview`: pełna istniejąca seria również przeszła przez adres proxy bez końcowego ukośnika. Sześć rzeczywistych kierunków MT, powtórzenie bez pobrania wag, tor `getUserMedia → Silero → Whisper → Opus-MT`, Stop, offline z ponownym załadowaniem i PL→NL, usunięcie historii oraz odmowa mikrofonu: sukces. Brak nieobsłużonych błędów strony i połączeń poza origin.

Mikrofon testowano **osobno, po tekście**, przez prawdziwe API Chromium z fikcyjnym WAV jako kontrolowanym źródłem wejścia. Nie jest to odsłuch fizycznego mikrofonu użytkownika ani dowód uprawnień ramki Codex. Metoda bezpiecznego testu urządzenia przez samodzielną stronę HTTPS jest opisana w [README.md](README.md). Nadal nie potwierdzono odsłuchu TTS z powodu braku lokalnych głosów systemowych.

Dowody automatyczne są w ignorowanych plikach `test-results/preview-full-results.json` (przebieg z pełnym testem przez proxy), `test-results/preview-results.json` (ostatnie kontrole podglądu), `test-results/browser-results.json` (ostatni pełny przebieg silników) i `test-results/mobile.png`. Pliki podają `passed`; opisy powyżej nie oznaczają wdrożenia. Na etapie naprawy nie zmieniano głównego projektu Sokuji, nie wykonywano commitów, merge ani publikacji na dhosting.pl.

## Przygotowanie do przeglądu przez GitHub

Po naprawie ponownie wykonano `npm test` (14/14) i `npm run build` — sukces. Źródła silnika i poprawki uruchomienia nie zmieniły się od pełnego przebiegu przeglądarkowego opisanego powyżej. Dodano instrukcje współpracy i niezależny weryfikator [scripts/verify-models.py](scripts/verify-models.py): potwierdził 34 artefakty / 514 438 880 B w `public/` i `dist/`, a kontrole negatywne odrzuciły brak manifestu, rozbieżny manifest, brak modelu, błędny rozmiar i błędny SHA-256. Weryfikator nie pobiera plików i nie zmienia locka.

Kontrola kandydatów do commitu obejmowała listę i rozmiary plików, sygnatury kluczy prywatnych, typowych tokenów GitHub/HF/OpenAI/Slack/AWS, przypisania haseł oraz adresy URL z poświadczeniami. Nie znaleziono takich danych ani prywatnych danych rozmówców; wejścia testów są fikcyjne. Publiczne atrybucje autorów w licencjach zachowano. Jest to kontrola wzorców i przegląd plików, nie gwarancja wykrycia każdego możliwego sekretu.

Wagi, runtime, zasoby VAD, ZIP, nagrania, wyniki testów, środowisko Pythona i pliki tymczasowe są ignorowane. Z listy plików Git wyłączono także generowane `public/models-manifest.json` i `public/notices.txt`; odtwarzają je udokumentowane skrypty. Źródłowe licencje i karty modeli pozostają w repozytorium. Publikacja gałęzi i roboczego PR jest osobnym, zatwierdzonym przez użytkownika krokiem; nie oznacza merge, wdrożenia ani konfiguracji konektora ChatGPT Work.
