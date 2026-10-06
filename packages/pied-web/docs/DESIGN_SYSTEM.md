# Shared Mail components

The main list, reader and composer already use Pied Web tokens. Release 1.10.23
extends that vocabulary to native settings and popups without replacing their
models, controls, command handlers or transport. This follows the 2026-10-06
design audit and Robin's one-pixel border/focus decision.

## Roles

| Primitive | Contract |
| --- | --- |
| Field | 1px neutral border, stronger `--pw-focus` on the same boundary, 6px radius |
| Text | 14px desktop field/label, 16px narrow field, 18px section, 20px dialog title |
| Button | Weight 500, 6px radius, primary completion distinct from secondary utilities |
| Target | Compact 32px, standard 36px, coarse pointer 44px; popup close always 44px |
| Surface | Tokenized elevation, no native drop-shadow or extra border on its ring |
| State | Primary fill and text ink separated; semantic danger/success/warning/info ink and tint |
| Mobile form | Label above control below 800px; shrinkable fields, wrapping account names |
| Icons | SVG masks for close, menu, delete, playback, subscription and recurring state actions |

`components.css` loads last after feature sheets. Received message bodies,
visual/source/Markdown editor contents and third-party frames are excluded.
One-pixel attachment drop/contact selection borders remain explicitly covered.
Measured toolbar geometries, native resizers, special attachment glyphs and
the deliberately square account scope are feature-owned exceptions.

## Native lifecycle

`native-components.js` listens to the existing `rl-view-model` event after
bindings and `onBuild`. It associates adjacent labels, covers async components,
names icon actions, adds keyboard activation and exposes save feedback as text.
It preserves bound nodes and native click/command handlers. Wrapped labels keep
their checkbox ownership; native hyperlinks and onEnter/onSpace are not doubled.
Observers are local to settings/popups and disposed with Knockout. The main
workspace, SettingsPane container and composer retain their existing adapters.

Account/identity sorting uses the native observable arrays and existing
`accountsAndIdentitiesAfterMove` callback. Alt+Up/Down moves one adjacent item,
keeps focus and cannot cross the principal account. It performs no mail mutation.
Cryptographic and Sieve operations remain native and are not submitted by tests.

## Verification

Run the monorepo `tools/test.sh`, then the browser scripts documented in
`tests/README.md`. `test-native-components.js` exercises native markup, exported
Knockout binding accessors and fictional transport at 1440/390/320px, light/dark.
It validates late names, one-pixel focus with strong contrast, panel overflow,
explicit deletion confirmation and keyboard sort persistence.

The additional static sweep covers all 48 User/Common/Components templates in
two themes and two widths; conditional branches can coexist and are not a live
submission. Actual authenticated settings and popup geometry must be verified
after installation, especially on this host with LiteSpeed OPcache.

This is a shared component contract, not a claim that every provider, crypto
branch, screen reader or physical phone has been certified.
