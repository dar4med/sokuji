# Aktualizacja lokalnej paczki Windows — PL / NL / EN

Tylko aktualizacja plików aplikacji lokalnej. Bez hostingu, WordPressa, nowych modeli, instalacji głosów i płatnych usług.

Kod aplikacji: `38d8c828b1dd521598a9263b747e62abba654029`. Baza Windows: artefakt Actions z runu `40008774472`, źródło `c29b166bc4a79d03c012293ed7f6c83cffb3e9c6`. Wpisy bazowe notices.txt/sw.js skorygowano według oryginalnego manifestu zweryfikowanego przez koordynatora; patrz BASELINE-CORRECTION.md.

## Co poprawiono

- Selektory z Polskim (PL), Niderlandzkim (NL), Angielskim (EN) pozostają dostępne po tłumaczeniu tekstu i podczas oczekiwania na mowę. Podczas obliczeń należy poczekać na gotowość. Zmiana pary sama zamyka poprzednią sesję/mikrofon i zachowuje historię bieżącej karty. Kierunek jest widoczny pod przyciskami osoby mówiącej/piszącej.
- Pierwsze kliknięcie Rozpocznij rozmowę po tekście uruchamia mikrofon. Po komunikacie Słucham można mówić; VAD sam kończy wypowiedź po pauzie.
- Ręczne Odczytaj jest dostępne po zakończeniu obliczeń i najpierw zatrzymuje mikrofon. Automatyczny TTS nadal wstrzymuje capture aż do końca odczytu i ogona echa. Brak lokalnego głosu wskazuje ustawienia systemu urządzenia, także Windows; nie korzystamy z głosów localService=false.
- VAD nie startuje przed gotowością. ASR pomija próbki krótsze niż 300 ms, prawie bezgłośne (RMS poniżej -60 dBFS), niefinitywne oraz skrajne pętle rozpoznania (co najmniej 12 słów, powtarzający się blok zajmuje co najmniej 80%). Zamiast przycinać wynik, prosi o powtórzenie. Filtr nie rozpoznaje niezawodnie każdej muzyki/szumu i może odrzucić celowe wielokrotne powtarzanie. Krótkie negacje i zdania z liczbami/jednostkami zachowuje.

## Dokładna aktualizacja — dla koordynatora

Koordynator może użyć wyłącznie pięciu plików z payload/ jako overlay swojego istniejącego serwera: nowy index.html/sw.js/JS z overlay, pozostałe zasoby z zachowanej paczki c29b166. Weryfikować SHA z update-manifest.json. To zalecana dostawa do istniejącego helpera koordynatora; oryginalny payload pozostaje bez zmian. Alternatywny apply-local-update.mjs poniżej należy kierować do osobnej pełnej kopii roboczej paczki, nie oryginału.

1. Zamknąć karty tłumacza i zatrzymać okno lokalnego serwera URUCHOM.cmd. Nie kopiować ani zapisywać historii użytkownika.
2. Pobrać `apply-local-update.mjs` z tego katalogu przez działający GitHub/raw, przypinając pełny SHA **komitu dostawy** podany w odpowiedzi Codex. Użyć istniejącego Node z launchera; niczego nie instalować.
3. Uruchomić poniższą komendę z rzeczywistą ścieżką katalogu, w którym leżą `index.html`, `models/`, `assets/`. SHA_DOSTAWY oznacza pełny SHA komitu zawierającego ten katalog, nie dowolną nazwę gałęzi.

```text
node apply-local-update.mjs --target "C:\rzeczywisty-katalog\payload" --ref SHA_DOSTAWY
```

Jeśli Node nie jest w PATH, zamiast słowa node podać tę samą ścieżkę pliku node.exe, z której korzysta istniejący URUCHOM.cmd. Nazwa katalogu payload jest przykładem; wskazać rzeczywisty katalog serwowany przez launcher.

Helper pobierze wyłącznie manifest i pięć plików (648554 B) ze stałego publicznego repo przez HTTPS. Przed zapisem zweryfikuje istniejącą bazę i SHA-256 wszystkich nowych plików. Nie zmienia `.htaccess`, modeli, WASM, VAD ani launchera. Zachowuje stare pliki JS i kopię zastępowanych index.html/sw.js w wypisanym katalogu translator-ui-backup w systemowym TEMP. Przy niezgodnej bazie przerwać; nie wymuszać nadpisania.

Alternatywnie pobrać te same pliki, zachowując strukturę tego katalogu, i użyć `--source "katalog-local-ui-update"` zamiast `--ref`. Nie trzeba pobierać ZIP ani całej paczki. Kopia robocza modeli nie jest przesyłana.

4. Ponownie uruchomić istniejący URUCHOM.cmd i otworzyć `http://127.0.0.1:18573/`. Pozostawić kartę na kilka sekund i odświeżyć ponownie, aby dotychczasowy service worker zainstalował nową powłokę. Nie usuwać CacheStorage/modeli. Nowa wersja pokazuje Angielski (EN) i Teraz: ... → ... .
5. Najpierw tekst: PL→NL, NL→PL, PL→EN, EN→PL, NL→EN, EN→NL, bez klikania Zakończ pomiędzy zmianami. Następnie Rozpocznij rozmowę, zgoda mikrofonu, czekanie na Słucham, krótkie fikcyjne zdanie i pauza. Sprawdzić zmianę pary podczas nasłuchu i Stop.
6. TTS: Microsoft Adam/Paulina PL są obecne według diagnostyki koordynatora. Lokalne NL/EN nie są obecne na tym Windows; głosy Google localService=false pozostają wykluczone. Właściciel zatwierdził dodanie bezpłatnych systemowych głosów NL/EN w GUI Windows, ale ich obecność w WebSpeech nie została jeszcze potwierdzona; instalacja nie jest częścią tej aktualizacji. Odsłuch trzeba sprawdzić fizycznie także offline.

Rollback lokalny: zamknąć aplikację/serwer, przywrócić index.html oraz sw.js z wypisanego backupu i ponownie uruchomić/odświeżyć stronę. Stare JS pozostają dostępne. Nie usuwać modeli ani danych innych aplikacji.

## Aktualne dowody i granice

Build/TypeScript PASS; 26 testów logiki i aktualizatora PASS. `QA-browser.json`: Chromium Linux, 19 rzeczywistych tłumaczeń (w tym wszystkie 6 kierunków offline), trzy pełne kontrolowane audio EN→NL, Stop/brak spóźnionych wyników, odmowa mikrofonu, brak głosu/fallback, 0 obcych żądań i nieobsłużonych błędów. Audio to native getUserMedia z fikcyjnym urządzeniem oraz kontrolowany WAV przez WebAudio MediaStream, następnie rzeczywiste VAD/Whisper/MT. To nie test fizycznego mikrofonu ani odsłuchu. Czasy audio ready/resultAfterPlay: 4954/7612 ms, 2157/7388 ms, 2041/11278 ms. Tekst ASR: The blue bicycle is next to the house.

`QA-csp.json`: styled dev/preview i egzekwowanie CSP PASS. Brak zmian CSP/ochrony. `QA-update.json`: odtworzono stary błąd na kopii lokalnej paczki 6532e640 (zgodny kod aplikacji; różne notices.txt i klucz SW), nałożono aktualizację, przełączono istniejący SW, rzeczywisty MT PASS bez ponownego pobierania wag; ręczne Odczytaj przy braku głosu daje czytelny komunikat. To lokalny Linux Chromium, nie potwierdzenie zaktualizowanego Windows.

Raporty browser/CSP mają sourceDirty=true: w workspace pozostały wcześniejsze nieopublikowane zmiany skryptów diagnostyki FTPS. Nie biorą one udziału w buildzie. Odczyt porównawczy potwierdził zgodność wszystkich 14 plików runtime/index/config z kodem SHA 38d8c828. Późniejszy komit dostawy dodaje tylko gotowe pliki, aktualizator, jego testy i raporty.

NIEPRZETESTOWANE: fizyczny mikrofon/odsłuch Windows po aktualizacji, ASR PL/NL na fizycznym urządzeniu, Android/iPhone i ich lokalne głosy. Ludzka ocena semantyki nadal wymagana: MT nadal daje znane stoi/sta(a)t→ligt przy rowerze; techniczny PASS nie oznacza poprawnej semantyki.

Android po akceptacji Windows: najpierw kabel USB i istniejący Chrome DevTools → chrome://inspect/#devices → Discover USB devices → Port forwarding: port telefonu 18573 do localhost:18573 komputera. Wymaga telefonu z debugowaniem USB i jawnego zatwierdzenia komputera na odblokowanym telefonie. Na Androidzie otworzyć Chrome http://localhost:18573/ (loopback traktowany jako secure context), sprawdzić window.isSecureContext i zgodę mikrofonu. Zwykły Windowsowy adres 127.0.0.1 na telefonie nie wskazuje komputera bez forwarding. Nie instalować sterowników/narzędzi automatycznie, jeżeli urządzenie nie zostanie wykryte. Telefon pobierze istniejące pliki modeli z lokalnego komputera przez USB do swojej pamięci/cache; nie pobierać nowych modeli z Internetu. To plan, NIE wykonany test. Bez certyfikatów, tuneli i publicznego hostingu. Kolejność prób i bramki są w istniejącym MOBILE_ACCEPTANCE.md.

## Pięć plików payloadu

Wersjonowane świadomie tylko na potrzeby małej dostawy GitHub/raw. CSS i 34 pliki modeli oraz runtime/WASM/VAD mają identyczne SHA jak poprzednio. Stare trzy JS pozostają na dysku, bez kasowania. Po aktualizacji payload ma 73 pliki (70 starego +3 nowe nazwy JS); oryginalny manifest opisuje wersję bazową, a update-manifest.json opisuje bazę oraz delta.

| Plik | Bajty | SHA-256 |
|---|---:|---|
| `assets/capture-Bh2ZntkC.js` | 69720 | `90dff1b2cfbb71a7010def2f03a2eda2f998cb66eef47b590fe5b7aa1dee426f` |
| `assets/index-CJ_k8XCq.js` | 21653 | `572ab3cf8cd5cd840f2e6c204688df8e658add1f395f3d05a021c588ac4a91f1` |
| `assets/inference.worker-DK3oltoU.js` | 544595 | `a1a7e6a143df3f5c25916b405aaaa63a9cce5d484de59cc03d2b3270ade6ccd0` |
| `index.html` | 9747 | `202a1c22ad82371425e5d6d7e22c6589393c629fb7c3e88cad6e8b0f6f8d1a4f` |
| `sw.js` | 2839 | `4f0e13428b3f318ee67d59fdce5692d108df59ad48f2376234eab75ca3272d64` |
