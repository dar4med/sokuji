# Wyniki prototypu — 23 października 2026

## Aktualne wyniki — etap 1

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

Nowy [scripts/audio-fixture.mjs](scripts/audio-fixture.mjs) wywołuje natywne `getUserMedia` dla zgody/natywnego przechwytywania, wycisza natywny fake-input i podaje fikcyjny WAV przez rzeczywisty strumień WebAudio. Źródło jest jednorazowe i nie rusza przed `listening`, włączoną żywą ścieżką i działającym AudioContext. Stan `listening` w aplikacji następuje po oczekiwaniu na `capture.start()`/VAD. Wszystkie 3 raporty potwierdzają `phaseAtPlay: listening`, `trackEnabled: true`, `contextState: running` i osobne wywołania natywnego API 1/2/3. ASR i MT nie są przechwytywane ani zastępowane. Asercja porównuje całe zdanie po normalizacji wielkości liter/interpunkcji, zamiast samego słowa bicycle/fiets.

To kontrolowany test integracyjny MediaStream/VAD/ASR/MT z rzeczywistym sprawdzeniem zgody przez API; **nie test fizycznego mikrofonu ani akustyki telefonu**. UI przypomina, by zaczekać na „Słucham”. Wynik holenderski pozostaje znanym przypadkiem do ludzkiej oceny semantyki, nie zatwierdzonym tłumaczeniem medycznym.

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
