---
workflow: motion-graphics
flow: automation
storyboard: no
message: "Beacon turns a route into a clear point of arrival."
destination: "in-app splash screen"
aspect: "near-square transparent logo overlay"
language: "none"
audience: "first-time Beacon mobile users"
length: "3.2 seconds"
category: "logo-reveal"
---

## Intent

Rebuild the supplied Beacon logo animation as a calm, premium app-opening sting. Preserve the exact mark and wordmark. The route grows continuously from the lower-left opening toward the destination pin; the pin settles cleanly; the finished lockup holds.

## Timing

- 0.00–0.35s: complete ring and wordmark hold so the eye can land.
- 0.35–1.95s: route draws at a measured pace with eased acceleration and a long settle.
- 1.70–2.30s: location pin reveals and settles with no bounce and no opacity fade.
- 2.30–3.20s: dead-static final lockup hold.

## Assets

Use the exact local brand layers derived from the supplied animation: base, road, pin, and final artwork.

## Customizations

- Hyperframes blueprint: `logo-assemble-lockup`, static-frame `Brand_Outro` variant.
- Motion rules: SVG path draw plus a critically damped pin settle.
- Remotion owns the final 60 FPS transparent browser asset.

## Constraints

- Transparent background at 1035 × 990.
- No fade-out, route redraw, bounce, glow, loop, sound, or UI chrome inside the motion asset.
