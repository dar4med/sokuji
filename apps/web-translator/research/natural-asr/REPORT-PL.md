# Naturalna mowa PL/NL — wyniki do weryfikacji, bez wdrożenia

Podzbiór FLEURS zamrożono **przed ASR**: rewizja `70bb2e84b976b7e960aa89f1c648e09c59f894dd`, test, identyfikatory1881/1793/2003/1880/1931/1686 w obu językach, pierwsze nagranie danego ID w zakresie4–20s. To sześć równoległych neutralnych referencji i po jednym nagraniu na język; brak doboru według WER. `CORPUS.json` zawiera wiersze, teksty źródłowe, SHA każdego WAV/PCM i corpusSHA `2f2e96ebcbc40957ddbe0a4c7e569719a7018378a90192f2c453db7bef727e1e`.

Źródło: [Google FLEURS, przypięta rewizja](https://huggingface.co/datasets/google/fleurs/tree/70bb2e84b976b7e960aa89f1c648e09c59f894dd), [karta](https://huggingface.co/datasets/google/fleurs/blob/70bb2e84b976b7e960aa89f1c648e09c59f894dd/README.md), [Conneau et al.2022](https://arxiv.org/abs/2205.12446), [CC BY4.0](https://creativecommons.org/licenses/by/4.0/). Nagrania są ludzką mową **czytaną**, nie spontaniczną rozmową. NLtest zawiera tylko płeć męską; wybrany PL ma pięć nagrań męskich i jedno żeńskie. Brak identyfikatorów lektorów, więc nie twierdzimy, że jest12różnych osób. Nie użyto danych pacjentów ani wypowiedzi użytkownika jako referencji.

Metadane odczytano z przypiętych Parquet przez HTTP Range, a wybrane WAV z przypiętych tar.gz (strumień zatrzymany po uzyskaniu ścisłego podzbioru). Publikowane sumy całych archiwów pochodzą od wydawcy, nie deklarujemy lokalnej weryfikacji pełnych archiwów. Wszystkie12WAV są mono16kHz Float32; ich surowe chunkidata są bajtowo identyczne z PCM benchmarku. Bez time-stretch, TTS, normalizacji głośności i przycinania w directASR. Głosu/audio nie dodano do repo ani HF; publikujemy referencje i sumy zgodnie z atrybucją CC BY.

## Wyniki

Primary WER liczy pierwszy przebieg i każde zdanie tylko raz: NFC, małe litery, ciągi liter/cyfr jako słowa, interpunkcja/łączniki/apostrofy jako separatory, zachowane znaki diakrytyczne i cyfry. Bez poprawiania transkrypcji i rozwijania liczb. MicroWER=sumodległościLevenshteina/sumsłówreferencji. PLma100słów, NL140. Surowe ASR **przed filtrem** i osobny tekst aplikacji/warning są zachowane. Same różnice pisowni, np.Hongkong/HongKong, także wpływają na WER.

| Model q8 | Direct WER PL | Direct WER NL | Mediana ASR PL/NL | Mediana RTF PL/NL | Peak suma RSS przeglądarki |
|---|---:|---:|---:|---:|---:|
| Tiny |62/100=62%|105/140=75%|3,16/2,99s|0,36/0,43|1519,6MiB|
| Base |34/100=34%|55/140=39,3%|6,74/6,70s|0,88/0,92|1150,7MiB|
| Small |15/100=15%|28/140=20%|20,27/18,37s|2,20/2,63|1913,7MiB|

Wszystkie: ten sam istniejący ORT1.22.0/SIMD WASM, CPU/thread1/proxyfalse, dtypeq8, forcepolish/dutch, tasktranscribe, max_new_tokens128, return_timestampsfalse. Konwersje/rewizje poszczególnych modeli różnią się — porównujemy dokładne artefakty q8, nie dowodzimy czystego efektu liczby parametrów. `MODEL-CATALOGS.json` przypina pliki/SHA. Nie zmieniano aplikacyjnego VAD, UI ani opcji ASR w tym etapie.

Coldinit z nową przeglądarką/workerem i wcześniej zweryfikowanymi modelami w CacheStorage: Tiny1,64s, Base2,21s, Small3,74/3,38s (dwa rozdzielone podzbiory). To **nie czas pierwszego pobrania**. Tiny/Base mają dwa pełne przebiegi; drugi dał identyczne teksty. Mediana warmASR: Tiny3,34s/RTF0,41, Base6,35s/RTF0,85; Base miał też outlier19,97s. Small: pilot3PL+3NL, następnie pozostałe3+3, bez dodatkowego pełnego warmrepeat. Każdy przebieg ograniczony do240s,45s/call i2560MiB sumyRSS; oba ukończone, bez OOM/przekroczenia.

RSS to próbki co~100ms sumowane po procesach Chrome; obejmują cache/usługi/strony współdzielone, nie są PSS ani wyłącznie pamięcią modelu/WASM. Krótkie szczyty mogą być pominięte. Niższy zaobserwowany RSSBase nie dowodzi mniejszych wymagań modelu — wpływa GC/długość dekodowania. Prefill cache nie odwzorowuje pamięci produkcyjnego downloadera/SHA. Środowisko desktopLinux, limitCPU4rdzenie i32GiB cgroup; **nie Android**. Pełne czasy i per-phaseRSS znajdują się w JSON.

Commonbaseline VAD dla Tiny/Base: rzeczywiste SileroV5/ORTWASM i FrameProcessor, progi0,55/0,35, pre800ms/end1400ms, po512sampli przetwarzanych sekwencyjnie offline. Każdy plik dał jeden segment; dokładnie te same segmenty/SHA użyto dla obu modeli. WER: TinyPL62%,NL78,6%; BasePL31%,NL40,7%. Zatem poprawa Base występuje również przy tej wspólnej segmentacji; VAD nie usuwa zasadniczego problemu ASR. To izolacja segmentacji, nie test WebAudio/urządzenia/utraty mowy w czasie ASR/TTS. Small oceniono na identycznych surowych wejściach direct, nie na VADbaseline; nie mieszamy tych metryk.

## Decyzja i minimalny kandydat

Small jest najlepszym **zbadanym kandydatem jakościowym**, lecz nawet15–20%WER nie daje wiernej rozmowy, a RTF>2na desktopie nie spełnia celu bliskiego czasu rzeczywistego. Nie rekomendujemy jego automatycznej instalacji ani domyślnego włączenia na Androidzie. Base poprawia Tiny, lecz34–39%WER także nie rozwiązuje jakości. Nie ma tu zatwierdzonego wariantu spełniającego wszystkie cele.

Do osobnego review przygotowano **jeden izolowany wariant Smallq8 do próby**, w `delivery/hf-static/asr-small-candidate/`: manifest, publiczne URL10przypiętych plików zSHA oraz licencje. **Domyślny `models.lock.json` pozostaje Tiny.** Rozmiar ASR251936077B; pełny cache modeli PL↔NL722695888B. Brak publikacji HF. Wariant nie zmienia HTML/JS/VAD/SW/runtime/MT/auth ani istniejących poprawek HF. Przed jakimkolwiek transferem wymagana osobna zgoda właściciela na wielkość/opóźnienie i próbę telefonu.

MT jest kontrolowane osobno: poprawna ludzka referencja→ten sam OpusMT oraz rzeczywiste ASR→OpusMT, z równoległą ludzką referencją target. Same różnice tekstu nie są oceną semantyczną. Już kontrola poprawnego PLdla1793 wykazała niezależny błąd idiomu „miej oczy dookoła głowy”→fragment o40000głów; nie należy go przypisywać ASR ani obiecywać, że większy Whisper naprawi MT. W `MT-CONTROLS.json` zachowano48ukończonych kontroli:12poprawnychreferencji→MT oraz po12wynikówTiny/Base/Small→MT. Obecne są pełne wejścia/wyjścia oraz równoległa ludzka referencja celu; zero żądań zewnętrznych. Nie przyznajemy semantycznego PASS na podstawie różnic tekstu.

## Pliki dowodowe

- `DIRECT-RESULTS.json`:48wywołań Tiny/Base, raw/filteredASR, wszystkie czasy, cold/warm iRSS.
- `VAD-SEGMENTS.json`, `VAD-RESULTS.json`: wspólne segmenty i24wywołania ASR.
- `SMALL-PILOT.json`, `SMALL-REMAINDER.json`:12wywołań Small na tym samym zamrożonym podzbiorze; limity iRSS.
- `SUMMARY.json`, `MODEL-CATALOGS.json`, `CORPUS.json`: agregaty i pełne przypięcia do niezależnego przeliczenia.

Następna bramka to decyzja o **eksperymentalnym** teście Small na telefonie, a potem znane zdania PL/NL, pomiary opóźnienia/pamięci i osobna ludzka ocena znaczenia MT. Fizyczny Android i TTS/echo po zmianie modelu pozostają NIEPRZETESTOWANE.

Odtworzenie: `python3 scripts/obtain-natural-corpus.py` pobiera/weryfikuje tylko zamrożone WAV i odczytuje ich Float32 bez dodatkowych bibliotek. Modele w MODEL-CATALOGS są przypięte do publicznych repo/rewizji/SHA; modeleBase/Small w tym badaniu są wyłącznie w lokalnych artefaktach. `scripts/natural-asr-benchmark.mjs` przyjmuje NATURAL_ASR_DIR, WHISPER_BASE_DIR i NATURAL_MODELS=small; `natural-vad-segments.mjs` oraz NATURAL_INPUT_MODE=vad odtwarzają wspólną segmentację. Limity/podzbiorySmall są zapisane w JSON i flagach NATURAL_SAMPLE_START_PER_LANG, NATURAL_SAMPLE_LIMIT_PER_LANG, NATURAL_PASSES, NATURAL_CALL_TIMEOUT_MS, NATURAL_RUN_TIMEOUT_MS, NATURAL_MAX_RSS_MB. Rootlock pozostajeTiny. Źródło korpusu nie wymaga datasetviewer, tokena ani nowych kont. WER wszystkich84wierszy przeliczono niezależną implementacją Python; wynik identyczny.
