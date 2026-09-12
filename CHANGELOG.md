# Releases

## 1.6.5, 2026-09-12

First standalone distribution of the complete Pied Web customization. Plugin and compiled theme are byte-identical to the validated deployed baseline. Repository packaging adds no production behavior change.

Includes the accumulated navigation, reader, filtered-selection, swipe/keyboard, background Undo Send, Markdown, toolbar and image improvements. The account unread correction remains a separate upstream patch.

Image release validation before packaging: 22 native image/attachment checks, 11 edge cases, 23 toolbar regression checks and 25 Markdown checks. Actual Squire/HtmlEditor, native attachment callbacks and serialization were used with synthetic data and mocked transport. Responsive previews were checked at 1280/390/320 pixels, including dark mode. No authenticated live-mail browser or real mail operations were used for these checks.

Repository validation additionally checks byte-identical payloads, reproducible theme generation, syntax, read-only upgrade diagnostics and filtered-selection behavior. Future releases should update the version matrix only after verifying compatibility.
