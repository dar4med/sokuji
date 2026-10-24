# Jedna próba AuthUserFile .htpasswd — do przeglądu przed uruchomieniem

Istniejący workflow **394420703**, tryb `test-relative-auth`; wyłącznie ręczny na `feature/voice-translator-mvp`. Wymaga `approve_protection=true`, dokładnego `approval_sha` oraz zwykłego Required reviewer Environment `translator-test`. Nie uruchomiono próby ani dispatch.

Cel: potwierdzić dokładnie wariant wskazany w artykule dhosting: `.htaccess` i `.htpasswd` w tym samym `/public_html/translator-test`, literalne **`AuthUserFile .htpasswd`**. Nie zakładamy rozwiązania ścieżki względnej; dowodem będzie dopiero realne401 anonimowo /401 z błędnym hasłem /200 z poprawnym i zgodną treścią małego pliku kontrolnego, także dla root przez DirectoryIndex. Brak działania oznacza koniec tej próby, bez przejścia na inny AuthUserFile.

## Dokładny zakres

1. Zweryfikować PWD i wyłącznie znany deny-all SHA `62ab5d71604e646b74beedd6e68212f9d345c1e55cdaf21714b7745e2a531eb1`, ewentualny znany kontrolny plik i pusty marker. Obca konfiguracja, dowiązanie, istniejący lokalny `.htpasswd`, aplikacja lub pozostałości wcześniejszej próby = zero zapisów.
2. Atomowo zastąpić tylko child `.htaccess`: dotychczasowe nagłówki/CSP/tekstowe ErrorDocument i deny-all, dodatkowo `<FilesMatch "^\."> Require all denied </FilesMatch>` oraz `AcceptPathInfo Off`. Potwierdzić403 przed dodaniem hasha.
3. Utworzyć pusty `.htpasswd-relative-<losowy nonce>`, tylko jemu nadać0644 i sprawdzić403 anonimowo oraz z poprawnymi credentials dla istniejącego pliku tymczasowego, `.htpasswd`, `.htaccess`, wariantu `%2ehtpasswd` i query download. Nie wystarczy domniemana blokada serwera dla plików `.ht*`.
4. Użyć dotychczasowego hasła i loginu z czterech istniejących Environment Secrets. Bcrypt `$2y$12$` jest wyliczany w pamięci z nową solą, **hasło i format pozostają bez zmian**. Nie odczytujemy ani nie zmieniamy zewnętrznego `/.translator-test.htpasswd`. Nowy plik ma0644 tylko w chronionym katalogu, aby mógł go odczytać proces WWW; nie zmieniamy praw katalogów ani nadrzędnych plików. Ten konkretny wybór praw jest częścią zakresu do przeglądu.
5. Zapisać hash wyłącznie do tego ukrytego pliku tymczasowego, potwierdzić SHA przez FTPS i ponownie odmowę HTTP, następnie przemianować na `.htpasswd`. Potwierdzić0644 także po rename. Zachować istniejący mały `__translator_protection_probe__.txt` lub utworzyć tę samą stałą treść, jeżeli go brakuje. Żadnej ikony, JS, modelu ani pliku aplikacji.
6. Atomowo zainstalować child Basic Auth z czterema dyrektywami z instrukcji operatora, `AuthUserFile .htpasswd`, tym samym zakazem dotfiles, nagłówkami i istniejącym maintenance guard. Ponownie wymagać403 dla ukrytych plików również z poprawnymi credentials; następnie401 anonimowo/z błędnym hasłem i200 dla dokładnego kontrolnego pliku z poprawnym hasłem, właściwym MIME i CSP. Nie odczytywać żadnej odpowiedzi HTTP pliku hasła/tempa, nawet gdy serwer błędnie poda200; taka odpowiedź oznacza failure.
7. Przy niepowodzeniu nowa sesja FTPS przywraca wyłącznie dokładnie znany child deny-all i potwierdza403, bez DELE, zmiany hasła, formatu ani kolejnych wariantów. Istniejące własne pliki hasła/tempy mogą zostać pod blokadą; nie sprzątamy i nie ponawiamy automatycznie. Przy nieznanym równoległym stanie STOP zamiast nadpisywania. Wynik raportuje powodzenie lub brak potwierdzenia rollbacku.

Żadnego dostępu do rodzica, WordPressa, DB, katalogu głównego FTP ani zewnętrznego pliku hasła. Dane uwierzytelniające tylko w pamięci ostatniego kroku transportowego; bez logów, CLI, artefaktów, cache i plaintextowych plików. Bez modeli, builda aplikacji, nowych Secrets, usług lub uprawnień. `package` i pozostałe tryby są pomijane.

Po przeglądzie kodu można zlecić istniejącemu workflow ten tryb z pełnym SHA komitu i `approve_protection=true`; reszta approve pozostaje false. Required reviewer zatwierdza właściciel, nie agent. Teraz tylko przygotowano kod i testy offline — nie ma runu serwerowego ani PASS dla dhosting.

## Kompatybilność przyszłego transferu

Aktualny klient pierwszego deploymentu celowo wymaga zewnętrznego absolutnego AuthUserFile i nie dopuszcza `.htpasswd` w whitelist celu. **Sukces tej próby nie uruchomi aplikacji**. Dopiero po potwierdzonym wyniku i osobnej zgodzie trzeba minimalnie dostosować te dwa warunki do dokładnie zatwierdzonej konfiguracji/hashu oraz zachować zakaz nadpisania `.htaccess`/`.htpasswd`. Teraz nie zmieniamy deployera ani nie przenosimy payloadu.
