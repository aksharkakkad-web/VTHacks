# Beacon trip progress — image concepts

Generated with the built-in Imagegen tool, September 19, 2026. These are raster mockups with original embedded artwork, not implemented PWA screens or standalone illustration exports.

## Sequence

Home → availability → comparison → existing recommendation + Go → provider identity verification → authorization → coordination.

These four screens are status states, not four new user-confirmation steps. Keep exact location withheld until identity, policy authorization, and the existing user plan confirmation have all passed. Trusted-contact data is not provider data. Show Demo preview for simulated flows. No fabricated prices or pickup estimates were added.

## Research

- Existing task: List Beacon screens in order; inspected current conversation and saved finding/recommendation reference images.
- Repository: PRD sensitive-data gate and confirmation sections, START_HERE, TEAM_CONTRACT, phase plan, Git workflow, previous UI review log.
- [Mobbin Uber booking flow](https://mobbin.com/explore/flows/c54d8dfb-8f67-4e82-afb6-7943d8886c5b): public flow metadata available; full screenshot library not reviewed. Reinforces separate planning, confirmation, and tracking states.
- [Dribbble ride booking concept](https://dribbble.com/shots/27309852-Ride-Booking-App-UI-UX-Design-Taxi-Mobility-App): public design description reviewed for hierarchy and route comparison. No artwork copied.
- [Pinterest minimal ride booking](https://in.pinterest.com/pin/855683997955724689/): search lead found; direct page returned 403, so not treated as a reviewed visual reference.
- [Uber booking UX](https://www.uber.com/se/en/blog/web-booking-flow/): official discussion of clear destination/options/selection and understandable first-time flows. Applied plain-language statuses and restrained choices.

The visually inspected local references remain the source of palette, typography, phone framing and illustration style.

## Review and refinements

All four initial images were visually inspected. Each received a targeted second generation and another visual review.

1. Availability: initial headline compressed. Revised to two lines, moved rings next to pending labels and added mode icons. Third pass corrected an erroneous train icon to a city bus. Final: all providers pending, no false availability or identity checks.
2. Comparison: initial heading compressed and progress detached from preferences. Revised to two lines and a mint progress footer inside the card. Final: constraints remain constraints, no premature winner.
3. Provider: initial heading compressed, duplicate illustration spinner and redundant copy. Revised two-line title, single active status band, removed decorative spinner and redundant line. Final: identity still pending, exact location not shared.
4. Authorization: original headline and arrow suggested data transfer already occurring. Revised to Preparing your trip, removed connecting arrow, emphasized pending access and increased privacy copy size. Final: identity confirmed while authorization and exact-location release remain pending.

## Implementation handoff

Keep UI text, cards and controls native when implementing; do not use these entire phone mockups as page backgrounds. Original illustrations are embedded in each concept. Regenerate/extract art separately for implementation. Cancel must remain actionable; do not force artificial waiting durations. Maintain legible mobile type, minimum 44px hit areas and reduced-motion behavior. No live integration or responsive implementation testing was performed in this image-only task.

## Exact prompt set

### 01-availability

Initial:

Use case: ui-mockup. Generate ONE polished 1024x1536 portrait Beacon mobile screen, straight-on black iPhone frame on ivory surround matching supplied reference. Preserve exactly the reference visual language: ivory screen, deep forest almost-black rounded sans serif large typography, mint active rings, rounded white card, subtle shadows, custom soft grain sage campus illustration with pale butter sun. Beacon round winding-path logo and wordmark centered top. Large readable title then one short subtitle. Illustrative scene in middle, one card below, consistent bottom home label and Cancel text action with generous hit space. No dashboard, no technical jargon, no percentage, no marketing slogan on flags or vehicles. Custom scene must serve the state rather than repeat existing bus. Small quiet 'Demo preview' under logo. All UI text legible, no invented travel estimates. Keep existing phone geometry. Headline 'Checking nearby rides.' Subtitle 'Finding available options.' Custom artwork: small sage campus shuttle and understated car on winding campus road, no people or exact-location pins. White panel 3 rows: active mint incomplete ring 'Campus Ride' with right label 'Checking'; active ring 'Independent Ride' right 'Checking'; active ring 'Transit' right 'Checking'. Below panel lock icon and 'Exact location stays private.' Footer 'Home: Pritchard Hall', then 'Cancel'. No checkmarks because availability pending.

Refinement:

Refine this Beacon availability screen. Preserve exactly the phone, logo, ivory/forest/mint palette, custom campus shuttle-and-car artwork, card, and all privacy/footer copy. Improve only typography and status hierarchy: replace the squeezed single-line title with a generous centered two-line heading, exact line 1 'Checking' line 2 'nearby rides.' Use readable rounded bold sans, not compressed. Make room by reducing illustration height slightly while keeping it beautiful. Provider rows use small simple bus/car/transit icons instead of three large competing spinners. Keep each right-hand 'Checking' label with one small incomplete mint ring next to it. Ensure all three rows remain pending, no checkmarks. Increase Demo preview text contrast to slate gray. No additional text.

### 02-comparison

Initial:

Use case: ui-mockup. Generate ONE polished 1024x1536 portrait Beacon mobile screen, straight-on black iPhone frame on ivory surround matching supplied reference. Preserve exactly the reference visual language: ivory screen, deep forest almost-black rounded sans serif large typography, mint active rings, rounded white card, subtle shadows, custom soft grain sage campus illustration with pale butter sun. Beacon round winding-path logo and wordmark centered top. Large readable title then one short subtitle. Illustrative scene in middle, one card below, consistent bottom home label and Cancel text action with generous hit space. No dashboard, no technical jargon, no percentage, no marketing slogan on flags or vehicles. Custom scene must serve the state rather than repeat existing bus. Small quiet 'Demo preview' under logo. All UI text legible, no invented travel estimates. Keep existing phone geometry. Headline 'Finding your best route.' Subtitle 'Matching your preferences.' Custom artwork: two gently winding campus paths around trees, one mint one pale sage, no winner badge or precise map labels. White card eyebrow 'YOUR PREFERENCES'; three large rows, simple line icons: 'Up to $10', 'Less walking', 'Fewer transfers'. Below card incomplete mint ring with 'Comparing available routes…'. Footer 'Home: Pritchard Hall', then 'Cancel'. Do not imply recommendation finished.

Refinement:

Refine this Beacon route comparison screen, preserving exactly the frame, logo, ivory/forest/mint palette, forked campus paths illustration, all three preferences and footer. Fix squeezed headline and weak active-state hierarchy. Replace headline with centered two lines exact 'Comparing' / 'your routes.' same bold rounded sans as approved design, generous spacing. Subtitle remains 'Matching your preferences.' Reduce artwork height modestly to fit. Move 'Comparing available routes…' and its spinner into a pale mint footer strip INSIDE the preferences card below the three preference rows. Use a smaller incomplete ring, left aligned. The preferences remain saved constraints, never green success checks or winner badges. Keep Home: Pritchard Hall and Cancel in their original positions. Keep Demo preview readable slate gray. Do not add text.

### 03-provider

Initial:

Use case: ui-mockup. Generate ONE polished 1024x1536 portrait Beacon mobile screen, straight-on black iPhone frame on ivory surround matching supplied reference. Preserve exactly the reference visual language: ivory screen, deep forest almost-black rounded sans serif large typography, mint active rings, rounded white card, subtle shadows, custom soft grain sage campus illustration with pale butter sun. Beacon round winding-path logo and wordmark centered top. Large readable title then one short subtitle. Illustrative scene in middle, one card below, consistent bottom home label and Cancel text action with generous hit space. No dashboard, no technical jargon, no percentage, no marketing slogan on flags or vehicles. Custom scene must serve the state rather than repeat existing bus. Small quiet 'Demo preview' under logo. All UI text legible, no invented travel estimates. Keep existing phone geometry. Headline 'Confirming your provider.' Subtitle 'Checking who runs your ride.' Custom artwork: campus shuttle alongside a stylized provider identity card with a simple bus symbol and incomplete mint ring, no checkmark or completed shield. White panel title 'Campus Ride'; active ring row 'Checking provider identity'; quiet lock row 'Exact location not shared'. Below panel 'Your ride choice is saved.' Footer 'Home: Pritchard Hall', then 'Cancel'. No approved or verified badge yet; booking not complete.

Refinement:

Refine this Beacon provider confirmation screen. Preserve frame, logo, exact forest/ivory/mint palette and sage shuttle artwork. Fix compressed title: use centered two lines 'Confirming' / 'your provider.' in spacious bold rounded sans. Subtitle stays 'Checking who runs your ride.' Shorten illustration slightly to accommodate. Remove the large redundant spinner from illustrated identity card; keep bus symbol and neutral lines on that illustrated card. In the real white UI panel keep Campus Ride header, then emphasize 'Checking provider identity' in a pale mint band with the ONLY incomplete ring. Keep gray lock and 'Exact location not shared' below. Remove redundant sentence 'Your ride choice is saved.' Leave generous whitespace, Home: Pritchard Hall and Cancel unchanged. Demo preview must be readable slate gray, not pale gray. No verified badge or success check anywhere.

### 04-authorization

Initial:

Use case: ui-mockup. Generate ONE polished 1024x1536 portrait Beacon mobile screen, straight-on black iPhone frame on ivory surround matching supplied reference. Preserve exactly the reference visual language: ivory screen, deep forest almost-black rounded sans serif large typography, mint active rings, rounded white card, subtle shadows, custom soft grain sage campus illustration with pale butter sun. Beacon round winding-path logo and wordmark centered top. Large readable title then one short subtitle. Illustrative scene in middle, one card below, consistent bottom home label and Cancel text action with generous hit space. No dashboard, no technical jargon, no percentage, no marketing slogan on flags or vehicles. Custom scene must serve the state rather than repeat existing bus. Small quiet 'Demo preview' under logo. All UI text legible, no invented travel estimates. Keep existing phone geometry. Headline 'Sharing only what’s needed.' Subtitle 'Setting access for this trip.' Custom artwork: subtle sage closed lock between a home pin and shuttle, in soft campus landscape. White card title 'Campus Ride'; small mint check row 'Provider identity confirmed'; divider; incomplete ring row 'Authorizing trip access…'; two quieter rows 'Pickup & destination' right 'Pending'; 'Trusted contact' right 'Not shared'. Below card 'Exact location stays private until approved.' Footer 'Home: Pritchard Hall', then 'Cancel'. Identity check done but authorization pending: never claim location shared or trip booked. No extra user approval button.

Refinement:

Refine Beacon authorization mockup. Preserve phone, logo, forest/ivory/mint palette, same soft sage illustration style, Campus Ride card and footer positions. Crucial semantic correction: replace headline with two centered lines 'Preparing' / 'your trip.' Subtitle 'Sharing only after approval.' In illustration REMOVE the dashed connecting line and arrow completely, keep closed padlock between the two separate home and bus landmarks: no visual suggestion of location already transmitted. In card preserve mint check 'Provider identity confirmed', keep spinner 'Authorizing trip access…' but place this pending row on a pale mint band for primary emphasis. Preserve rows 'Pickup & destination' / 'Pending' and 'Trusted contact' / 'Not shared'. Change small explanatory line below card to larger readable 'Your exact location is still private.' Home: Pritchard Hall and Cancel remain. No approval button, no verified trip claim. Make Demo preview slate gray.

Availability icon correction:

Make one precise correction only to this Beacon UI image: in the white availability card, the icon immediately LEFT OF 'Transit' currently depicts a train with rail tracks. Replace ONLY that icon with a small front-facing forest-green CITY BUS with two visible rubber wheels and absolutely NO rails or railway ties. Match scale and illustrated style of existing Campus Ride icon but single windshield. Preserve every other pixel/composition/text/phone/headline/illustration/spacing/status and color as closely as possible.

