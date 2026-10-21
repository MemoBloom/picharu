# Approved synthetic effect demonstrations

Version: v1, 2026-10-21. The user approved these six imagegen before/after pairs for website integration. They are fictional AI-created subjects, not private user photos or outputs from the production generation provider.

Each folder contains a 1000×1000 WebP result (`after.webp`) and its actual input (`before.webp`). The avatar input reuses `/images/samples/cafe-woman-v1.webp` instead of duplicating it.

| Folder | Tool |
|---|---|
| cafe-woman-v1 | ai_avatar |
| background-person-v1 | change_background |
| hair-color-brown-v1 | hair_color |
| pet-cat-v1 | pet_illustration |
| product-mug-v1 | product_background |
| room-living-v1 | room_redesign |

Source and compressed-file hashes are recorded in the repository's `docs/design/EFFECT_DEMO_ASSETS.json`. Public presentation metadata lives in `src/lib/effect-demo-catalog.ts`. Keep actual input/result pairing and the imagegen demo attribution when reusing these files. Full execution prompts and private experiments do not belong in this directory. Asset approval does not establish production-model evaluation, indexing approval or deployment.
