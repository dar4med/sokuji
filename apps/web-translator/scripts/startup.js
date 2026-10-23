// Embedded before all relative assets. Its exact hash is allowed by the CSP.
(() => {
  const address = new URL(location.href);
  if (!document.querySelector("base")) {
    // A preview proxy may serve /preview/5180 without the canonical trailing slash.
    // Relative assets otherwise resolve to /preview/assets instead of /preview/5180/assets.
    const directory = !address.pathname.endsWith("/") &&
      !address.pathname.split("/").pop().includes(".");
    if (directory) address.pathname += "/";
    const base = document.createElement("base");
    base.href = new URL(".", address).href;
    document.head.append(base);
    // Service workers also need the page to be inside their directory scope.
    if (directory) location.replace(address.href);
  }

  document.documentElement.dataset.startup = "loading";
  let failure = "";
  const show = () => {
    if (!failure) return;
    const status = document.getElementById("status");
    const error = document.getElementById("error");
    const retry = document.getElementById("retry-startup");
    if (!status || !error || !retry) return;
    status.textContent = "Nie udało się uruchomić aplikacji.";
    error.textContent = failure;
    error.hidden = false;
    retry.hidden = false;
  };
  const fail = (text) => {
    if (document.documentElement.dataset.startup !== "loading") return;
    failure = text;
    document.documentElement.dataset.startup = "error";
    clearTimeout(timer);
    show();
  };
  const timer = setTimeout(() => fail(
    "Uruchamianie trwa zbyt długo. Sprawdź połączenie i załaduj stronę ponownie. W podglądzie sprawdź, czy serwer aplikacji działa na porcie 5180.",
  ), 20000);
  window.addEventListener("app-startup-complete", () => clearTimeout(timer));
  window.addEventListener("error", (event) => {
    const target = event.target;
    if (target instanceof HTMLScriptElement ||
        (target instanceof HTMLLinkElement && target.rel === "stylesheet")) {
      fail("Nie pobrano plików JavaScript lub CSS aplikacji. Sprawdź adres podglądu i połączenie, a następnie załaduj stronę ponownie.");
    } else if (event instanceof ErrorEvent) {
      fail("Wystąpił błąd podczas uruchamiania aplikacji. Załaduj stronę ponownie. Szczegóły są dostępne w konsoli przeglądarki.");
    }
  }, true);
  // DOMContentLoaded may itself be waiting for a stalled module download.
  document.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("#retry-startup"))
      location.reload();
  });
  document.addEventListener("DOMContentLoaded", show);
})();
