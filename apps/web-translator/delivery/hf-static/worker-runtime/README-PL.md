# Mała nakładka runtime workera — do przeglądu, bez zapisu HF

Do HF trafia **tylko `inference.worker-DK3oltoU.js`** pod dotychczasową ścieżką w repo `translator-test/assets/inference.worker-DK3oltoU.js`. Nie zmieniać modeli, WASM, MJS ani reszty payloadu. Nie wykonano uploadu/commitu do HF; nadal obowiązuje zgłoszona bramka zgody dotycząca zapisu do HF Space main.

Generator `make-patch.py` sprawdza dokładny SHA pierwotnego workera i zastępuje jedno przypisanie wasmPaths. Czytelny kod to `hf-wasm-paths.js`. To hostingowa nakładka, nie przebudowa aplikacji/modeli. Nazwa starego pliku została zachowana celowo, więc **nowy SHA z PATCH.json zastępuje jego hash w manifeście tej nakładki**.

1. Worker pobiera wyłącznie własny `/runtime/ort-wasm-simd-threaded.mjs`, credentials `same-origin`, redirect `error`, bez body requestu i dodatkowych nagłówków. Sprawdza HTTP, MIME, maksymalnie20856 B i SHA `30dd851d9c00622940500f71ddd2ff8820c5cb65270816080175b958705385a8` (to hash **MJS**, nie WASM).
2. Tworzy Blob o MIME text/javascript i próbuje jego importu. Błąd trafia przez istniejący protokół worker→UI jako stały komunikat HF ORT. Nie dodaje `blob:` do CSP ani nie zwiększa credentials.
3. ORT otrzymuje `{mjs: blobURL, wasm: absolutny własny /runtime/ort-wasm-simd-threaded.wasm}`. numThreads1/proxyfalse pozostają bez zmian. Blob pozostaje na czas życia workera; Stop nadal niszczy worker.

`proof.json` jest dowodem **lokalnego Chromium**, nie prywatnego HF: oryginał przy zablokowanym module import kończy się błędem; patch wykonuje rzeczywisty EN→NL z istniejących lokalnych, zweryfikowanych plików; brak COI; bez pobierania z HF. Osobne próby blokady Blob przez własne CSP workera i zmienionego hasha MJS kończą się odmową, bez łagodzenia zabezpieczeń. Nie potwierdza mikrofonu/ASR/TTS ani zgodności cookies prywatnego HF. Prostszy wariant samego wasmPaths.wasm został lokalnie odrzucony — w tym bundlu nadal inicjował import MJS.

Po osobnej zgodzie na zapis HF należy wgrać jeden plik i przeładować stronę. Gdy nadal wykonuje się stary worker, sprawdzić aktywny SW oraz hash odpowiedzi. Nie kasować CacheStorage modeli ani wszystkich danych originu. Ewentualne odświeżenie dotyczy tylko własnej powłoki/SW, nie470 MB zapisanych modeli. Jeśli fetch MJS lub import Blob nadal zawiedzie, zebrać nowy stały komunikat z UI; nie dodawać kolejnych originów/credentials/CSP w ciemno.
