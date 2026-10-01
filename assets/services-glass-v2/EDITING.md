# Service artwork: store watermark removal

Edited on 2026-10-01 using the built-in image generation/editing tool (no CLI/API fallback).

The complete 41-service image collection was inspected. Store-name lettering appeared in 16 illustrations. Each affected illustration was edited individually, visually reviewed, and exported as two square WebP assets: `<id>.webp` at 480 px and `<id>-desktop.webp` at 960 px. Existing URLs remain valid, including catalog entries already saved in Firebase.

Affected IDs:

`app-store`, `campaigns`, `chatgpt`, `courses`, `facebook-ads`, `facebook-pages`, `instagram-ads`, `music`, `online-buy`, `pubg-vietnam`, `roblox`, `snapchat-ads`, `social-setup`, `tiktok-ads`, `tiktok`, `websites`.

## Final prompt set

The edit prompts used this common specification, with the location instructions below applied to the corresponding illustration:

> Use case: precise-object-edit. Edit target: this existing square website service illustration. Remove ALL occurrences of the store watermark lettering 'Keno Store', 'KENO STORE', 'Keno', 'كينو ستور' from this image and remove any small decorative shopping-bag/store symbol immediately attached to that lettering on the front of the pedestal. Seamlessly reconstruct the original curved glass pedestal surface and its blue/teal/violet reflections underneath the removed lettering. The cleaned pedestal must be blank and unbranded. Change ONLY the watermark area; preserve the main service logo/icons, objects, exact composition, colors, glass rounded frame, lighting, dark background, perspective and image framing. Keep recognizable service branding elsewhere. No replacement text, no extra lettering, no watermark anywhere. Produce a single clean square image.

Location-specific instructions:

- Pedestal lettering: remove the accompanying decorative bag, lock, store mark, or bar-chart symbol; reconstruct a blank curved glass front with matching reflections.
- `online-buy`: remove the large lettering and yellow smile mark from the orange shopping bag; reconstruct a plain orange bag while preserving its handles, shape, shading, highlights, shopping cart, payment card, and cursor.
- `social-setup`: remove both occurrences, on the social profile and on the pedestal, plus the pedestal leaf symbol. Replace the profile title with a pale blue UI placeholder bar. Preserve the avatars, photos, calendar, gear, and profile layout.
- `pubg-vietnam`: remove the spaced pedestal lettering while preserving the PUBG logo, helmet, UC currency, and Vietnam flag.

Validation: all edited outputs were visually inspected; existing service-art checks passed for image formats, size budgets, catalog paths, and mobile artwork behavior. No store-name overlays were introduced.
