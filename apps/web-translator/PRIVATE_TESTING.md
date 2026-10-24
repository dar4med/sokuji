# Prywatny pakiet testowy — etap 3, bez wdrożenia

Status: przygotowanie lokalne. Nie utworzono subdomeny, konta, DNS, HTTPS ani wdrożenia. Właściciel zatwierdził prywatne testowe wdrożenie WYŁĄCZNIE w `https://ai.lekarz.nl/translator-test/`. Publikacja jest wstrzymana do uzyskania bezpiecznego dostępu ograniczonego do katalogu i poprawnej ochrony HTTPS Basic Auth. Aktualne wyniki/SHA są w TEST_REPORT.md; ten dokument opisuje wymagania, nie potwierdza hostingu.

## Warianty i granica bezpieczeństwa

Ten sam build **base `./`** jest przeznaczony zarówno do `/translator-test/`, jak i `/` na osobnym originie. Rejestracja SW i URL modeli/WASM/VAD wynikają z katalogu strony; nazwy cache z zakodowanej ścieżki z końcowym `/`. Origin nie jest na stałe zapisany w pakiecie. W etapie 3 lokalny test Basic Auth montuje identyczny `dist/` w obu miejscach, przy czym wariant root używa innego portu (osobnego originu). To nie test TLS/LiteSpeed ani konkretnej subdomeny.

| Wariant | Zagrożenia i ograniczenia | Nakład konfiguracji (szacunek, nie opłata) |
|---|---|---|
| `ai.lekarz.nl/translator-test/` obok WP | Wspólny origin: skrypty WP mogą czytać CacheStorage i wykonywać żądania w przeglądarce testera; root SW może kontrolować pierwsze wejście. Wspólne cookies według ich Path/Domain oraz storage quota. Hasło katalogu nie izoluje od WP. Nazwy cache i guard SW zapobiegają przypadkowym kolizjom, nie tworzą bariery przed wrogim JS. | Około 30–60 min konfiguracji/weryfikacji po uzyskaniu autoryzowanego dostępu; blokada przy konflikcie WP/SW, bez samowolnych zmian root. |
| Proponowane `translator-test.lekarz.nl`, osobny document root | Osobny origin izoluje DOM/CacheStorage/rejestracje SW od `ai.lekarz.nl`. Nadal wspólny hosting/OS/konto i możliwe cookies `Domain=.lekarz.nl`; sprawdzić zakres cookies. Nie jest to sandbox całego hostingu. | Około 45–90 min ustawień/vhost/certyfikatu i weryfikacji, plus nieprzewidywalny czas DNS/TLS. Wymaga osobnej decyzji i potwierdzenia możliwości w obecnym planie. |

**Wybrany przez właściciela wariant to `ai.lekarz.nl/translator-test/` dla fikcyjnych testów.** Współdzielenie originu jest znanym ograniczeniem, nie samoistnym blokerem. Tabela porównuje warianty; osobna subdomena nie jest wymagana do kontynuacji i nie będzie tworzona. Dedykowany profil testera ogranicza mieszanie sesji, lecz nie izoluje skryptów/SW tego originu. Wdrożenie zatrzymuje konkretny konflikt z istniejącą stroną, brak ochrony lub brak ograniczonego dostępu; nie sam wybór katalogu. Brak dostępu/DNS w jednym środowisku nie rozstrzyga globalnego DNS.

## Uwierzytelnienie i cache

- Downloader dopuszcza wyłącznie kanoniczną bazę własnego originu, katalog zakończony `/`, bez userinfo/query/hash. Odrzuca traversal, kodowane/nieprawidłowe ścieżki i przekierowania. Dopiero taki URL pobiera z `credentials: same-origin`, bez ręcznego nagłówka Authorization i bez haseł w kodzie. SHA-256 i limit 30 s bez postępu pozostają aktywne; brak częściowych plików w cache.
- SW obsługuje tylko GET własnego originu i katalogu instalacji. Aktualizacja usuwa wyłącznie stary shell własnego prefiksu. Usuwanie modeli dotyczy wyłącznie cache własnej instalacji. Legacy `medpartners-shell-*` / `medpartners-models-v1` oraz WP pozostają nietknięte.
- **Odebranie Basic Auth nie odwołuje zapisanej kopii offline**, również gdy sieć już odrzuca poprawne wcześniej poświadczenia. `Cache-Control: private, no-store` ogranicza HTTP/proxy cache; nie wyłącza jawnego Cache API. Nie obiecujemy zdalnego revoke. Brak funkcji bezpiecznego wylogowania HTTP Basic; zamknąć profil/sesję zgodnie z procedurą testera.
- `noindex/nofollow/noarchive` to wskazówka dla robotów, nie kontrola dostępu. Nie zastępuje Basic Auth. Nie dodawać wyjątku publicznego dla wag, SW ani zasobów.

## Pakowanie — dopiero z czystego przetestowanego SHA

```bash
npm run assets
npm run build
python3 scripts/verify-models.py --directory dist
npm test
# Lokalny test Node Basic Auth, rzeczywiste istniejące modele i Chromium:
npm run test:auth
# Po zakończeniu testów i odczytaniu sourceSha:
python3 scripts/package-private.py --output-dir /workspace/artifacts/sokuji-stage3
```

Pakowanie NIE buduje i NIE pobiera modeli. Wymaga czystych źródeł oraz świeżych raportów Basic Auth obu wariantów i CSP dla danego SHA; późniejszy head może różnić się wyłącznie dokumentacją prototypu, co jest zapisywane oddzielnie; weryfikuje modele i hashe, blokadę publikacji i CSP. Archiwum zawiera `payload/` (statyczny dist z modelami/WASM/VAD/notices/licencjami/kartami), dokumentację, szablon ochrony bez aktywnych ścieżek i `SOURCE.json`, `MANIFEST.json` (rozmiary/SHA-256 wszystkich pozostałych plików). Oddzielny `.sha256` identyfikuje archiwum. Automatyczne wyodrębnienie potwierdza komplet i sumy plików.

Nie zawiera node_modules, Python, źródeł aplikacji/testów, nagrań, sekretów ani ZIP wewnątrz payloadu. Nie umieszczać archiwum w Git/Release. Lokalny plik w workspace nie jest dowodem dostępności pobrania przez właściciela. Jeśli interfejs nie daje natywnego transferu/załącznika, zgłosić blokadę dostawy i zachować plik; nie zakładać usługi w obejściu.

## Ochrona hostingowa — obowiązkowa oddzielna konfiguracja

Wygenerowany `payload/.htaccess` ma **`Require all denied`**: domyślnie blokuje publikację. Nie usuwać tej blokady przed przygotowaniem rzeczywistego ograniczonego dostępu i sprawdzeniem ochrony; zatwierdzenie właściciela dotyczy wyłącznie wskazanego katalogu. W archiwum jest wyłącznie nieaktywny szablon `hosting/BASIC_AUTH.template.txt`; nie zawiera fikcyjnej aktywnej ścieżki AuthUserFile ani loginu/hasła. Administrator musi użyć udokumentowanej ochrony katalogu hostingu lub rzeczywistego pliku hashy poza WWW i zastąpić blokadę sprawdzonymi dyrektywami. Nie dokładać `Require valid-user` obok `Require all denied` bez ustalenia semantyki Apache — taki zestaw może nie stanowić blokady.

Pozostałe dyrektywy brać z **wygenerowanego** `.htaccess`: hash startup musi odpowiadać HTML, zachować CSP bez unsafe-inline/unsafe-eval, COOP same-origin, COEP require-corp, CORP same-origin, nosniff i no-referrer. Oba silniki ustawiają jeden wątek, lecz dostarczony plik runtime `simd-threaded` tworzy pamięć shared; nie stwierdzono, że można bez regresji usunąć COOP/COEP. Żadnych globalnych nagłówków WP. `Service-Worker-Allowed: /` nie jest potrzebne; domyślny zakres katalogu wystarcza.

SFTP wymaga SSH; według przekazanej dokumentacji dhosting nie ma dodatkowych kont SSH — nie obiecujemy ograniczonego konta SFTP. Minimum dostępu: istniejący panel/klient uwierzytelniony samodzielnie przez właściciela. Alternatywnie konto katalogowe FTP + szyfrowane FTPS z weryfikacją certyfikatu, **wyłącznie jeśli oba warunki potwierdzi dokumentacja/operator**. Nie podawać haseł/kluczy w czacie i nie tworzyć kont w ramach tego etapu. Możliwości kont FTP/FTPS nie zostały tutaj potwierdzone.

## Przekazanie do zatwierdzonego katalogu przez ograniczony FTPS

Cel zatwierdzony przez właściciela: `https://ai.lekarz.nl/translator-test/`. Koordynator organizuje dostęp; nie znamy jeszcze hosta/portu ani mapowania katalogu FTPS i nie zgadujemy ich. Preferowane jest konto rzeczywiście ograniczone do tego katalogu, jeśli operator potwierdzi możliwość takiej konfiguracji. FTPS musi szyfrować kanał sterujący i dane oraz weryfikować certyfikat; nie używać zwykłego FTP ani dostępu SSH do całego konta. Właściciel wpisuje poświadczenia sam w zatwierdzonym kliencie/bezpiecznym mechanizmie dostępu, bez haseł w czacie.

Po otrzymaniu dostępu i potwierdzeniu mapowania przesyła się **zawartość `payload/`**, w tym ukryty `.htaccess`, bez dodatkowego poziomu `payload/` w adresie. Nie przesyłać ZIP do WWW i nie instalować rozpakowywacza PHP, wtyczki WP ani nowych usług. Dokumentacja, SOURCE i MANIFEST służą do przeglądu/weryfikacji i nie muszą trafiać do WWW. Ochrona musi działać przed udostępnieniem plików: początkowo pozostaje deny-all, a administrator przygotowuje rzeczywiste Basic Auth. Nie nadpisywać istniejącego sprawdzonego `.htaccess` bez połączenia jego ochrony z wygenerowanym CSP; finalna konfiguracja hostingu różni się od blokady w archiwum i wymaga osobnego zapisu/przeglądu. Nie kopiować pliku hashy haseł do katalogu.

Porównać pliki z MANIFEST.json; jeśli FTPS/hosting nie udostępnia wiarygodnych sum, zweryfikować pobrane uwierzytelnione statyczne pliki przez HTTPS. Root WordPressa i baza pozostają poza operacją. Sam brak dostępu nie blokuje przygotowania pakietu, ale uniemożliwia publikację.

## Preflight przed publikacją w zatwierdzonym katalogu

1. Potwierdzić rzeczywisty document root/katalog, brak konfliktu plików/SW WP i własność dostępu. Zabezpieczyć kopię wyłącznie dotychczasowej zawartości celu. Sprawdzić limit miejsca (pakiet ~0,53 GB plus kopia/podmiana), transfer i warunki istniejącego planu; brak nowego hostingu nie gwarantuje nieograniczonego transferu.
2. Potwierdzić moduły/AllowOverride i działanie dyrektyw na dhosting (możliwy LiteSpeed/proxy). Lokalny Node **nie wykonuje `.htaccess`** i nie jest dowodem tej zgodności. HTTP ma przekierowywać na prawidłowy HTTPS przed challenge; nie wysyłać Basic przez HTTP i nie omijać błędów TLS.
3. Nie zmieniać globalnego WP `.htaccess`, DB, DNS, kont ani Actions. Brakujące zasoby nie mogą trafiać do WP/PHP i zwracać HTML 200. Jeśli potrzebna byłaby zmiana globalna, zatrzymać publikację i opisać konflikt.
4. Sprawdzić anonimowo index/JS/SW/manifest/model: 401; uwierzytelnione: 200, poprawne MIME, długości/SHA. Bez obejścia auth przez alternatywny URL, CDN/cache/proxy. Odpowiedzi 401 nie mogą zostać zbuforowane jako zasób. HTTPS Basic Auth dla modeli i instalacji SW wymaga kontroli na obu telefonach.
5. MIME `.wasm` application/wasm, JS/MJS JavaScript, JSON JSON, ONNX octet-stream, CSS/SVG właściwe. Range nie jest wymagany przez downloader (nie wznawia od bajtu); jeżeli serwer daje 206, sprawdzić Content-Range i treść. Zachować pliki bez przekształcania. Nie mogą występować przerwy >30 s podczas transferu; sprawdzić ponowienie.
6. Zweryfikować rzeczywiste CSP/COOP/COEP/CORP i brak nonce dev, scope SW dokładnie katalogowy; root SW WP może nadal wpływać na początkowe wejście. CSP self nie odcina skryptów WP tego samego originu. Nie instalować trackerów.
7. Przekazać testerom konkretny SHA/manifest i procedurę usunięcia lokalnej kopii. Uruchomić MOBILE_ACCEPTANCE.md: najpierw tekst 6 kierunków, potem ASR PL/NL/EN, TTS rzeczywiście odsłuchany w każdym języku offline, Stop/przerwania/cache/pamięć/prywatność. Sam PASS automatyzacji nie zatwierdza semantyki (`stoi → ligt` nadal błąd).

## Rollback wyłącznie aplikacji

Zakończyć sesje. Przywrócić poprzedni komplet payloadu i jego konfiguracji w zatwierdzonym celu; nie mieszać wersji/hashów i nie ruszać WP/DB. Nowy shell używa skipWaiting/clients.claim, więc aktualizacja wymaga zakończenia rozmów. Dla pierwszej publikacji zamknąć dostęp/wycofać wyłącznie ten katalog. Odebranie hasła/usunięcie serwera nie usuwa zapisanej kopii.

Na urządzeniu testera: usunąć modele przyciskiem danej instalacji, wyczyścić historię, zamknąć jej karty/PWA; wyrejestrować **tylko SW o dokładnym scope instalacji** i usunąć tylko jej cache `medpartners-v2-<zakodowana ścieżka>-...`. Nie kasować legacy ani cache/rejestracji WP. Nie używać Clear-Site-Data, globalnego unregister ani „wyczyść wszystkie dane ai.lekarz.nl” jako rollbacku katalogowego. Jeśli przeglądarka nie pozwala selektywnie usunąć danych, użyty dedykowany profil testowy można usunąć po świadomym sprawdzeniu jego zawartości.
