---
title: Med Partners Translator Test
emoji: 🗣️
colorFrom: green
colorTo: blue
sdk: static
app_file: translator-test/index.html
custom_headers:
  cross-origin-opener-policy: same-origin
  cross-origin-embedder-policy: require-corp
  cross-origin-resource-policy: same-origin
---

Private test of the existing local PL/NL/EN translator. Set **Private** visibility
in the Hugging Face UI; this README does not configure visibility or access roles.

Upload the existing static files under `translator-test/`, preserving their paths.
Do not upload Apache `.htaccess`, `.htpasswd`, credentials, recordings or history.
No Docker, Gradio, runtime server, app build, Secrets or client-side authentication.
Access control is provided by the private Space and the owner's Hugging Face login.
