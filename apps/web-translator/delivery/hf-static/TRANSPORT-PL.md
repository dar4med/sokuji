# Mały adapter pobierania modeli — przegląd przed zmianą HF

`hf-download-adapter.js` ładować jako zewnętrzny self script **przed** modułem aplikacji, zastępując tymczasowy diagnostyczny wrapper po zakończeniu testów. Nie nadpisywać całego aktualnego index kopią ze starym CSP; wystarczy jedna linia:

```html
<script src="./hf-download-adapter.js"></script>
```

Adapter działa wyłącznie na `https://dar4med-med-partners-translator-test.static.hf.space`, dla GET do kanonicznego własnego `/models/<id>/<path>`, bez query, fragmentu, userinfo, dodatkowych nagłówków i body, z jawnym `credentials: same-origin` oraz `redirect: error`. Zmienia tylko ten redirect na follow; cache/signal/credentials pozostają te same. Inne hosty, ścieżki, Request objects i opcje pozostają nietknięte.

Końcowa odpowiedź musi pochodzić z tej samej ścieżki własnego originu lub z dokładnie `https://us.aws.cdn.hf.co/xet-bridge-us/`. Inne/opaque odpowiedzi są anulowane i odrzucane stałym komunikatem bez URL. Nie czyta treści, nie loguje URL/headers/credentials, nie zapisuje podpisanych adresów. Istniejący downloader nadal sprawdza rozmiar, SHA-256, timeout i pełny plik przed cache.

**Kontrola końcowego URL następuje po żądaniu.** Nie blokuje wcześniejszego połączenia do pośredniego originu. Dlatego warunkiem docelowego użycia jest wąskie CSP tego hostingu: `connect-src 'self' blob: https://us.aws.cdn.hf.co`; bez18-originowej listy i bez wildcardów. Pozostałe dyrektywy nie są rozszerzane. CDN potwierdzono zarówno w rzeczywistej próbie koordynatora na HF, jak i HEAD publicznego odpowiednika modelu (Hub302 → us.aws.cdn.hf.co200, ACAO*). To serwowanie pliku, nie inference API.

Lokalne testy `tests/hf-adapter.node.ts`: 5/5 PASS — zakres, niezmienione opcje, odrzucenie obcych celów, anulowanie odpowiedzi, zachowanie błędów native fetch. Pełny tekst na HF jeszcze czeka na naprawę importu runtime w workerze; patrz `worker-runtime/README-PL.md`. Nie wykonano żadnego zapisu do HF. Zgłoszona przez koordynatora blokada auto-review dotycząca HF Space main pozostaje obowiązująca; nie obchodzimy jej inną gałęzią ani metodą publikacji.
