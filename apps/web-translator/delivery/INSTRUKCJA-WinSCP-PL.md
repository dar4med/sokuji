# Prywatny tłumacz — GitHub Actions i WinSCP (Windows)

To instrukcja późniejszej ręcznej publikacji, nie potwierdzenie wdrożenia ani testów telefonów. Używaj wyłącznie fikcyjnych zdań. Nie podawaj haseł w czacie.

## Pobranie i sprawdzenie

Zaloguj się w GitHub, otwórz wskazany udany run **Translator private static package** i pobierz jego artefakt. Retencja wynosi **1 dzień**. Nie publikuj release. Rozpakuj zewnętrzny ZIP GitHuba przez „Wyodrębnij wszystkie”. W środku są:

- `translator-private-<SHA>.zip` — kompletny pakiet aplikacji;
- odpowiadające mu `.sha256`, `.manifest.json` i `.delivery.json`;
- `SUMY-DOSTAWY.sha256`, `WERYFIKACJA-DOSTAWY.json`, ta instrukcja;
- `konfigurator-basic-auth-offline.zip` — osobne narzędzie lokalne, nigdy do WWW.

W PowerShell otwartym w tym folderze wykonaj `Get-FileHash -Algorithm SHA256 -LiteralPath '.\translator-private-<SHA>.zip'`, zastępując nazwę dokładną nazwą pobranego pliku. Porównaj wynik i rozmiar z `.sha256`, `.delivery.json` oraz raportem run. Sprawdź tak samo konfigurator względem `SUMY-DOSTAWY.sha256`. Niezgodność = STOP.

Rozpakuj **wewnętrzny** `translator-private-<SHA>.zip`. Folder `payload` musi zawierać jednocześnie `index.html`, `.htaccess`, `assets`, `models`, `runtime`, `vad`, `licenses`, manifesty i notices. Włącz pokazywanie rozszerzeń plików: `.htaccess` nie może nazywać się `.htaccess.txt`. `MANIFEST.json` podaje rozmiary i SHA-256 plików. Nie wysyłaj do WWW ZIP-ów, SOURCE/MANIFEST, dokumentacji, `hosting/` ani konfiguratora.

## WinSCP: tylko zaakceptowany katalog

Użyj istniejącej autoryzowanej sesji lub danych FTPS odczytanych samodzielnie z panelu dhosting. Nie zgaduj hostname ani portu z domeny WWW. Wybierz FTP z szyfrowaniem TLS/SSL wymaganym przez operatora; przykładowo Explicit TLS tylko jeśli panel to potwierdza. Nigdy czysty FTP. Nie ignoruj błędów certyfikatu; szyfrowane mają być kanał sterujący i dane. Nie włączaj SSH.

Właściciel zaakceptował konto `ahsh9u_ailekarz` obejmujące przestrzeń `ai.lekarz.nl-ohp3/`. Hasło wpisuje samodzielnie w WinSCP, bez przekazywania w czacie. Nie potrzeba kolejnego konta.

Sprawdź aktualny katalog zdalny. Cel to **`/ai.lekarz.nl-ohp3/public_html/translator-test/` względem korzenia FTP**. Jeżeli konto już zaczyna w `ai.lekarz.nl-ohp3/`, celem jest **`public_html/translator-test/`**. Nie twórz powtórzonego katalogu przestrzeni. Przed każdym transferem sprawdzaj prawy panel. Nie wysyłaj niczego do głównego `public_html`, katalogów WordPressa ani bazy.

Używaj zwykłego kopiowania, transfer binarny. **Nigdy Synchronizuj / Usuń / Mirror.** Nie wysyłaj folderu `payload` jako dodatkowego poziomu: później trafia tam jego zawartość. Osobną czynnością właściciela będzie wyłącznie umieszczenie dedykowanego pliku hashy poza WWW.

## Najpierw blokada, potem Basic Auth

1. Z oryginalnego `payload` wyślij **wyłącznie `.htaccess`** do pustego docelowego `translator-test/`. Ma zawierać `Require all denied`. Nie zmieniaj nadrzędnego `.htaccess` WordPressa. Jeżeli katalog nie jest pusty lub zawiera cudze pliki — STOP.
2. W nowym oknie prywatnym otwórz `https://ai.lekarz.nl/translator-test/`: oczekiwany **403**, ważny certyfikat, bez listy plików. HTTP 200 albo 500 = STOP. Nie wysyłaj aplikacji przed potwierdzeniem blokady. HTTP musi przechodzić na HTTPS przed ewentualnym pytaniem o hasło.
3. Rozpakuj lokalnie `konfigurator-basic-auth-offline.zip`. Otwórz `KONFIGURATOR_BASIC_AUTH.html` w Chrome/Edge, najlepiej po odłączeniu sieci. Brak instalacji, CDN i generatora online. Nie wgrywaj narzędzia na hosting. Nie wyłączaj zabezpieczeń komputera, jeśli polityka blokuje lokalny HTML.
4. Właściciel potwierdza w panelu/operatora **rzeczywistą systemową ścieżkę bezwzględną** do dedykowanego `.translator-test.htpasswd` **poza `public_html`**. Nie używaj `~`, ścieżki FTP ani zgadywanego `/home/login`. Bez potwierdzonej ścieżki pozostaw deny-all.
5. W konfiguratorze wpisz osobny login strony (inny niż FTP). Wygeneruj hasło i zapisz je w menedżerze haseł. Wpisz potwierdzoną ścieżkę, zaznacz jej potwierdzenie i wskaż oryginalny **`payload/.htaccess`**. Narzędzie sprawdza jego SHA-256 i zachowuje nagłówki poza blokiem auth. Wygeneruj lokalnie `.htpasswd` i `.htaccess-basic-auth`. Hash bcrypt koszt 12 też jest poufny; nie wysyłaj go w czacie. Żadnych generatorów online.
6. Właściciel umieszcza dedykowany plik hasha **poza WWW**, dokładnie pod potwierdzoną ścieżką. To nie jest plik WordPressa. Jeżeli operator nie potwierdza obsługi bcrypt / AuthUserFile / uprawnień odczytu pliku — STOP. Nie zmieniaj uprawnień całego konta w obejściu.
7. Dopiero teraz skopiuj `.htaccess-basic-auth` do docelowego katalogu i zmień jego nazwę na **`.htaccess`**, zastępując blokadę. Nie dopisuj `Require valid-user` obok `Require all denied`. Nie kasuj starej blokady przed gotową ochroną. Błąd 500 = przywróć oryginalny deny-all; nie otwieraj aplikacji publicznie w ramach diagnostyki.
8. W oddzielnych nowych sesjach prywatnych: bez danych **401**, złe hasło **401**. Wyślij tylko `payload/icon.svg`. Zły/brak loginu **401**, prawidłowy login **200**. Dopiero po tym przejdź dalej.

## Wysyłka i preflight serwera

Skopiuj pozostałą **zawartość `payload`, WYŁĄCZAJĄC `.htaccess`**, do zdalnego `translator-test/`. Oryginalny `.htaccess` ponownie włączyłby deny-all. Zachowaj kompletne `licenses` i `notices.txt`. Potrzeba około 530 MB miejsca na serwerze na rozpakowany payload; nie zgaduj limitu hostingu.

Bez hasła i ze złym hasłem sprawdź **401** dla index, JS, `sw.js`, `models-manifest.json`, modeli, WASM i VAD. Prawidłowe dane: **200**. Nie wyłączaj auth dla wag. Brakujące zasoby mają dawać **404**, nie HTML WordPressa z 200. Sprawdź brak listowania, HTTPS, CSP z wygenerowanym hashem, COOP/COEP/CORP i no-store/private cache proxy. `noindex` nie jest ochroną dostępu. JS/MJS musi być JavaScript, WASM `application/wasm`, ONNX dane binarne. Sprawdź długości modeli i SHA-256 względem manifestu; obsługę range/dużych plików testuje operator na rzeczywistym serwerze. Lokalne testy Node nie dowodzą zgodności LiteSpeed/.htaccess.

Przykład pobrania jednego modelu w PowerShell, z hasłem podanym wyłącznie w bezpiecznym oknie:

```powershell
$translatorCredential = Get-Credential
Invoke-WebRequest -Uri 'https://ai.lekarz.nl/translator-test/models/en-pl/onnx/encoder_model_quantized.onnx' -Authentication Basic -Credential $translatorCredential -OutFile '.\test-model.onnx'
Get-FileHash -Algorithm SHA256 -LiteralPath '.\test-model.onnx'
Remove-Variable translatorCredential
```

`-Authentication Basic` wymaga PowerShell 7; przy starszej wersji użyj autoryzowanego pobrania w przeglądarce i lokalnego `Get-FileHash`, bez wpisywania hasła w adresie/poleceniu. Pobrany model służy tylko weryfikacji, nie wysyłaj go z powrotem.

## Akceptacja i cofnięcie

Najpierw tekst na fizycznym Android/Chrome i iPhone/Safari: wszystkie 6 kierunków PL/NL/EN, powtórzenie i offline. Następnie mikrofon po sygnale gotowości, Stop/brak spóźnionych wyników, odmowa zgody oraz rzeczywisty odsłuch lokalnego TTS dla każdego języka, również offline. Brak głosu ma dać czytelny komunikat i tryb tekstowy. Oceń pamięć, pierwsze pobranie/brak miejsca, przerwania/blokadę ekranu, cache i usuwanie historii zgodnie z `PRIVATE_TESTING.md` oraz planem źródłowym `MOBILE_ACCEPTANCE.md`.

Fikcyjne zdania: „Nie biorę leku. To fikcyjny test: 2 tabletki po 5 mg, nie 50 mg.” / „Ik neem geen medicijn. Fictieve test: 2 tabletten van 5 mg, niet 50 mg.” / „I do not take medicine. Fictional test: 2 tablets of 5 mg, not 50 mg.” Człowiek musi sprawdzić negacje, liczby i jednostki. Znany błąd `stoi → ligt` pozostaje błędem semantycznym mimo technicznego PASS. Testy automatyczne nie potwierdzają fizycznego mikrofonu, odsłuchu ani jakości językowej.

Katalog współdzieli origin z WordPressem: hasło nie izoluje JavaScriptu, storage, innych SW i limitów originu. **Zmiana hasła nie odwołuje dostępu do wcześniej zapisanej kopii offline.** Korzystaj z osobnego profilu testowego, bez danych pacjentów. Po testach usuń historię i modele funkcją aplikacji; ewentualne czyszczenie ustawień witryny może dotknąć WordPressa na tym samym originie, więc nie rób go bez świadomości skutków.

Rollback: przywróć oryginalny `.htaccess` z deny-all w **tym jednym katalogu** i potwierdź 403 w świeżym profilu. Przywracanie plików/ewentualne usuwanie dotyczy wyłącznie listy pakietu w `translator-test/`, nigdy nadrzędnych katalogów, WP ani bazy. Nie używaj `Clear-Site-Data` ani globalnego czyszczenia cache. Kopie offline pozostają na urządzeniach i muszą być usunięte przez testerów.
