# Ręczne Actions → FTPS: przygotowanie, bez wdrożenia

Status tej fazy: kod i lokalne testy transportu z atrapą FTP/HTTPS. **Nie uruchomiono Actions, nie odczytano sekretów, nie zalogowano FTP, niczego nie wysłano na hosting.** Punktem odniesienia jest przetestowany pakiet `c29b166bc4a79d03c012293ed7f6c83cffb3e9c6`, run `40008774472` (34 pliki modeli, 74 pliki archiwum). Testy tego pakietu są historyczne względem bieżących zmian deploymentu, nie nowym wynikiem CI.

Aktualizacja autoryzacji: właściciel zatwierdził osobny `connection-preflight`, a następnie ograniczony bootstrap ochrony bez payloadu. Dodany tryb połączenia używa wyłącznie TLS/login/PWD i MLSD docelowego katalogu, z blokadą komend zapisu na poziomie klienta. Nie buduje aplikacji ani modeli. Wymaga `approve_connection_preflight=true`, dokładnego `approval_sha` i osobnego zatwierdzenia Environment. Wynik realnego uruchomienia będzie oddzielnym dowodem; powyższy status dotyczy zakończonego przygotowania e78eaca, nie deklaruje wykonania nowych operacji.

API potwierdziło required reviewer `dar4med`, brak prevent-self-review i dokładną gałąź `feature/voice-translator-mvp`. Odczyt nazw Secrets/Variables przez integrację: 403. Koordynator zweryfikował cztery nazwy Secrets, wyłączony administrator bypass i brak Variables w GitHub UI bez oglądania wartości. Żadnych ustawień ochrony nie zmieniano przez Codex.

### Bieżący bootstrap ochrony (osobna operacja, bez aplikacji)

Realny `connection-preflight` **40064907899 / d34b8bd29ced336dee3bcaada007f705a2652511** zakończył się SUCCESS po wymaganym zatwierdzeniu właściciela. Kontrola i dane: TLS 1.3 / TLS_AES_256_GCM_SHA384, hostname verification PASS; początkowy PWD `/`, cel `/public_html/translator-test`, 0 wpisów, 0 zapisów, brak `.htaccess`. Nie powtarzamy tego testu.

Na tej podstawie i jawnego odczytu dPanelu `~ → /home/klient.dhosting.pl/dhostingdar/` oraz konta `~/ai.lekarz.nl-ohp3/` przyjmujemy **jedną wyprowadzoną ścieżkę** AuthUserFile: `/home/klient.dhosting.pl/dhostingdar/ai.lekarz.nl-ohp3/.translator-test.htpasswd`, FTP `/.translator-test.htpasswd`. To dowód mapowania od operatora + rzeczywisty FTP root, nie zgadywanie katalogów /home. Poprawność odczytu pliku przez serwer potwierdzi dopiero rzeczywisty Basic Auth. Przy błędzie nie próbujemy innych ścieżek.

Dodany odrębny tryb `provision-protection` ma osobny job, `approve_protection`, dokładny `approval_sha`, potwierdzenie mapowania i referencję do udanego runu 40064907899. Wymaga **drugiego** zatwierdzenia Environment. Nie uruchamia Node, npm, modeli, builda, artefaktów ani joba aplikacji.

Operacje są ograniczone do pustego translator-test oraz nowego dedykowanego pliku hasha poza WWW. Najpierw własny child deny-all + rzeczywiste 403; potem test atomowego RNTO zastępującego wyłącznie własny deny-all (bez DELE). Prywatny plik jest tworzony pusty, otrzymuje **SITE CHMOD 600 wyłącznie na tym nowym pliku**, a dopiero po potwierdzeniu MLSD unix.mode=0600 (lub dokładnym STAT tego pliku) dopisywany jest bcrypt koszt 12. Zaszyfrowany RETR sprawdza SHA/długość bez logowania hasha ani treści. Brak obsługi bezpiecznych uprawnień lub rename = STOP z deny-all, bez osłabiania kontroli.

Konfiguracja child zachowuje startup CSP hash i wszystkie nagłówki; zawiera tekstowe ErrorDocument 401/403/404, żeby nie dziedziczyć stron błędów WP. Maintenance używa teraz **`-s`**, nie `-f`. Poprawne hasło ma osiągnąć rzeczywiste 503 przy niepustym markerze, anonimowe/błędne dane 401. Następnie marker jest zapisywany jako zero bajtów i weryfikowany przez TLS — bez usuwania. Poprawnie uwierzytelniony pusty katalog może wtedy zwracać 403/404; to nie porażka hasła po zaliczonym teście 503. Anonimowe żądania nadal muszą dawać 401. Main first-deploy dopuszcza wyłącznie zweryfikowany pusty marker; niepusty marker nadal blokuje.

Przy błędzie po własnej instalacji bootstrap weryfikuje lub przywraca **tylko własny** child deny-all i sprawdza 403. Nie nadpisuje równoległej obcej zmiany konfiguracji. Awaria sieci uniemożliwiająca rollback jest raportowana jako niepotwierdzona ochrona; żadnego payloadu wtedy nie ma. Pozostawione pliki ochrony na failure nie są automatycznie kasowane. Nie uruchamiać prowizji ponownie w niepustym celu bez inspekcji.

Lokalnie przed runem: **48/48 testów offline PASS**, w tym rzeczywisty lokalny bcrypt/verify, obsługa pustego markera, odmowa rename-overwrite, brak dowodu unix.mode, zły SHA prywatnego pliku, 500/404/redirect finalnej konfiguracji z rollbackiem, niedziałający maintenance/CSP, istniejące pliki i zakaz komend payloadu/WP/DELE. To nie zastępuje testu prawdziwego hostingu. Finalne `htaccessSha256` po SUCCESS jest niesekretną wartością do przyszłej Environment variable; nie ustawiamy jej ani innych reguł automatycznie. Payload zawsze czeka na ostateczną odrębną zgodę.

## Potwierdzenia i otwarte bramki

- Koordynator 2026-10-24 wykonał publiczny test **bez USER/PASS**: `dhostingdar.ftp.dhosting.pl:21`, AUTH TLS 234, TLS 1.3, domyślna weryfikacja łańcucha i hostname PASS, certyfikat `*.ftp.dhosting.pl` do `2027-02-13T23:59:59Z`, PBSZ 0 / PROT P 200. To dowód negocjacji prywatnego transportu, nie działania pasywnego kanału danych po zalogowaniu. Własna próba w Codex zatrzymała się na DNS; publiczny artykuł dhosting był niedostępny przez proxy (403). Nie obchodzono blokad i nie zgadywano innych hostów.
- dPanel odczytany przez właściciela potwierdza konto `ahsh9u_ailekarz` w zaakceptowanej przestrzeni `~/ai.lekarz.nl-ohp3/`. Docelowy **wirtualny FTP PWD** to dokładnie `/public_html/translator-test`. Nie dopisywać `ai.lekarz.nl-ohp3` drugi raz. Systemowy home konta głównego `/home/klient.dhosting.pl/dhostingdar/` nie jest dowodem ścieżki AuthUserFile ani katalogu FTP tego użytkownika.
- Obserwacja koordynatora: anonimowe HEAD na katalog/SW/manifest/model zwraca **404 bez WWW-Authenticate**. Bramka ochrony **NIE jest spełniona**. Nie deklarujemy prywatności strony. Skrypt docelowo sprawdzi rzeczywiste GET: wymagane 401 z Basic challenge, nigdy 403/404/200 ani redirect.
- Nadal niepotwierdzone: logowanie tego konta z runnera, kanoniczny PWD po CWD, MLSD/fakty o dowiązaniach, zapis/RNTO-overwrite w tym katalogu, TLS/pasywne data channels i ewentualne wymaganie reuse sesji TLS, rzeczywiste działanie maintenance i nagłówków LiteSpeed. Nie przeprowadzono tych prób.

## Istniejący workflow, bez nowej rejestracji i bez automatycznego triggera

Rozbudowano istniejący plik `.github/workflows/translator-private-package.yml`, ID **394420703**, pozostający `disabled_manually`. Usunięto **wszystkie push triggery** i upload-artifact. Pozostało wyłącznie `workflow_dispatch`. Bez main/default-branch changes i bez automatycznego bootstrapu. Dawny artefakt pozostaje bez zmian.

Tryb domyślny `build-preflight`: buduje, testuje i pakuje wyłącznie na dysku jednego runnera; na końcu anonimowo sprawdza 401. Nie otrzymuje poświadczeń FTP i niczego nie zapisuje na serwerze. Przy obecnych 404 zakończy się błędem preflight.

Tryb `deploy`: wymaga checkboxa `approve_deployment=true`, pola `approval_sha` równego pełnemu SHA uruchamianego źródła, właściwej gałęzi/repozytorium oraz przyszłej akceptacji Environment. Brak pola nie uruchamia transportu. Build/test/model-lock jest taki sam jak w udanej dostawie: Node 24.19.0, Python 3.12.14, `npm ci`, przypięte modele/34 SHA, runtime/WASM/VAD/notices, TypeScript, logika, pełne Basic Auth/MT/audio i CSP. Nowe testy FTP są bez sieci. Archiwum 74 plików jest lokalnie wyodrębniane i sprawdzane; na hosting trafia tylko 69 plików payloadu bez `.htaccess`.

Nie ma artefaktu GitHub z każdego deploymentu, cache modeli/zależności ani powtórnego uploadu pełnej paczki do limitu 0,5 GB. Używany jest standardowy bezpłatny runner publicznego repo. Przyszły build musi odtworzyć istniejące modele, ale w tej fazie nie pobierano ich ponownie. Transfer do/z istniejącego hostingu może wynieść ok. **1,6 GB** (upload, kontrolny FTPS RETR i HTTPS), miejsce docelowe ok. **0,53 GB** plus chwilowo jeden plik tymczasowy; limity istniejącego planu i brak dodatkowych opłat trzeba sprawdzić przed uruchomieniem, bez zwiększania budżetu.

Nowy workflow poza main nie gwarantowałby manualnego dispatch. Zachowano już zarejestrowany ID/pliki. **Nie wykonujemy teraz nawet testowego dispatch**. Przyszłe wywołanie API tego ID z `ref=feature/voice-translator-mvp` nastąpi dopiero po akceptacji. Jeżeli GitHub mimo rejestracji odmówi z powodu reguły default branch, to otwarta blokada — bez dodania push triggera, zmiany main lub default branch w obejściu.

## Jednorazowe Secrets przez GitHub UI — bez haseł w czacie

Właściciel sam konfiguruje **Settings → Environments → translator-test** przed włączeniem workflow. Nie tworzymy tego środowiska ani ustawień teraz.

Podstawa: [oficjalna dokumentacja GitHub Environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments), odczytana przez GitHub API. Dokumentacja dopuszcza Environments na GitHub Free dla publicznych repo i opisuje required reviewers, selected deployment branches oraz udostępnienie Environment secrets dopiero po spełnieniu protection rules. Rzeczywiste zapisane ustawienia sprawdza właściciel w UI.

1. Sprawdzić dostępność protection rules na GitHub Free dla tego **publicznego** repo; dodać właściciela jako required reviewer. Jeśli tylko właściciel wywołuje i zatwierdza run, `Prevent self-review` uniemożliwi mu własną akceptację — nie włączać tego wymogu bez dostępnego drugiego zatwierdzającego. Nie tworzyć kont ani uprawnień w obejściu. Brak wymaganej bramki w planie/UI = nie dodawać haseł i nie uruchamiać deploy.
2. Deployment branches: wybrać wyłącznie `feature/voice-translator-mvp`, nie wszystkie gałęzie. Przed zgodą reviewer sprawdza dokładny SHA/diff i tryb. Sama deklaracja `environment:` w YAML nie konfiguruje review ani branch policy; GitHub może automatycznie utworzyć niechronione Environment, dlatego ustawienia muszą być sprawdzone **przed dodaniem sekretów i pierwszym runem**.
3. W tym **Environment**, nie w Repository secrets, dodać samodzielnie:

| Environment Secret | Wartość wpisywana wyłącznie w GitHub UI |
|---|---|
| `FTPS_USERNAME` | `ahsh9u_ailekarz`; skrypt odrzuca każdy inny login przed połączeniem |
| `FTPS_PASSWORD` | Hasło zaakceptowanego konta `ahsh9u_ailekarz`; host, port, login i katalog są stałe w kodzie |
| `TRANSLATOR_BASIC_USERNAME` | Osobny login testera WWW, różny od FTP |
| `TRANSLATOR_BASIC_PASSWORD` | Osobne hasło testera, różne od FTP; przyszły bootstrap bcrypt: 16+ znaków, maks. 72 bajty UTF-8 |

Nie tworzyć kopii tych sekretów na poziomie repo/organizacji, bo inne workflow mogłyby wtedy ich użyć. Nie wpisywać wartości do issues, PR, logów, inputów dispatch, CLI ani plików źródłowych. Nie eksportować ustawień zapisanych sesji. Nie są potrzebne PAT, nowe tokeny ani zmiany uprawnień integracji. Token joba pozostaje `contents: read`, checkout bez persist-credentials.

Po osobno zatwierdzonym przygotowaniu ochrony ustawić **Environment variable** `TRANSLATOR_HTACCESS_SHA256`: SHA-256 rzeczywistego zatwierdzonego `.htaccess` w tym jednym katalogu. To hash konfiguracji, nie hasło. Przyszły bootstrap może podać go w bezpiecznym podsumowaniu; właściciel jednorazowo kopiuje hash do Variables, bez uploadowania plików z komputera.

Sekrety trafiają do env wyłącznie ostatniego kroku transportu, nigdy do kroków npm/modeli/testów, payloadu ani artefaktu. Skrypt nie włącza debug FTP/HTTP i nie drukuje surowych wyjątków serwera. Standardowa walidacja TLS/hostname obowiązuje także na każdym połączeniu danych FTPS; brak plain FTP/insecure/noverify. Kontrola hosta PASV nie pozwala przenieść danych na podany przez serwer obcy adres.

## Wymagana ochrona serwerowa przed głównym deployem

Główny skrypt **nigdy nie zapisuje `.htaccess` ani `.htpasswd`**. Musi istnieć rzeczywiste Basic Auth z hashem poza WWW, zachowanymi nagłówkami wygenerowanego builda i dokładnym blokiem:

```apache
# BEGIN TRANSLATOR DEPLOYMENT GUARD
ErrorDocument 503 "Translator deployment locked"
RewriteEngine On
RewriteCond %{DOCUMENT_ROOT}/translator-test/.deployment-in-progress -s
RewriteRule ^ - [R=503,L]
# END TRANSLATOR DEPLOYMENT GUARD
```

To fragment do przyszłego przeglądu/prowizji w **dziecięcym** `.htaccess`, nie gotowy plik do wysłania teraz. Wymaga rzeczywistego potwierdzenia LiteSpeed/mod_rewrite i poprawnego DOCUMENT_ROOT; brak działania zatrzyma payload. Nie dopisywać go do root WP ani zmieniać bazy. Nie zastępować Basic Auth oryginalnym `Require all denied` z dist. Hash konfiguracji i nagłówki HTTPS muszą odpowiadać zatwierdzonemu plikowi i aktualnemu CSP ze startup SHA. Błąd CSP zatrzymuje wdrożenie przed plikami.

Pierwsze wdrożenie dopuszcza tylko zwykły `.htaccess` i opcjonalnie zgodną ikonę; **ikona nie jest wymagana**. Istniejąca aplikacja, model/dowiązanie, obcy plik lub stary marker powodują STOP. PWD po CWD musi być dokładnie `/public_html/translator-test`; żadnych prób alternatywnego katalogu. Potrzebny wyłączny dostęp zapisujący podczas runu — nie uruchamiać równolegle ręcznego uploadu lub innego klienta.

## Osobny przyszły bootstrap ochrony — konkretny plan bez WinSCP

Poniższy plan historyczny został zaimplementowany jako rozdzielony `provision-protection`, opisany w aktualizacji powyżej. Właściciel autoryzował tę ograniczoną prowizję, lecz jej run nadal wymaga osobnego zatwierdzenia Environment. Nie obejmuje to aplikacji. Nie ma ręcznego przenoszenia plików przez WinSCP. Plan i granice:

1. Właściciel potwierdza przez istniejący dPanel/operatora fizyczny, absolutny **AuthUserFile** poza WWW oraz mapowanie FTP root do zaakceptowanej przestrzeni `ai.lekarz.nl-ohp3/`. Nie składać tego z home konta głównego i nie zgadywać `/home/...`. Parametr ścieżki będzie nieaktywną do tego czasu Environment variable, nigdy hasłem w czacie. Prywatna ścieżka FTP proponowana do zatwierdzenia to `/.translator-test.htpasswd` w tym zaakceptowanym root, nie w public_html.
2. Osobny preflight przyszłego trybu: TLS/PWD/root/mode katalogów, brak obcych plików i istniejących plików ochrony. Istniejącej konfiguracji lub hashy nie nadpisywać automatycznie. Potwierdzić bezpieczne uprawnienia tylko dedykowanego pliku i zdolność serwera do odczytu; bez chmod WP/globalnych zmian. Osobno potwierdzić atomowe RNTO zastępujące własny deny-all — jeśli serwer tego odmawia, STOP, bez usuwania działającej ochrony.
3. W pustym `public_html/translator-test` najpierw zabezpieczyć **wyłącznie** dziecięcy `.htaccess` deny-all i rzeczywiście sprawdzić 403 przed dalszym przygotowaniem. To jedyna faza, w której 403 służy blokadzie bootstrapu; **nie zalicza** bramki 401 głównego deploymentu.
4. W przypiętym Pythonie 3.12 na jednorazowym runnerze wygenerować bcrypt koszt 12 z Environment secret testera, np. dostępnym lokalnie libcrypt; sprawdzić niezależnie i zgodność LiteSpeed. Hasło tylko w pamięci. Do prywatnego pliku idzie wyłącznie `login:hash`, bez jawnego pliku hasła/logowania. Nie pobierać generatora online i nie tworzyć nowego hasła/konta FTP. Użyte konto testera pozostaje inne niż FTP.
5. Przesłać dedykowany plik hasha **poza public_html**, zweryfikować jego bajty przez szyfrowany odczyt (bez logu zawartości), a następnie atomowo zastąpić własny deny-all w `translator-test/.htaccess` finalnym Basic Auth + maintenance + aktualnym CSP. Nie ruszać innych plików ani WP. Przy przerwaniu zostawić deny-all; nie otwierać okna publicznego dla aplikacji. Przed ukończeniem bootstrapu nie ma payloadu.
6. Zweryfikować prawdziwe anonimowe i nieprawidłowe credentials →401 dla katalogu/JS/SW/modeli także gdy ich jeszcze nie ma. Podać zatwierdzony hash `.htaccess` do Environment variable. Prawidłowy Basic Auth zostanie następnie odróżniony od błędnego przez rzeczywisty autoryzowany 503 maintenance przed pierwszym plikiem payloadu. Nie trzeba osobnego ręcznego uploadu ikony ani PHP/WP probe.
7. Zakończyć tryb provisioning. **Nie łączyć go z automatycznym payloadem**. Dopiero następna osobno zatwierdzona operacja `deploy` może budować/przesyłać aplikację. Nie zapisujemy teraz żadnego z tych plików ani ustawień.

## Transakcja pierwszego payloadu i przerwany transfer

1. Anonimowy HTTPS GET dla katalogu i wszystkich 69 plików musi dać 401 Basic; jedno błędne hasło też 401. Redirect do WP/obcego hosta, 200/403/404 → STOP przed FTP.
2. Po explicit AUTH TLS, zalogowaniu i PROT P: CWD/PWD tylko stały cel, MLSD tylko tego katalogu, zwykłe pliki bez symlinków, zatwierdzony SHA `.htaccess`. Nie czytamy pliku haseł.
3. Zapisać własny `.deployment-in-progress`. Z poprawnym loginem wszystkie próbki index/asset/model/SW muszą rzeczywiście dawać **503** i wymagane nagłówki; bez/złym hasłem nadal 401. To dowód działania Basic Auth **przed payloadem**, nie zaliczenie 403 deny-all. Jeżeli poprawne hasło też daje 401 lub dostajemy WP/redirect/200 — zero plików payloadu.
4. Tworzyć wyłącznie nowe podkatalogi wewnątrz celu. Każdy plik: STOR do własnej losowej nazwy tymczasowej w tym samym katalogu, szyfrowany RETR i SHA/length, potem RNTO do finalnej nazwy wyłącznie wewnątrz celu. `sw.js` i index na końcu. Nie ma DELE, mirror/sync, chmod, rename poza celem ani zapisu `.htaccess`.
5. Ponownie potwierdzić konfigurację/auth/maintenance. Dopiero po wszystkich zgodnych plikach atomowo przemianować własny marker na unikalny `.deployment-complete-<SHA>-<UUID>.json` w tym samym katalogu, po sprawdzeniu, że nazwa nie istnieje. To commit — brak kasowania/nadpisywania receipt. Opcjonalna wcześniej zgodna ikona też nie jest nadpisywana. Następnie realny HTTPS 200, SHA/length/MIME/nagłówki wszystkich plików i anonimowy 401.

**Przerwanie przed commitem zostawia marker i 503 dla autoryzowanych, 401 dla anonimowych.** Skrypt nigdy nie usuwa blokady w `finally` ani po błędzie. Nie próbuje automatycznej naprawy starego/przerwanego celu. Przy błędzie po commicie próbuje ponownie ustawić własny marker; jeśli FTPS jest już niedostępny, nie może zagwarantować zdalnego relock. Wtedy na serwerze jest cały zweryfikowany payload pod Basic Auth, nie częściowo przesłana wersja; wymagana kontrola operatora. Nie obiecujemy atomowego rollbacku całego katalogu ani odporności na równoczesną zmianę `.htaccess` przez inną osobę.

Odzyskiwanie po przerwaniu: osobna decyzja/inspekcja tylko translator-test, nie automatyczne delete ani ponowny deploy. Zachować blokadę do rozstrzygnięcia; do resetu/backupów użyć przyszłej osobno zatwierdzonej operacji w tym zakresie, bez wymuszania WinSCP i bez WP/DB.

Maintenance/zmiana hasła nie usuwa już zapisanych kopii offline. Ten katalog nadal współdzieli origin/cache/storage z WP. Aktualizacja/pierwsze wdrożenie nie jest testem telefonów, fizycznego mikrofonu, lokalnego odsłuchu TTS ani semantyki; nadal wymagany MOBILE_ACCEPTANCE i fikcyjne zdania.

## Co wykonano lokalnie teraz

`python3 -m unittest discover -s tests -p test_deploy_ftps.py -v`: **23/23 PASS**, sieć jest zablokowana mockiem. Testy obejmują sukces, 401 vs 403/404/open/redirect, błędne credentials, canonical PWD, traversal/userinfo/CRLF, symlinki/obce pliki/stary lock, zły guard SHA/CSP, przerwany transfer, błędny hash, RNTO failure, kolizję receipt bez nadpisania/odblokowania, relock po błędnym MIME, certyfikaty/hostname/TLS/PROT P oraz brak podążania za HTTPS redirectem. YAML/Bash: PASS — manual-only, dokładny approved SHA, `contents: read`, cztery sekrety tylko w ostatnim kroku, brak upload-artifact. To dowód logiki, **nie test konta ani serwera FTPS**. Nie przebudowywano i nie pobierano modeli.
