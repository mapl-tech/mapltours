# MAPL Tours — Automated Blog Generation

> Read by a scheduled Claude agent (see `schedule list`). Each run produces **one** new blog post for MAPL Tours Jamaica and appends it to `lib/blog.ts`.

---

## 1. What the agent must do each run

1. Read this file in full.
2. Read `lib/blog.ts` to see all existing posts (titles, slugs, keywords already covered).
3. Pick **one** keyword or tightly related keyword cluster from section 3 below that has **not** been used by an existing post (or that was covered thinly and can be improved). Prefer high-intent tour/excursion and location-specific keywords over generic ones.
4. Draft a new blog post following the structure in section 4.
5. Append a new `BlogPost` entry to the `BLOG_POSTS` array in `lib/blog.ts`, preserving the existing style and type signature exactly.
6. Commit the change on a branch `blog/auto-<slug>` with message `add: automated blog post — <title>` and open a PR titled the same. Do **not** merge automatically — a human reviews before publish.
7. Log which keyword was used, so the next run skips it.

Never overwrite or rewrite an existing post in an automated run. Updates to existing posts happen only when a human explicitly requests it.

---

## 2. Brand voice (non-negotiable)

- Tagline: **"Discover Jamaica Beyond the Resort."**
- Tone: confident, warm, local — not a travel agency. "Your Jamaican cousin who knows everywhere."
- Copy: short, sensory, punchy. "Jump from legendary cliffs." Not "Enjoy our cliff-diving experience."
- No clickbait, no superlatives that aren't earned, no generic AI phrasing ("nestled in", "hidden gem", "a must-visit").
- Sign-offs and CTAs should feel editorial, not salesy.
- Currency USD. Dates in "Month Day, Year" format.

If a draft reads like a press release or a resort brochure, rewrite it.

---

## 3. Keyword bank (pick one per run)

Prefer keywords further down this list — they are higher-intent and less competitive. Never use a keyword twice.

### Tours & excursions (highest priority)
- dunn's river falls tour
- jamaica excursions
- montego bay tours
- airport transfer Ocho Rios
- cannabis wellness retreat Jamaica
- gastronomy tour Kingston Jamaica
- medical tourism Jamaica endocrine care
- Westmoreland eco-cottage Jamaica
- Jamaica cannabis culinary tour
- concierge medical travel Jamaica
- CBD spa Jamaica
- ganja farm tour Ocho Rios

### Location-specific
- ocho rios jamaica
- hotels in ocho rios
- villas in ocho rios
- montego bay jamaica
- montego bay airport
- negril jamaica
- negril beach
- breathless montego bay
- secrets wild orchid montego bay
- jewel grande montego bay
- azul beach resort negril

### Accommodation & resorts
- jamaica all inclusive resorts
- sandals jamaica / sandals montego bay / sandals negril / sandals ochi
- moon palace jamaica
- bahia principe grand jamaica
- riu montego bay / riu ochorios / riu negril
- royalton negril
- beaches ocho rios

### General travel (use sparingly — most competitive)
- jamaica
- montego bay
- kingston jamaica

**Placement rules:** use the chosen keyword in the `title`, the first paragraph of the `body`, at least one `h2`, and the `excerpt`. Never stuff — if it doesn't fit naturally, rewrite the sentence.

---

## 4. Post structure

### Required fields (match existing `BlogPost` interface in `lib/blog.ts`)

- `slug` — kebab-case, ≤ 60 chars, derived from the title. Must be unique.
- `title` — 50–70 chars, contains the target keyword, written like a headline, not a question.
- `excerpt` — 140–160 chars, contains the keyword, reads like a deck line (not a meta description).
- `category` — one of `Stories | Guides | Food | Culture | Adventure`. Pick what the content actually is.
- `image` — use `DESTINATION_IMAGES[...]` from `lib/experiences.ts` when the topic maps to a known destination. Only use a new Unsplash/Pexels URL if nothing fits; it must be verifiably a Jamaica photo.
- `readTime` — integer minutes; calculate as `ceil(wordCount / 220)`.
- `publishedAt` — today's ISO date (YYYY-MM-DD) at run time.
- `author` — pick from the existing `devon | maya | andre | simone` authors. Match the beat: Devon for food, Maya for culture, Andre for essays/stories, Simone for guides.
- `featured` — omit (only editors flag featured posts).
- `body` — array of blocks (see below). Word count **800–1,200 in the body text combined** (count `p`, `quote.text`, and `list.items` strings).
- `relatedSlugs` — 2 existing slugs that share category or destination.

### Body block order (guideline, not rigid)

1. `p` — opening paragraph. Hook with a sensory image or a concrete scene. Contains the keyword. No "welcome to" or "in this post".
2. `p` — second paragraph, set context.
3. `h2` — first section heading, keyword variation.
4. 2–3 `p` blocks under that heading.
5. `quote` — a line from a guide, vendor, or local voice with `attribution`. Can be composed, but must sound real and specific. Never from a celebrity.
6. `h2` — second section heading.
7. `list` — 3–5 items: tips, what-to-bring, best-times, nearby spots, etc.
8. 1–2 more `p` blocks.
9. `h2` — "What it costs" or "How to book" or similar practical section.
10. `p` — close with a concrete next step. Link conceptually to `/explore` or a specific experience page (but do not embed HTML anchors — copy only).

### SEO hygiene
- Use H2s (`type: 'h2'`) only — no H3s exist in the block schema.
- Avoid keyword stuffing. Target keyword density ≤ 2%.
- Use related terms (e.g., if the keyword is "dunn's river falls tour", also mention "Ocho Rios", "waterfall climb", "St. Ann").
- Always include at least one concrete price or duration number — useful for AI snippets and Google's rich results.

---

## 5. Originality and accuracy

- Do not copy text from other sites. Every sentence is original.
- If you reference a price, duration, location, or historical fact, it must be factual and verifiable. When unsure, use a range ("around $40–60") rather than inventing precision.
- Cite MAPL's own experiences (by title, linkable via `/experience/<slug>`) where the post naturally supports a booking — but do not turn the post into an ad. A good post earns its booking link by being useful first.
- Never invent creators, quotes attributed to real people, or statistics.

---

## 6. Handoff

After writing:
- Ensure `npx tsc --noEmit` passes.
- Run `npm run build` if a build is set up.
- Push the branch and open the PR. Include in the PR body:
  - The keyword used.
  - Word count.
  - Which `DESTINATION_IMAGES` key (if any) was used.
  - Any facts that need human verification before merge.

A human reviewer merges.

---

## 7. Updating existing posts (manual only)

Automated runs do **not** update existing posts. When a human asks for a refresh:
- Pick 1–2 keywords from section 3 that fit the existing subject.
- Revise title and intro to include them naturally.
- Add new information (current prices, seasonal detail, an extra section) — don't just reword.
- Update `publishedAt` only if the post is substantially rewritten.
- Verify facts.
