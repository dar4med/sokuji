# Rozmowa — prototyp PL / NL / EN

Niezależna aplikacja WWW dla Stichting Med Partners. Kod tego katalogu nie importuje kodu Sokuji, nie korzysta z jego kont, analityki, Electron ani usług Bing, Edge TTS i Kizuna. Licencja własnego kodu: [MIT](LICENSE). Licencja otaczającego repozytorium Sokuji pozostaje bez zmian.

## Co robi prototyp

- Sześć kierunków: PL→EN, EN→PL, NL→EN, EN→NL oraz PL↔NL przez EN.
- Przetwarzanie na CPU / WASM, bez wymogu WebGPU, w workerze.
- Mikrofon → Silero VAD → Whisper Tiny → Opus-MT → tekst i systemowy odczyt lokalny.
- Rozmowa naprzemienna, z **ręcznym wyborem języka aktualnego rozmówcy**. Nie ma automatycznej identyfikacji osoby ani jednoczesnego tłumaczenia dwóch głosów.
- Mikrofon jest wstrzymany podczas ASR, MT i TTS oraz przez 450 ms po odczycie. Nie ma kolejki nagrań rosnącej w tle.
- Krótkie wypowiedzi, do 20 sekund; dłuższa wypowiedź zostaje odrzucona z komunikatem.
- Wpisywanie tekstu bez mikrofonu, ponowny odczyt po zakończeniu rozmowy i usuwanie historii.
- Pobieranie tylko modeli dla wybranej pary, weryfikacja długości i SHA-256, CacheStorage oraz service worker do pracy offline.

Nie są to wyniki certyfikacji jakości tłumaczeń. Użyto wyłącznie fikcyjnych zdań testowych. To prototyp, nie narzędzie zastępujące tłumacza w sprawach medycznych lub prawnych.

## Uruchomienie w Codex

Pracuj w istniejącym checkoutcie, na `feature/voice-translator-mvp`. Nie twórz dodatkowego worktree bez wyraźnej potrzeby i zgody.

W przygotowanym środowisku modele, zależności i kompilacja już są dostępne:

```bash
cd /workspace/sokuji/apps/web-translator
npm run preview
```

Serwer podglądu używa portu **5180**. Jeśli jest już uruchomiony, użyj istniejącego procesu. Dostępność panelu podglądu zależy od interfejsu Codex; adres pętli zwrotnej nie jest publicznym adresem demonstracji.

Podgląd kompilacji obsługuje również prefiks ścieżki proxy. Adres katalogu bez końcowego `/` jest normalizowany przed ładowaniem zasobów, z zachowaniem parametrów i fragmentu. Błąd JS/CSS lub brak postępu uruchomienia daje komunikat i przycisk ponownego załadowania; katalog modeli ma limit 15 sekund, a niezależny skrypt startowy limit 20 sekund. Skrypt startowy ma indywidualny hash CSP, generowany równocześnie w HTML i **`dist/.htaccess`**. Nie zastępuj wygenerowanego `.htaccess` kopią ze źródeł.

Jeśli ramka blokuje mikrofon przez Permissions-Policy, aplikacja wyświetla przyczynę i pozostawia dostępne tłumaczenie tekstu. Zgoda użytkownika nie znosi blokady narzuconej przez ramkę. Bezpieczny test fizycznego mikrofonu: otworzyć ten sam podgląd jako samodzielną stronę **HTTPS z ważnym, zaufanym certyfikatem**, poza iframe, i udzielić zgody tylko temu originowi. Jeżeli interfejs Codex udostępnia otwieranie podglądu w osobnej przeglądarce, użyć jego adresu HTTPS; `http://localhost:5180` na telefonie oznacza telefon, nie chmurowe środowisko Codex. Jeśli takiego adresu brak, test urządzenia wymaga osobno zatwierdzonego, prywatnego środowiska HTTPS. Nie wyłączaj zabezpieczeń przeglądarki i nie przesyłaj danych pacjentów; użyj fikcyjnych zdań. Nie utworzono takiego wdrożenia w ramach tej naprawy.

Tryb pracy nad kodem:

```bash
npm run dev
```

Nie uruchamiaj jednocześnie obu serwerów na tym samym porcie.

## Odtworzenie środowiska

Wszystkie polecenia wykonuje Codex lub CI. Właściciel projektu nie musi instalować Node ani Pythona na swoim komputerze.

Wymagane w środowisku budowania: Node 24, npm, Python 3.12; dla testów Chromium i ffmpeg z filtrem `flite`. Node/Python nie są potrzebne na hostingu docelowym.

```bash
cd /workspace/sokuji/apps/web-translator
npm ci --cache /workspace/.cache/npm --no-audit --no-fund
python3 -m venv .tools/model-tools
.tools/model-tools/bin/pip install -r scripts/model-requirements.txt
npm run models
python3 scripts/verify-models.py
npm run assets
npm run build
python3 scripts/verify-models.py --directory dist
npm test
npm run preview
```

W drugim terminalu:

```bash
cd /workspace/sokuji/apps/web-translator
npm run test:browser
npm run test:preview
npm run test:csp
# Pełny tor tekstowy i głosowy przez prefiks proxy, również bez końcowego ukośnika:
FULL_PREVIEW_TEST=1 npm run test:preview
```

`CHROMIUM_PATH` może wskazać inną instalację Chromium, a `TEST_URL` inny serwer testowy. Test domyślnie używa portu 5180 i `/usr/bin/chromium`.

`test:preview` korzysta z działającego serwera 5180 (opcjonalnie `PREVIEW_UPSTREAM`) przez rzeczywiste lokalne proxy HTTP. Sprawdza CSS, JS, CSP, service workera, błędy i timeouty uruchomienia, odzyskanie działania po błędzie, ramkę blokującą mikrofon z rzeczywistym MT oraz pobranie i SHA-256 wszystkich modeli. Nie steruje panelem Codex; wynik odtwarza warunki proxy/ramki w Chromium, co nie potwierdza konfiguracji zintegrowanego panelu.

`test:browser` sprawdza wszystkie 6 kierunków online, ponownie bez pobierania wag oraz offline. Audio ma 3 kolejne przebiegi z pełną asercją zdania: natywne `getUserMedia` sprawdza zgodę, a kontrolowany strumień WebAudio uruchamia fikcyjny WAV dopiero po gotowości VAD i włączeniu ścieżki mikrofonu. Nie jest to fizyczny mikrofon ani pomiar odsłuchu TTS; ASR/MT są rzeczywiste. Nie ma arbitralnego preroll ani zapętlonego pliku biegnącego podczas przygotowania. Raporty zawierają SHA źródeł, flagę zmian roboczych i daty. `test:csp` uruchamia tymczasowy dev i sprawdza style oraz blokowanie niezaufanego inline w dev/preview. Dev otrzymuje nonce stylów osobny dla każdego żądania HTML; build/preview nie otrzymuje tego wyjątku.

Pobieranie modeli ma limit **30 s bezczynności** na oczekiwanie na nagłówki i kolejne porcje danych, nie na łączny czas pliku. Postęp odnawia limit. Timeout anuluje transfer, zwraca komunikat i pozwala ponowić akcję; do cache trafiają wyłącznie całe pliki po SHA-256. Poprawne wcześniejsze pliki pozostają dostępne. Testy logiki obejmują rzeczywisty zatrzymany strumień lokalnego HTTP, anulowanie, ponowienie, postęp i niepoprawną sumę.

Plan fizycznej akceptacji i wymagania przyszłego testowego HTTPS: [MOBILE_ACCEPTANCE.md](MOBILE_ACCEPTANCE.md). Ocena advisory i jawnego wyjątku sharp: [SECURITY_REVIEW.md](SECURITY_REVIEW.md).

Etap 2 przypina `sharp 0.35.5` wyłącznie pod `@huggingface/transformers@3.8.1`. Wersja jest poza upstreamowym `^0.34.1`; zakres użycia Node 24 i zgodność sprawdzono, nie przyjęto jej automatycznie. Trzy advisory sharp były propagowane na dwa pakiety npm. Test RGB/RGBA i tokenizera sprawdza ścieżkę Node, pełna regresja sprawdza przeglądarkę; szczegóły i ograniczenia w SECURITY_REVIEW. Nie migrowano Transformers v4 i nie dodano modeli. Automatyczne audio podaje syntetyczny WAV przez zastępczy MediaStream WebAudio po natywnym `getUserMedia` fake-device — nie jest dowodem fizycznego E2E ani odsłuchu.

Pierwsze przygotowanie wymaga Internetu. Modele pobiera skrypt budowania, nie serwer tłumaczeń. Wymagane domeny: `huggingface.co`, a przy przekierowaniach duże pliki z `us.aws.cdn.hf.co` lub innego jawnie dopuszczonego hosta dystrybucji HF. Nie wyłączaj TLS ani weryfikacji sum.

## Modele i licencje

Dokładne rewizje, długości i SHA-256: [models.lock.json](models.lock.json). Zachowane karty modeli: [licenses/models](licenses/models). Modele nie są zapisane w Git; przygotowuje je powtarzalny skrypt.

`npm run models` pobiera pliki z przypiętych rewizji w [scripts/prepare-models.py](scripts/prepare-models.py). Pobrania weryfikuje względem metadanych LFS SHA-256 lub identyfikatora Git blob; dla EN→PL wykonuje opisaną niżej konwersję i porównuje pochodne grafy z istniejącym lockiem. Po przygotowaniu uruchom niezależne, działające **offline** `python3 scripts/verify-models.py`: sprawdza długość i SHA-256 każdego pliku oraz zgodność manifestu z zatwierdzonym `models.lock.json`. Opcja `--directory dist` sprawdza wynik kompilacji. Błąd kończy proces kodem 1. Zmian locka nie należy automatycznie akceptować; wymagają przeglądu źródła, licencji i wersji narzędzi.

Git zawiera źródła, lock npm, lock modeli, receptury przygotowania i dowody licencyjne. `.gitignore` wyklucza wagi, runtime WASM, zasoby VAD, `dist/`, ZIP, wyniki i nagrania testów, środowisko Pythona, pliki tymczasowe oraz `.env`. `public/models-manifest.json` tworzy `npm run models`, a `public/notices.txt` oraz zasoby runtime/VAD tworzy `npm run assets`; te pliki generowane nie trafiają do commitu. Notices muszą pozostać w gotowym pakiecie aplikacji. Publiczne nazwiska i adresy autorów w oryginalnych licencjach zachowano dla atrybucji; nie są to dane rozmówców.

## Współpraca przez GitHub i ChatGPT Work

Projekt do przeglądu znajduje się wyłącznie w `apps/web-translator/` na gałęzi `feature/voice-translator-mvp`. Rozpocznij od tego README i [TEST_REPORT.md](TEST_REPORT.md), następnie przeglądaj `src/`, `scripts/` oraz `tests/`. Katalog głównego projektu Sokuji ma osobne zależności i nie jest potrzebny do uruchomienia prototypu. Uruchom polecenia odtwarzania z tego katalogu, bez instalacji zależności w katalogu głównym repozytorium.

Roboczy Pull Request służy dyskusji i przeglądowi; nie jest zatwierdzeniem merge ani publikacji. Dostęp ChatGPT Work wymaga osobnego podłączenia GitHuba w ustawieniach organizacji i przyznania aplikacji dostępu do `dar4med/sokuji`. Samo wysłanie gałęzi nie konfiguruje konektora ani nie gwarantuje natychmiastowego zindeksowania jej zawartości. W rozmowie wskaż repozytorium, gałąź i PR; jeśli konektor nie udostępnia bieżących plików tej gałęzi, użyj widocznego diffu PR lub podłączonego środowiska Codex. Nie przekazuj tokenów GitHuba w wiadomościach ani plikach projektu.

| ID | Źródło | Rozmiar plików | Licencja |
|---|---|---:|---|
| asr | [Xenova/whisper-tiny](https://huggingface.co/Xenova/whisper-tiny) | 43,68 MB | konwersja Apache-2.0; baza OpenAI MIT |
| pl-en | [Xenova/opus-mt-pl-en](https://huggingface.co/Xenova/opus-mt-pl-en) | 117,62 MB | Apache-2.0, karta modelu bazowego |
| en-nl | [Xenova/opus-mt-en-nl](https://huggingface.co/Xenova/opus-mt-en-nl) | 121,63 MB | Apache-2.0, karta modelu bazowego |
| nl-en | [Xenova/opus-mt-nl-en](https://huggingface.co/Xenova/opus-mt-nl-en) | 121,63 MB | Apache-2.0, karta modelu bazowego |
| en-pl | [TigreGotico/opus-mt-en-pl-onnx](https://huggingface.co/TigreGotico/opus-mt-en-pl-onnx) | 109,88 MB po przygotowaniu | Apache-2.0 |

Łącznie modele: **514 438 880 bajtów** (514,44 MB dziesiętnie). Pakiety rozmowy z ASR: PL↔EN około 271,18 MB, NL↔EN około 286,94 MB, PL↔NL około 514,44 MB. Tryb tekstowy nie pobiera ASR. Runtime WASM i Silero są osobnymi zasobami aplikacji.

Istotne ustalenie fazy A: `Xenova/opus-mt-en-pl` i `Xenova/opus-mt-en-zlw` nie były dostępne publicznie (HF 401). Nie użyto ich jako fikcyjnych zależności. Zamiast nich zastosowano przypięty eksport `TigreGotico/opus-mt-en-pl-onnx`, którego bazą jest `Helsinki-NLP/opus-mt-en-sla`.

EN→PL: `scripts/prepare-models.py` pobiera zweryfikowane grafy FP32, przeprowadza dynamiczną kwantyzację QUInt8, także w podgrafach, i tworzy tokenizer JSON z oryginalnych `source.spm` i `vocab.json`. Zachowuje identyfikatory tokenów i dodaje prefiks `>>pol<<`. Test porównuje identyfikatory czterech zdań z oryginalnym SentencePiece. Nie jest to dowód równoważności tokenizacji dla wszystkich znaków ani pomiar jakości całego modelu.

Karty bazowych modeli OPUS użytych tutaj deklarują **Apache-2.0**, a nie ogólne CC-BY dla całej rodziny. Licencji nie wywnioskowano z samej nazwy OPUS ani z listy notices Sokuji.

Biblioteki:

- [Transformers.js](https://github.com/huggingface/transformers.js) **3.8.1**, Apache-2.0.
- [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) **1.22.0**, MIT; jawny wariant CPU/WASM.
- [vad-web](https://github.com/ricky0123/vad) **0.0.30**, ISC; model [Silero VAD](https://github.com/snakers4/silero-vad) MIT.
- Vite **8.3.5**, MIT; TypeScript **5.8.3**, Apache-2.0.
- Narzędzia konwersji: ONNX **1.18.0**, ONNX Runtime **1.22.1**, SentencePiece **0.2.1**, Apache-2.0 / MIT / Apache-2.0.

Wydanie zawiera `notices.txt`, pełne teksty głównych licencji i notices zależności. Przy nowych modelach wymagane jest ponowne sprawdzenie ich kart. Nie dodano modeli NC, NLLB, głosów Piper ani usług chmurowych.

## Prywatność i odczyt

Przeglądarka łączy się wyłącznie z własnym originem po pliki statyczne. Nie ma endpointu wysyłającego audio lub tekst, kont, trackerów ani analityki. CSP ogranicza połączenia do własnego originu i lokalnych blobów. Historia do 50 wypowiedzi pozostaje tylko w pamięci karty; „Wyczyść historię” kończy ewentualną sesję i usuwa wpisy. Nagrania są przekazywane do workera jako bufor i nie są zapisywane.

Systemowy TTS wybiera wyłącznie `SpeechSynthesisVoice.localService === true`. Przy braku odpowiedniego głosu tekst nadal działa, a komunikat wyjaśnia konieczność zainstalowania głosu lokalnego. Nie ma zastępczego połączenia z Edge, Google ani innym TTS API. Oznaczenie głosu przez system trzeba potwierdzić testem offline na docelowym telefonie; audyt ruchu przeglądarki nie obejmuje niezależnej telemetrii systemu operacyjnego.

W headless Chromium środowiska Codex lista głosów systemowych była pusta. Nie deklarujemy odsłuchu rzeczywistego TTS w tym środowisku ani testów fizycznego Androida/iPhone’a.

## Publikacja statyczna — dopiero po zatwierdzeniu

Po `npm run build` gotowe pliki są w **`dist/`**, łącznie z modelami, workerami, runtime, manifestem i service workerem. Nie kopiuj `node_modules`, `.tools`, `.model-work` ani źródeł repozytorium na hosting. Nie trzeba uruchamiać procesu Node/Python/PHP/MySQL.

Do hostingu trafia zawartość `dist/`, także ukryty `.htaccess`. Użyj osobnego katalogu dla `ai.lekarz.nl`, nie katalogu strony marketingowej. Konfiguracja Apache jest propozycją do sprawdzenia na dhosting — szczególnie uprawnienie `AllowOverride` i obsługa `mod_headers`. Jeśli hosting odrzuca `Options -Indexes`, ustaw tę opcję przez panel, zamiast pozostawiać błąd HTTP 500.

Wymagane: HTTPS, `application/wasm`, poprawne COOP/COEP, CSP, brak listowania katalogów i wystarczający transfer. Weryfikuj odpowiedzi HTTP z hostingu, nie tylko obecność `.htaccess`. Nie publikuj aplikacji przez iframe strony z trackerami.

Podstawowy manifest PWA i cache offline są zaimplementowane. Przed publicznym użyciem potrzebne są finalne ikony mobilne oraz próby instalacji i aktualizacji PWA na rzeczywistych urządzeniach.

## Ograniczenia i dalsze kroki

- Brak obietnicy działania na wszystkich telefonach. CPU/WASM jest przenośne, ale model może przekroczyć limit pamięci karty. GPU nie jest wykorzystywane w tej wersji.
- Kierunek zmienia użytkownik jednym przyciskiem; aplikacja nie rozpoznaje rozmówcy automatycznie.
- Mikrofon nie nasłuchuje podczas obliczeń i odczytu. Druga osoba powinna zaczekać na „Słucham”.
- Pierwsze uruchomienie obejmuje pobranie modeli i kompilację WASM. Kolejne wypowiedzi mogą być szybsze, ale to nie jest gwarancja czasu rzeczywistego.
- PL↔NL korzysta z dwóch tłumaczeń; błędy mogą się kumulować. Brak walidacji terminologii medycznej.
- System może usunąć cache. Offline działa dopiero po zapisaniu aplikacji oraz pakietu; nowe pary wymagają wcześniejszego pobrania.
- Otwarcie w tle, blokada ekranu i połączenia telefoniczne mogą przerwać sesję. `pagehide` kończy przechwytywanie.
- Przed testami na `ai.lekarz.nl`: testy fizycznych telefonów i lokalnych głosów, ocena jakości PL/NL, limity transferu, przegląd RODO i zatwierdzenie publikacji.

Wyniki pomiarów i dokładny zakres walidacji: [TEST_REPORT.md](TEST_REPORT.md).
