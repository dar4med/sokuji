# Private Static Space — przygotowanie, bez publikacji

Jedna droga: Hugging Face **Static / Private**, natywne logowanie HF. Dokumentacja potwierdza darmowe Static Spaces, 100 GB prywatnego storage konta Free oraz `custom_headers` COOP/COEP/CORP. **Działanie na HF nie zostało sprawdzone**: nie mamy zalogowanego konta/Space.

## Wymagane od właściciela

Samodzielnie zalogować się lub założyć bezpłatne konto HF w przeglądarce koordynatora. Tworzenie Space i publikacja plików wymagają osobnej zgody. Wybrać **Static**, **Private**; bez PRO, Docker, Gradio, płatnego hardware i karty. Nie przekazywać haseł ani tokenów w czacie. Na własnym Androidzie właściciel loguje się tym samym swoim kontem. Osobni testerzy wymagają własnego uprawnionego dostępu HF; nie udostępniać im hasła właściciela.

## Najmniejszy transfer — folder, bez budowania

1. Przygotować lokalny folder roboczy, zachowując oryginał paczki Windows. Do jego root skopiować przygotowany `README.md` jako README Space.
2. Umieścić gotowy payload w podfolderze **`translator-test/`**, zachowując `index.html`, `assets/`, `models/`, `runtime/`, `vad/`, manifest i licencje. Zastosowana już nakładka UI ma kod `38d8c828b1dd521598a9263b747e62abba654029`. Nie kompilować i nie pobierać modeli ponownie. Zachować zweryfikowane noty/licencje wariantu Actions. Nie kopiować `.htaccess`, `.htpasswd`, plików hostingu, launcherów, źródeł, sekretów, nagrań ani historii. Starsze trzy JS pozostałe po overlay nie są wymagane przez nowy index/SW.
3. Po zgodzie na publikację: użyć HF Files / Upload files, zachowując folder `translator-test` (nie spłaszczać nazw plików). Duże pliki mogą używać magazynu HF Xet/LFS zarządzanego przez interfejs; nie wklejać pointerów zamiast treści. Sprawdzić rozmiary w repo po zakończeniu uploadu. Jeżeli UI nie zachowa folderu albo nie obsłuży danego pliku, zatrzymać się — nie tworzyć tokena w czacie ani płatnego obejścia.
4. Ten wariant **nie ma `app_build_command`**: nie potrzebuje buildera, rozpakowania archiwum, npm, Python, serwera ani compute. Nie uruchamiać ręcznie Jobs/Space Build. Jeżeli później będzie wymagane archiwum, osobno sprawdzić i przygotować wyłącznie statyczne rozpakowanie, bez zmiany SDK/planu.

README wskazuje `translator-test/index.html`; przenośne `base: './'` gotowego builda ma działać na rzeczywistej ścieżce `/translator-test/`. Sprawdzić adres dokumentu i żądania do `/translator-test/assets/`, `/translator-test/models/`, `/translator-test/runtime/`, `/translator-test/vad/`. Nie zakładać, że alias root HF automatycznie zachowa tę ścieżkę. Jeśli platforma ją zmieni, zatrzymać się przed dalszymi zmianami payloadu.

## Bramka zgodności na rzeczywistym HF — jeszcze NIEPRZETESTOWANE

- W oddzielnym niezalogowanym profilu: repo, plik HTML, JS, model i ewentualny ref builda nie mogą być pobierane. Właściciel po logowaniu musi uzyskać prawidłowe pliki. Natywne 404/odmowa HF jest poprawną ochroną; nie wymagamy Basic401. Nie wpisywać żadnych Secrets do Static Space — są dostępne dla JS klienta.
- Publiczny adres embed `hf.space` nie jest obiecany dla Private: docs dopuszczają zewnętrzne embedding tylko Public/Protected. Najpierw oficjalna strona zalogowanego Space, potem ewentualne natywne Open app/new tab. Nie udostępniać podpisanych URL/parametrów logowania. Samo HTTPS nie dowodzi dostępu do prywatnej aplikacji w osobnej karcie.
- Na Androidzie: `window.isSecureContext`, dostępność `getUserMedia`, faktyczne `PermissionsPolicy` ramki i zgoda na mikrofon. Wymagane realne przejście aplikacji do Słucham. Jeśli HF blokuje mikrofon w ramce i nie daje autoryzowanej osobnej karty, wariant nie jest zaakceptowany; nie zmieniać Space na Public w obejściu.
- Sprawdzić trzy nagłówki, `crossOriginIsolated` i dostępność SharedArrayBuffer. W ramce brak COI może wynikać z rodzica; nasz worker używa **numThreads=1**. Rozstrzygający jest realny test WASM/ASR/MT, nie sama obecność SAB. Nie dodawać wymagania WebGPU.
- Zasoby muszą mieć poprawne MIME (JS/MJS/WASM), pełne rozmiary i SHA modeli. Downloader blokuje redirecty modeli; realny HF musi obsłużyć pobrania z własnego originu bez niedozwolonego przekierowania. Sprawdzić również największy model 61258736 B. Teraz nie zmieniamy tej kontroli.
- Sprawdzić SW pod `/translator-test/sw.js` i jego scope, ponowne użycie modeli, reload/offline oraz sześć kierunków tekstowych, następnie fizyczne PL/NL i lokalne głosy Androida. Wylogowanie/cofnięcie dostępu HF nie kasuje już zapisanej kopii offline; usunięcie następuje lokalnie przez aplikację/dane witryny. Nie używać danych pacjentów.

Apache `.htaccess` nie działa na Static Space; konfiguracja jest oddzielona. Meta CSP i hash skryptu startowego w gotowym HTML pozostają bez zmian. HF `custom_headers` pozwala obecnie tylko na COOP/COEP/CORP — nie obiecujemy ustawienia CSP, Cache-Control ani Permissions-Policy przez ten mechanizm.

Źródła: [Static Spaces](https://huggingface.co/docs/hub/spaces-sdks-static), [konfiguracja](https://huggingface.co/docs/hub/spaces-config-reference), [widoczność](https://huggingface.co/docs/hub/spaces-overview#space-visibility), [embedding](https://huggingface.co/docs/hub/spaces-embed), [cookies w ramkach](https://huggingface.co/docs/hub/spaces-cookie-limitations), [storage](https://huggingface.co/docs/hub/storage-limits).
