# Nakładka audio — do przeglądu i osobnego zatwierdzenia HF

Nie wykonano uploadu HF, zmian GitHub main, WP, dhosting ani usług płatnych. Brak nowego modelu w payloadzie.

## Potwierdzona diagnoza

- `src/capture.ts` przekazywał nieserializowane ramki do stanowego Silero. Dokładna funkcja Worklet `C()` z używanego capture przy wejściu co32ms i opóźnieniach150/40/50ms daje maxConcurrent3, kolejność zakończenia1/2/0. Ta sama granica z kolejką daje maxConcurrent1, kolejność0/1/2. Jest to deterministycznie odtwarzalny błąd kodu; **nie jest dowodem, że spowodował konkretne błędne słowa użytkownika**.
- Pauza mogła resetować stan, gdy wcześniejsze `processFrame` nadal czekało na model. Teraz najpierw wyciszamy capture, unieważniamy oczekujące ramki, czekamy na trwającą inferencję i dopiero resetujemy MicVAD. Zaległe ramki nie wracają po TTS/Stop. Przy kolejce64ramek (około2s wejścia) aplikacja jawnie zatrzymuje rozmowę; nie gubi ramek po cichu i nie przetwarza rosnącego opóźnienia bez ograniczeń.
- Koniec po750ms ciszy rozcina testową pauzę960ms. Zmieniono na1400ms, pre-roll300→800ms, czyli czasy zgodne z domyślnymi biblioteki VAD; progi prawdopodobieństwa pozostają bez zmian. Koszt: około650ms dodatkowego oczekiwania na koniec w porównaniu z poprzednim progiem. Test granicy korzysta z rzeczywistego FrameProcessor i kontrolowanych prawdopodobieństw, nie nagrania człowieka.
- Stary limit20s odrzucał całą wypowiedź i sam wznawiał VAD. Teraz zachowuje pierwszy ograniczony bufor20s, zatrzymuje nasłuch i przekazuje ten fragment do zwykłego ASR. Ostrzeżenie mówi jawnie, że dalszą część trzeba powtórzyć. Limit obejmuje również pre-roll; to **nie jest obsługa nieograniczonej wypowiedzi** ani gwarancja granicy słowa.
- Mikrofon nadal jest wyłączony przez cały ASR→MT→TTS. Nowa mowa w tym czasie nie jest rejestrowana. Nie dodano kolejki ciągłej rozmowy; stany UI jasno każą czekać na „Słucham”. Dłuższa pauza może nadal zakończyć turę. TTS pozostaje wyłącznie lokalny, z dotychczasowym ogonem450ms przed wznowieniem.
- Tekst ASR był już emitowany przed MT; brakowało jednoznacznych etykiet. Teraz jest „Rozpoznano (ASR)” i „Tłumaczenie (MT)”, a dla tekstu z klawiatury „Wpisany tekst”. Nie poprawiamy domyślnie słów ani znaczenia.

## Whisper i modele — bez pochopnej wymiany

`src/inference.worker.ts` już wymusza Polish/Dutch i task transcribe. AudioWorklet oraz ścieżka ScriptProcessor resamplują do16kHz; test rzeczywistego Resampler potwierdza poprawne ramki dla48kHz i44,1kHz. Whisper preprocessor ma okno30s. Przy naszym buforze do20s pozostaje pojedyncze okno (`chunk_length_s=0`, brak stride); nie ma dowodu uzasadniającego nowe chunkowanie. Opcje dekodera, language i max_new_tokens128 pozostają bez zmian.

Wykonano16 rzeczywistych prób ASR: dwa modele × PL/NL × syntetyczne tempo160/220 × limit128/256. Referencje, pełne wyniki, czasy, SHA audio i przypięte rewizje są w `ASR-RESEARCH.json`; generator `scripts/make-asr-fixtures.py`, runner `scripts/asr-research.mjs`. Użyto przenośnego eSpeak1.48.15 z oficjalnych pakietów Debian, rozpakowanego tylko w lokalnych artefaktach, bez instalacji systemowej. Nie jest częścią payloadu. Testy nie używały VAD ani mikrofonu, aby oddzielić ASR od segmentacji.

**Wynik jakościowy negatywny:** oba modele źle radziły sobie z tym robotycznym TTS. Przy128 tokenach agregat WER Tiny100%, Base106,6% (wstawienia mogą dać ponad100%). Część pustych wyników może obejmować istniejące odrzucenie powtórzeń; komunikat warning nie został zachowany w tym przebiegu. WER to porównanie słów, nie ocena semantyczna. Nie jest reprezentatywną oceną naturalnej mowy człowieka. Zwiększenie budżetu do256 nie poprawiło PL, a w NL zwiększało powtórzenia/czas. **Brak podstaw do wymiany Tiny lub zmiany budżetu na tej podstawie.**

| Model multilingual q8 | Parametry upstream | Pliki ONNX | Pełny lokalny pakiet badany | Czas ASR desktop,128 tokenów |
|---|---:|---:|---:|---:|
| Tiny |39M|40 852 675B|43 679 069B|2,5–6,9s|
| Base |74M|76 894 629B|79 753 655B|8,8–10,6s|
| Small |244M|249 077 005B|nie pobierano|NIEPRZETESTOWANE|

Rozmiary są odczytami przypiętych repozytoriów, a czasy pomiarami tego lokalnego Chromium na syntetycznym wejściu11,6–19,1s; nie przewidują Androida. Źródła: [upstream Whisper](https://github.com/openai/whisper#available-models-and-languages), [Tiny](https://huggingface.co/Xenova/whisper-tiny/tree/5332fcc35e32a33b86612b9a57a89be7906102b1), [Base](https://huggingface.co/onnx-community/whisper-base/tree/1846881b6b3a3024392c1eea3ad983695bc23925), [Small](https://huggingface.co/onnx-community/whisper-small/tree/36050c46d777d46dc4b5f43f6d90574fc38f8732).

RAM/WASM potrzebuje dodatkowo tensorów, aktywacji, pamięci ORT i cache dekodera, więc nie jest równy wadze pobierania. Peak RAM i czas na telefonie **NIEPRZETESTOWANE**; nie podajemy udawanego progu pamięci. Base pobrano i zweryfikowano wyłącznie do lokalnego katalogu badawczego. Small nie pobierano: większy koszt bez wiarygodnej referencji naturalnego audio nie rozstrzygnąłby problemu. Żaden nowy model nie trafił do manifestu aplikacji/HF.

## Aktualne testy

- Build/TypeScript PASS; testy Node48/48 PASS. Kod i pliki są powiązane z SHA `cfaf56c68d5dcc87173cc8e23173b4cc5c862eee` w VERIFICATION.json; pierwotne metadane testu przeglądarkowego wskazują start na89e0c500 z roboczymi zmianami, a zgodność testowanych źródeł potwierdzono hashami. Późniejszy commit dotyczy tylko tego raportu i wiązania dowodów. Testy ASR/MT nie są zastępowane atrapą; wolny fake model stosowany jest wyłącznie w jednostkowym teście harmonogramu VAD.
- `VAD-PROOF.json`: Chromium, rzeczywiste ORT/Silero/AudioWorklet,1200ms generowanej ciszy, start/pauza, bez COI; błędny bezpośredni import zastąpiony sprawdzonym Blob; osobno odmowa bez MAIN script-src blob. W lokalnej próbie tylko literał hosta HF zamieniono na localhost. To nie jest realny HF ani fizyczny mikrofon.
- `BROWSER-RESULTS.json`: trzy kolejne EN→NL przez kontrolowany WAV→MediaStream→VAD→Tiny→MT. Referencja „The blue bicycle is next to the house.”, wynik każdego ASR identyczny; MT „De blauwe fiets ligt naast het huis.”. Nie nazywać tego PL/NL ani fizycznym E2E. Sześć kierunków tekstu online/reuse/offline, Stop/brak późnych wyników, odmowa mikrofonu, usuwanie historii — PASS. TTS w headless: brak głosu, bezpieczny fallback; odsłuch człowieka NIEPRZETESTOWANY.
- Test lokalnego TTS z kontrolowanymi zdarzeniami API potwierdza utrzymanie pauzy przez onend+450ms oraz brak resume po Stop. Nie mierzy akustycznego echa na Androidzie.

## Podmiana HF po przeglądzie

Wgrać tylko dwa pliki z `PATCH.json` do `translator-test/assets/`, pod zachowanymi nazwami. Nie zastępować index.html, adaptera sesji, workera, sw.js, modeli, VAD/runtime ani licencji. Generator `make-audio-update.py` sprawdza niezmieniony worker i CSS przed utworzeniem nakładki. W gotowych plikach zachowano podpis importu capture z89e0c500 i MAIN Blob zc310509; adapter0da02a6f oraz worker d6fbb732 pozostają na HF. Aktualne CSP blob i wąski CDN pozostają bez zmian. Nie uruchamiać wcześniejszego generatora nakładki na tych nowych plikach — przywróciłby starą wersję.

Jeżeli SW podaje starsze pliki, zweryfikować ich SHA i odświeżyć wyłącznie własny cache powłoki/SW. Nie kasować470MB cache modeli, historii użytkownika ani danych całego originu. Rollback: przywrócić dwa wcześniejsze pliki z c310509/89e0c500, których SHA podano w baseFiles; pozostałych plików nie dotykać. Nie zapisano niczego na HF w tej fazie.

## Krótka akceptacja telefonu — nadal otwarta

1. Android: zapisać model telefonu/RAM, wersję Chrome, czy słuchawki/głośnik. Sprawdzić nowy SHA nakładki i stan „Słucham”. Tylko fikcyjne dane. Użytkownik czyta z góry znany tekst; zaobserwowane wcześniejsze przekłamania nie są tekstem referencyjnym.
2. PL i NL: po jednym krótkim zdaniu, następnie pełne referencje z ASR-RESEARCH.json w naturalnym tempie, jeszcze raz szybciej. Osobno wewnętrzna pauza około1s. Porównać **ASR przed MT** z referencją; zapisać brakujące/dodane słowa i czasy. Negacje, dawki/liczby/jednostki muszą pozostać poprawne. Dowolny ich błąd oznacza FAIL danego przypadku; nie zgadywać sensu ani uznawać samego wyświetlenia tekstu za sukces jakościowy.
3. Zdanie dłuższe niż20s: wymagany czytelny komunikat o fragmencie, brak cichego odrzucenia całej tury, dalsza część dopiero po „Słucham”. Podczas ASR/MT mówić kontrolne dodatkowe zdanie: aplikacja powinna jawnie wskazywać wstrzymanie, nie obiecywać jego zapisu. Sprawdzić Stop w mowie i przetwarzaniu oraz10kolejnych tur bez restartu karty.
4. Fizyczny lokalny TTS PL/NL: człowiek potwierdza odsłuch; własny głos aplikacji nie może wracać do historii ASR. Po końcu TTS i450ms znów „Słucham”; nowe zdanie musi być przyjęte. Zanotować opóźnienia/echo/ostrzeżenie wolnego urządzenia. Dopiero te próby mogą potwierdzić użytkową poprawę; nie są wykonane przez lokalny test syntetyczny.
