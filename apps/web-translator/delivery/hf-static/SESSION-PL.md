# Cichy adapter prywatnego HF — mała nakładka, bez nowych modeli

Zakres: wyłącznie `https://dar4med-med-partners-translator-test.static.hf.space`. Pliki przygotowano lokalnie i na gałęzi GitHub PR; autor tej nakładki nie zapisuje do HF. Koordynator zgłosił rzeczywisty PASS PL→NL na HF po istniejącym worker patch i przekazaniu podpisu do jego URL (7,5 s). To nie jest wynik mikrofonu/VAD/TTS.

## Co wgrać po przeglądzie

1. `hf-session-adapter.js` → repo HF `translator-test/hf-session-adapter.js`.
2. `capture-Bh2ZntkC.js` → `translator-test/assets/capture-Bh2ZntkC.js` (zachowana nazwa importowana przez aplikację).
3. W istniejącym HF `index.html` zastąpić tymczasowe diagnostyczne wrappery/adaptery jedną zewnętrzną linią przed modułem aplikacji:

```html
<script src="./hf-session-adapter.js"></script>
```

Nie zastępować całego aktualnego HTML dawną kopią. Pozostawić wgrany worker `d6fbb732…` z `worker-runtime/PATCH.json`. Nie zmieniać modeli, runtime MJS/WASM, not licencyjnych ani workleta VAD. SHA i rozmiary dwóch nowych plików: `SESSION-PATCH.json`.

**Wymagany osobny przegląd CSP MAIN:** zweryfikowany Blob MJS jest importowany także w głównym wątku. Oryginalne `script-src 'self' 'wasm-unsafe-eval' <hash-startup>` go blokuje. W testowym HF potrzeba dodać `blob:` do tej dyrektywy, zachowując istniejący hash i pozostałe pozycje. Samo `worker-src blob:` nie wystarcza. Adapter nie zmienia CSP. `connect-src` pozostaje `'self' blob: https://us.aws.cdn.hf.co`, bez listy18 originów, wildcardów ani zewnętrznego script-src. `script-src blob:` dopuszcza moduły Blob pochodzące ze strony; ten helper przed importem sprawdza dokładny SHA MJS. Wariant bez tego uprawnienia jest jawnie testowany jako odmowa.

## Mechanizm

- Pobieranie modeli: istniejący wąski adapter same-origin `/models/`, redirect follow, credentials same-origin, końcowy URL własny lub dokładny CDN `/xet-bridge-us/`. Dalsze SHA/timeout/cache pozostają w installerze. CSP ogranicza połączenia przed żądaniem; kontrola końcowego URL następuje później.
- `window.Worker`: wyłącznie `/assets/inference.worker-DK3oltoU.js` bez query/fragmentu/userinfo, na dokładnym własnym originie. Kopiuje tylko `__sign` ze strony do tego URL, zachowuje options/prototyp/credentials. Nie loguje, nie wysyła na inny origin, nie zapisuje podpisu w storage. Nie podmienia już podpisanych ani innych URL. Bez podpisu zachowuje zachowanie natywne. Jest to sesyjny sekret HF, nie należy go kopiować do wiadomości ani plików.
- VAD: `src/capture.ts` → skompilowany `createCapture` → `MicVAD.new` → własna kopia ORT w głównym wątku. Biblioteka przypisuje `onnxWASMBasePath` do `ort.env.wasm.wasmPaths`. Nakładka zmienia tylko wartość tego jednego argumentu: helper fetchuje własny MJS, sprawdza HTTP/MIME/20856B/SHA `30dd851d…`, importuje Blob i zwraca `{mjs: blobURL, wasm: absolutny własny URL}`. W MAIN zapamiętuje sukces na życie strony, po błędzie pozwala ponowić. Threads1/proxyfalse pozostają. Poza dokładnym HF originem capture zachowuje pierwotny katalog runtime.

## Dowody i granice

`tests/hf-session.node.ts` + `tests/hf-adapter.node.ts`: 10/10 PASS, w tym zakres podpisu, obce URL, inne opcje, brak podpisu, ponowne ładowanie, retry po odmowie MJS i brak ujawnienia podpisu w błędzie.

`VAD-PROOF.json` / `vad-proof.mjs`: rzeczywisty lokalny Chromium/ORT/Silero/AudioWorklet, istniejące przypięte i sprawdzone SHA pliki. Oryginał zawodzi przy celowo zablokowanym bezpośrednim imporcie MJS; nakładka inicjalizuje VAD, startuje i pauzuje na generowanym strumieniu ciszy. W tej próbie tylko literał hosta HF zastąpiono localhostem; scope/signature badano oddzielnie na literalnym HF originie. Brak COI i ruchu zewnętrznego. Próba bez script-src blob odmawia przed WASM. To nie jest fizyczny mikrofon, rozpoznanie mowy, HF readiness ani odsłuch TTS.

Na realnym HF najpierw sprawdzić brak błędu importu i stan Słucham; dopiero za świadomą zgodą użytkownika fikcyjna wypowiedź → VAD → ASR → MT → lokalny TTS. Brak głosu systemowego nie może uruchamiać głosu chmurowego. Nie kasować470MB modeli ani danych całego originu. Jeżeli SW podaje stary capture, sprawdzić jego hash i odświeżyć wyłącznie własną powłokę, bez czyszczenia cache modeli. Tymczasowa diagnostyka nie jest częścią adaptera.
