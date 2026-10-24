# Podpisany import capture — jeden plik nakładki

W rzeczywistym prywatnym HF koordynator potwierdził, że niepodpisany dynamiczny import capture zawodzi jeszcze przed VAD. W istniejącym `index-CJ_k8XCq.js` jest dokładnie jeden `import(\`./capture-Bh2ZntkC.js\`)`. Generator sprawdza hash bazowego bundla i zastępuje tylko ten import wywołaniem małego helpera.

Po przeglądzie podmienić repo HF `translator-test/assets/index-CJ_k8XCq.js` plikiem obok tej instrukcji. Nie zmieniać HTML ani modeli na potrzeby tej nakładki. Pozostawić cichy adapter i poprawiony capture z `SESSION-PATCH.json` oraz działający worker z `worker-runtime/PATCH.json`.

Helper rozwiązuje URL względem `import.meta.url`, a następnie dopisuje wyłącznie `__sign` ze strony, tylko jeżeli origin strony i modułu to dokładnie `https://dar4med-med-partners-translator-test.static.hf.space`, a docelowa ścieżka to `/assets/capture-Bh2ZntkC.js`. Brak logów/storage, kopiowania pozostałych parametrów i zmiany credentials/CSP. Pozostałe hostingi zachowują względną ścieżkę. Nie dodawać diagnostycznego `?acceptance` do testu, który ma sprawdzić docelowe zachowanie.

Testy `tests/hf-import.node.ts`: 3/3 PASS — dokładny zakres podpisu, brak podpisu/obcy host/obcy katalog oraz zachowanie ścieżki podkatalogowej poza HF. Składnia gotowego bundla PASS. To nie jest dowód rzeczywistego VAD na HF.

AudioWorklet jest ładowany w capture przez `audioWorklet.addModule(e)` z własnego `/vad/vad.worklet.bundle.min.js`. Nie zmieniono go w tej nakładce: dotychczas nie ma dowodu jego błędu na realnym HF po podpisanym imporcie capture. Jeśli taki błąd wystąpi, następny punktowy zakres to podpis wyłącznie tej dokładnej ścieżki; nie dodawanie CDN do script-src ani zmiana modeli. VAD wymaga też już opisanej zgody `blob:` w MAIN script-src. Nie czyścić cache modeli w celu odświeżenia bundla; sprawdzić hash pliku i własny SW.

Rozmiar/SHA nakładki: `IMPORT-PATCH.json`. Nie wykonano uploadu HF.
