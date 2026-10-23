# Plan akceptacji Android / iPhone — bez wdrożenia produkcyjnego

Status: **plan, nie wyniki**. Do wykonania przez koordynatora/testerów po udostępnieniu zatwierdzonego prywatnego HTTPS. Bez danych pacjentów. TTS i urządzenie bez rzeczywistego odsłuchu oznaczać **NIEPRZETESTOWANE**, nie PASS.

## Przygotowanie i HTTPS

1. Zapisać testowany SHA, datę, model telefonu, OS, wersję Chrome Android / Safari iOS, wolne miejsce, dostępne lokalne głosy i typ połączenia. Włączyć tryb oszczędzania danych tylko w osobnym scenariuszu. Warto uwzględnić średni Android z 4 GB RAM i starszy wspierany iPhone oraz nowsze urządzenia; nie jest to deklaracja minimalnego RAM.
2. W przygotowanym środowisku z istniejącymi zależnościami/modelami wykonać `npm run build`, `python3 scripts/verify-models.py --directory dist`, `npm run preview` (port 5180). Nie publikować dev ani źródeł. Nie kopiować `.tools`, tokenów ani `node_modules`.
3. Jeśli platforma Codex udostępnia prywatne przekierowanie portu 5180 z prawidłowym HTTPS, otworzyć jego adres jako samodzielną stronę w Chrome/Safari na telefonie, poza iframe. Dostęp powinien być ograniczony do testerów istniejącym uwierzytelnieniem platformy; nie umieszczać sekretów w URL aplikacji. Certyfikat musi być ważny i zaufany. Uwierzytelnienie nie może przekierowywać pobrań modeli na inny origin.
4. Adres panelu osadzonego nie dowodzi dostępności z telefonu. `localhost` telefonu nie wskazuje Codex. Jeżeli platforma nie oferuje takiego adresu, **test fizyczny jest zablokowany**, dopóki właściciel nie wskaże istniejącego, zatwierdzonego prywatnego originu HTTPS/reverse proxy. Nie tworzyć płatnej usługi, publicznego tunelu ani nowego wdrożenia bez osobnego zatwierdzenia. W tym etapie nie utworzono endpointu ani certyfikatu i nie sprawdzono ich na telefonie.
5. Nie używać `lekarz.nl`, `ai.lekarz.nl` ani dhosting.pl. Nie pomijać ostrzeżeń TLS i nie wyłączać zabezpieczeń przeglądarki. Potwierdzić na wybranym testowym HTTPS CSP z wygenerowanego `dist/.htaccess`, MIME WASM oraz uprawnienia mikrofonu. Sam plik `.htaccess` nie dowodzi działania nagłówków serwera.

## Materiał i ocena semantyki

W każdym kierunku **PL→NL, NL→PL, PL→EN, EN→PL, NL→EN, EN→NL** użyć krótkich fikcyjnych zdań: przedmioty, negacje, liczby, przecinki dziesiętne i jednostki. Przykłady do przygotowania równoważnych wersji przez osobę znającą oba języki:

- „Niebieski rower stoi obok domu.” / „The blue bicycle is next to the house.” / „De blauwe fiets staat naast het huis.”
- „Nie mam czerwonej torby.”
- „Nie dwie, tylko trzy butelki po 250 ml.”
- „Pudełko waży 2,5 kg, a woda ma 20 °C.”
- „Spotkanie jest o 14:30, nie o 14:00.”

Nie traktować słowa `rower/fiets/bicycle` jako wystarczającego dowodu. Człowiek ocenia całą treść, negację, ilości, jednostki i zmianę znaczenia. Znany wynik `stoi → ligt` pozostaje błędem semantycznym mimo przejścia regresji technicznej. Dla każdej próbki zapisać osobno poprawność ASR oraz MT, źródło/oryginał, wynik i ocenę; stosować wyłącznie fikcyjne dane. Żadna zgubiona negacja/liczba/jednostka w zbiorze akceptacyjnym nie może zostać przemilczana jako PASS. Progi jakości i akceptacji ustala koordynator z osobą dwujęzyczną, nie sam test regex.

## Kolejność i bramki — osobno dla obu platform

| Etap | Próba | Dowód/warunek |
|---|---|---|
| 1. Tekst | Najpierw bez mikrofonu: wszystkie 6 kierunków, poprawki wpisanego tekstu, ponowienie | Widoczny oryginał i pełne tłumaczenie, ocena semantyczna. Nie wysyła treści na serwer. |
| 2. Pierwsze pobranie | Izolowany profil/cache, Wi-Fi, następnie przerwanie transferu i ponowienie | Postęp, brak danych przez 30 s daje czytelny błąd; poprawne pliki zostają, częściowe nie stają się modelem; ponowienie odzyskuje działanie i weryfikuje SHA. |
| 3. Brak miejsca | Izolowana testowa quota/profil; nie zapełniać prywatnego telefonu | Czytelny błąd i możliwość powrotu. Nie twierdzić, że quota API zawsze dokładnie przewiduje limit iOS. |
| 4. Mikrofon | Zgoda, odmowa i ponowne otwarcie ustawień; potem 6 kierunków po 3 wypowiedzi | Mówić dopiero przy „Słucham”. Początek/koniec zdania nie ginie, VAD wykrywa pauzę; kierunek zmieniany ręcznie. Porównać ciszę i umiarkowany hałas. |
| 5. Stop | W przygotowaniu, w czasie mowy i podczas obliczeń; potem ponowny Start | Stan bezczynny, zwolniony mikrofon, brak późnych wierszy/odczytu, nowa sesja działa. |
| 6. Lokalny TTS | Każdy docelowy język, automatyczny odczyt i „Odczytaj”; potem bez Internetu | Rzeczywisty odsłuch na głośniku, poprawny język, brak sprzężenia do mikrofonu. Zapisać nazwę i `localService`; brak głosu/odsłuchu = NIEPRZETESTOWANE. Samo zdarzenie `onend` nie wystarcza. |
| 7. Offline | Po zapisaniu wszystkich pakietów włączyć tryb samolotowy, przeładować stronę/PWA i wykonać 6 kierunków | Rzeczywiste nowe tłumaczenia i lokalny odsłuch; brak zależności od sieci. Nowy niepobrany pakiet ma czytelne ograniczenie. |
| 8. Pamięć/czas | Zimny i ciepły start; krótka sesja ≥10 tur i kilka długości zdania, do 20 s | Czasy gotowości, ASR, MT, odczytu; p50/p95 z próbek, awarie i nagrzewanie. RAM mierzyć dostępnym narzędziem; brak crash nie jest pomiarem RAM. Brak narzędzia oznaczyć „niezmierzone”. |
| 9. Przerwania | Tło, blokada ekranu, utrata sieci, połączenie telefoniczne; opcjonalnie Bluetooth | Brak samoczynnego nieoczekiwanego nagrywania/odczytu; jasny stan i ponowne uruchomienie. Nie zakładać ciągłego działania w tle. |
| 10. PWA/cache | Instalacja, zamknięcie/ponowne otwarcie, uzgodniona aktualizacja testowa, usunięcie modeli | Wersja/SHA zapisane; aktualizacja nie miesza starych assetów, usunięte pakiety wymagają ponownego pobrania. Ikony mobilne/instalacja wymagają fizycznej weryfikacji. |
| 11. Historia | Wyczyść w trakcie i po rozmowie, potem przeładuj | Sesja zakończona i tekst znika; tekst/audio nie są utrwalane jako historia. Cache zawiera modele/aplikację, nie rozmowy. |

Wynik per platforma i scenariusz: PASS / FAIL / NIEPRZETESTOWANE + SHA, dowód i ograniczenia. Nie zastępować iPhone’a emulacją viewportu Chromium. Nie otwierać nowych języków/modeli w ramach tej akceptacji; UK/RU/ES wymagają odrębnego doboru/licencji modeli i powtórzenia macierzy.
