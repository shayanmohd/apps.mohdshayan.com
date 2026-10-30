# Noor Hidayah public site

Canonical marketing pages live at `https://apps.mohdshayan.com/noor-hidayah/`.
The app repository retains its authenticated services, dynamic operator directory,
certificate verification and account-deletion form.

The dated 25 October 2026 improvement blueprint supplies the seven-section homepage.
The older, undated Complete Website Blueprint supplies background only where it does
not conflict. The approved final artwork and A+C app screens take precedence over its
old wordmark and illustrative screens. This website is English; the app supports
English, Hindi, Urdu and Kashmiri. No Arabic interface or completed human translation
review is claimed.

The canonical privacy notice also describes the revised ratings-comment audience and
separate sample-data builds. These factual data-flow updates retain its legal-review-pending
status and add no retention period or legal-basis claim. The ratings implementation owner
checked the required/optional scores, three-visible-rating threshold and acknowledgement boundary.

The site uses static HTML and CSS, a native disclosure menu, self-hosted Mukta fonts,
and no scripts, analytics, cookies, third-party embeds or marketing submission form.
Launch interest and partnership CTAs open a contact page with an explicit email action.
No message is sent by this site. No app-store badge, operational metric, child delegation
or formal in-app complaint capability is advertised.

## Build and check

```sh
python3 noor-hidayah/tools/build.py
python3 noor-hidayah/tools/check.py
python3 -m http.server 4179 --bind 127.0.0.1
```

The generator owns the six HTML files and the scoped sitemap. Edit its content and
`assets/site.css`, then regenerate. The older `privacy-policy.html` compatibility file
continues to redirect to the canonical privacy notice.

`tools/terms-source.json` is an exact JSON export of the app repository's existing
`apps/web/src/content/legal/terms.ts` at main `bbf82c4e`, with its shared constants
resolved. The generator preserves the wording and 26 October 2026 date, displays
"Draft for legal review. Not yet in force.", and sets `noindex`. Only links move to
canonical destinations. This migration does not approve the terms.

## Asset provenance

- The logo, favicon and app icon are faithful exports of the user-supplied `ALAM.ai`.
  Original SHA-256: `b75648f30ff77c323c7f77e06e0ad6bffc402b2cda13ab77bfbcca3354b9622c`.
  Copied from the reviewed app design branch `ccbe3a3d`, now merged in `bbf82c4e`.
  Its Poppler/librsvg export instructions remain in the app's `assets/mark/README.md`.
- Home, Umrah, Hajj and Services images are actual app renders from the same design
  worktree's `pilgrim_design_screenshots_test.dart`, English at normal text scale.
  Data is synthetic test data, described as such beside the gallery. No UI is fabricated.
- Responsive WebP copies use libwebp `cwebp` 1.6.0, quality 82, widths 360 and 720:
  `cwebp -q 82 -resize 360 0 input.png -o output-360.webp`.
- Mukta Latin weights 400, 600 and 700 come from the app's pinned `@fontsource/mukta`
  5.3.0 package. Its SIL Open Font License is retained in `assets/fonts/LICENSE-Mukta.txt`.

## Release order

Hold this branch until the remaining app integrations are ready and root has reviewed
its claims against enabled production behavior. Publish this canonical site first and
verify the new destinations. Only then merge the app's public-support cleanup, which
redirects old privacy, support, company and terms routes here. Do not redirect the
functional account-deletion form or the dynamic directory/verification routes.

## Verification on 30 October 2026

- The generator and local link/asset/fragment checks passed for all six generated pages.
  Draft terms remain noindex and are excluded from the scoped sitemap.
- All six pages passed browser overflow and axe WCAG A/AA checks at desktop 1440px,
  mobile 390px, 320px with 200% text, and dark 390px with 200% text: 24 checks.
  The mobile disclosure menu and launch-interest destination were exercised directly.
  The updated privacy notice passed the same four viewport/theme checks, with no
  horizontal overflow or WCAG A/AA violations.
- One local Lighthouse mobile run scored performance 97, accessibility 100,
  best practices 100 and SEO 100. LCP was 2.493 seconds, FCP 1.227 seconds,
  CLS 0.0028 and total blocking time 0 milliseconds. Hosted measurements may differ.
- Root independently reviewed the desktop/mobile homepage captures, final supplied
  artwork and real app screenshots. The narrow 200% layout was also inspected.
