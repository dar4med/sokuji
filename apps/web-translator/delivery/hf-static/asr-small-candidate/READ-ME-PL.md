# Small q8 — izolowany kandydat do decyzji, nie wdrożenie

Nie zmieniono domyślnego Tiny w repo/HF. To **wariant do osobno zatwierdzonej próby jakościowej**, nie zaliczone rozwiązanie dla Androida. Na zamrożonym FLEURS Small dał15%WERPL/20%NL, ale18–20s mediany ASR i~1,9GiB sumyRSS desktopChrome. OpusMT ma też niezależne błędy z poprawnej referencji. Nie obiecujemy wiernej rozmowy ani czasu zbliżonego do rzeczywistego.

`UPLOAD-SOURCES.json` przypina10publicznych plików ASR do rewizjiSmall36050c46 iSHA; `metadata/` zawiera nowy manifest i3pliki dowodów licencyjnych. Upstream Apache-2.0; oryginalne hashe kart zapisano wsource.json, a dostarczone karty mają tylko normalizację białych znaków. Nie ma nowych zależności ani zmian modeluMT.

Assembler korzysta wyłącznie z już istniejącego Node i zapisuje **nowy oddzielny katalog**. Nie wysyła niczego. Przykład dla repo i wcześniej zachowanego payloadu:

```sh
node assemble.mjs --base /sciezka/do/oryginalnego/payloadu --models-dir /workspace/artifacts/natural-asr/small --output /nowy/katalog/kandydata
```

Bez`--models-dir` pobiera publiczne przypięte pliki HF, sprawdzając każdy SHA/rozmiar. Dla wersji pobranej przez rawGitHub wymagane są lokalne assemble.mjs, UPLOAD-SOURCES.json, ASR-NOTICE-APPEND.txt; `--metadata-url-prefix` może wskazywać **immutableURL** katalogu metadata z dokładnego commitu PR. Nie podawać tokenów ani podpisanego URL prywatnego Space. Istniejący payload dostarcza tylko oryginalny models-manifest/notices i potwierdzenie licencjiApache; nie jest nadpisywany. Obsługiwane są dwie dokładnie znane wersje notices:Actions4db986… i lokalnafe5ad0…; inne wejście zatrzymuje składanie.

Wynik: `payload/` z dokładnie15plikami (10ASR, manifest,3karty/source, notices z dopiskiem unieważniającym historyczny wpisTiny) oraz `DELIVERY.json` **obok payloadu** z rozmiarami/SHA. Nie wgrywać helpers/dowodów JSON ani nie traktować częściowego katalogu po błędzie jako gotowego. Binary modelu nie dodano doGit. `251936077B` ASR; po zmianie pełny pakiet modeli PL↔NL `722695888B`, o208257008B więcej niżTiny. Złożenie lokalne sprawdzono; `ASSEMBLY-PROOF.json` zawiera pełny manifest wyniku. Jego notices bazuje na lokalnym warianciefe5ad0; wariantActions zachowuje własne oryginalne noty, więc finalny hash/rozmiar notices będzie inny i musi być ponownie zweryfikowany.

**Zakres ewentualnej zgody:** wyłącznie15plików pod repoHF`translator-test/`; nie index/capture/worker/adapter/HTML/SW/README/runtime/VAD/MT. AktualnyHFhead1a1eb79… i hashe krytycznych plików zapisano wUPLOAD-SOURCES jako preservedFiles. Najpierw potwierdzić nowy manifestSHA w rzeczywistymUI; stary SW może podawać poprzedni manifest. Nie czyścić CacheStorage modeli ani całego originu. Po zgodzie koordynator może odświeżyć tylko własną powłokę, jeśli jest stale.

Po ewentualnym zatwierdzeniu zamknąć aktywne sesje testowe; najpierw wgrać10plikówASR i dowody/notices, a **models-manifest.json na końcu**. Nie używać sync/delete. W trakcie podmiany stary manifest może odrzucać nowe bajty przezSHA; to przejściowy błąd dostępności, nie powód pomijania kontroli. Nie ogłaszać gotowości przed zweryfikowaniem pełnego nowego pakietu na urządzeniu.

Zmiana ASR nie jest atomową zmianą całego cache: instalator weryfikujeSHA, wymienia stare plikiASR i uruchamia silnik dopiero po komplecie poprawnych plików. Wstępny licznik cachedBytes nie weryfikujeSHA, więc może początkowo pokazywać stary cache jako obecny. Przerwanie wymaga ponowienia; MT pozostaje bez zmian. Przygotować miejsce na dodatkowe~208MB oraz zapas pobierania; rzeczywisty peak pierwszego pobierania/AndroidRAM nie został zmierzony. Rollback doTiny oznacza przywrócenie starego manifestu/licencji/notices i może wymagać ponownego pobrania43,7MBASR; nie usuwać470,8MBMT.

Po osobnej zgodzie na transfer: najpierw kontrolaSHA nowego modelu wUI, potem kilka znanych zdańPL/NL na fizycznymtelefonie z pomiarem czasu i restartów karty; porównać ASR przedMT. Bez takiego testu nie akceptować wydajności/pamięci/odsłuchu. TTS/echo oraz semantykaMT nadal są otwartymi bramkami. Teraz nie wykonano żadnego zapisuHF/WP/dhosting/main.
