# GD / Global Digital Services Role-Profile Catalogue

Use this reference **during `RunPreInterviewDiscovery` (before `save_discovery`)** whenever the interviewee works in — or likely belongs to — **Global Digital Services (`GD`)**.

## Recognizing a GD employee

Employees rarely write out `"Global Digital Services"` or `"GDS"`:

- **Common names:** `"GD"`, `"Global Digital Services"`, `"Digital Services"`, or `"Digital Solutions"`.
- **Org codes (in `directoryProfile.department`, email signatures, or user answers):** any org code starting with **`GD`**, often followed by a third letter and `/...` (e.g. `GD`, `GDA`, `GDB`, `GDD`, `GDE`, `GDF`, `GDS`, or `GDA/X`, `GDD/A`, etc. — note that `GDS` specifically is the Cyber Security sub-unit inside `GD`).
- **Role is the real discriminant:** people often use informal working titles rather than HR naming conventions. As long as they are within `GD` (or in a digital/IT role where `GD` may apply), fetch the catalogue during discovery and check **Page 2** (the overview of all available role profiles) to see which role applies.

---

## Step 1 — Fetch the catalogue directly from its URL during Discovery (NO search)

1. **Fetch once during `RunPreInterviewDiscovery` (after prefill if enabled, before `save_discovery`):**
   - Catalogue SharePoint URL: `{{GDS_ROLE_CATALOGUE_SHAREPOINT_URL}}`
   - Perform a direct, targeted fetch of that exact URL (resolve that URL directly and pass its returned `driveId` and `driveItemId` to `get_file`). **Do not call `search_files`, `search_sharepoint`, or `search_sites` to search for this document.**
2. **Check Page 2 (Role Overview) first:**
   - Read **Page 2** of the PDF, which lists all available role profiles in the catalogue, and map the interviewee's stated role and responsibilities to the closest profile(s) on Page 2.
   - Open and read **only that matched role's single page** (or 2 pages if they span two profiles). Do not read or summarize the rest of the PDF.
   - If two profiles on Page 2 look plausible or their title is ambiguous, ask a natural follow-up question during discovery to clarify which fits their seat better — never demand that they know the official HR title.
   - If no role on Page 2 fits, continue with the standard interviewing framework without the catalogue.
3. **Keep it in the background:** do not recite the catalogue back to the user. Use it to inform discovery follow-ups and question generation.

---

## Step 2 — Extract the role's structure (during Discovery)

From the matched role-profile page, note:

- **Focus-area weights (percentages):** the split across Technical, Consulting, Strategy, Collaboration, Leadership (or the role's specific dimensions).
- **Role description, responsibilities, goals, and prerequisites/expectations:** how the catalogue translates those focus areas into day-to-day work.
- **Dimensions, specialization areas, and capability progression:** the skills expected at *starting in the role*, *increasing expertise*, and *strong developed expertise* (color-coded by category to match the focus areas).
- **Suitable next steps:** treat as low-priority background only, since the interviewee is leaving the role.

Use this during discovery to spot responsibilities or focus areas worth probing before confirming the profile and calling `save_discovery`.

---

## Step 3 — Weight and sharpen questions (`GenerateTopicsAndQuestions`)

Use the role profile already read during discovery (or, if `references/gds-role-catalogue.md` was first opened at `GenerateTopicsAndQuestions`, run Step 1's direct URL fetch once now before generating topics):

1. **Weight questions by the role's focus-area percentages** (while honoring the interviewee's named `focusTopics` per `SKILL.md` rule 2 and the backend topic/question count limits):
   - **Consulting-heavy role:** skew more questions toward stakeholder navigation, managing client/business-unit expectations, unspoken alignment rules, scoping trade-offs, and where formal handoffs break down.
   - **Strategy-heavy role:** skew more questions toward long-horizon trade-offs, unwritten governance/funding realities, how priorities are negotiated behind the scenes, and assumptions a successor must watch.
   - **Technical-heavy role:** skew more questions toward operational/architectural judgment, fragile integrations, undocumented system quirks, failure modes, and diagnostic heuristics.
2. **Technical focus ≠ "Hard skill" quiz (CRITICAL):**
   - Never ask generic textbook or hard-skill questions; a successor already has the baseline prerequisites.
   - Translate the catalogue's capabilities (especially *strong developed expertise*) into **tacit, BASF-specific know-how** tied to the systems, projects, and stakeholders from this interviewee's discovery.
3. **Probe the gap between the HR blueprint and lived reality:**
   - Do not assume the catalogue matches their individual seat. Ask where their real day-to-day responsibilities diverged from the formal design, where constraints forced workarounds or informal networks, and what a successor reading only the official profile would misjudge in their first 90 days.
4. **All `SKILL.md` rules still apply:** the catalogue's focus-area weights guide the **share** of questions across themes, while `SKILL.md` rule 8 ("Tacit knowledge only") governs **how each question is asked**. Never invent facts in summaries or the final handover from the catalogue.
