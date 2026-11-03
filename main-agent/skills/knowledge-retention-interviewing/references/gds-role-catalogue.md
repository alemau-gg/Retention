# GD / Global Digital Services Role-Profile Catalogue

Use this reference whenever the interviewee works in — or likely belongs to — **Global Digital Services (`GD`)**.

## Recognizing a GD employee (navigating naming uncertainty)

Employees rarely write out `"Global Digital Services"` or `"GDS"` in day-to-day work:

- **Common labels:** `"GD"`, `"Global Digital Services"`, `"Digital Services"`, or `"Digital Solutions"`.
- **Org codes (in `directoryProfile.department`, email signatures, or user answers):** all GD units have an org code starting with **`GD`**, often followed by a third letter and a slash + sub-letter (e.g. `GD`, `GDA`, `GDB`, `GDD`, `GDE`, `GDF`, `GDS`, or `GDA/X`, `GDD/A`, etc. — note that `GDS` specifically is the Cyber Security sub-unit inside `GD`).
- **When in doubt, check Page 2:** people often use informal job titles or team names instead of official HR conventions. As long as they are within `GD` (or their role sounds like a digital/IT/consulting role and their unit is unclear), **the role itself is the real discriminant**. Open the catalogue and check **Page 2**, which contains the overview of all available role profiles, to see if any role applies.

## Purpose

The GDS Role-Profile Catalogue (`Updated_December_2025_Global-Role-Profile-Catalogue_final.pdf`) is a curated HR reference (part of company context, not personal prefill search data) that defines the official blueprint for GD positions: core focus areas and their percentage weights (typically **Technical**, **Consulting**, **Strategy**, **Collaboration**, **Leadership**), prerequisites and expectations, expected day-to-day activities, and skill-progression tiers (*starting in the role* → *increasing expertise* → *strong developed expertise*).

In the visual layout of the catalogue, each skill category has a dedicated color, and the detailed skill descriptions on a role's page are color-coded to match their category.

Use this catalogue strictly as a **lens to weight and sharpen tacit-knowledge questions** for the interviewee's successor — never as a checklist of generic "hard skill" or HR career-reflection questions.

---

## Step 1 — Locate the role via Page 2 and read the role page

1. Access the exact file (via the CKR Company Context folder or SharePoint):
   `Updated_December_2025_Global-Role-Profile-Catalogue_final.pdf`
2. **Start with Page 2 (Role Overview) when the title is not an exact match:**
   - People frequently use working titles, project roles, or abbreviations that do not match HR naming conventions verbatim.
   - Read **Page 2** of the PDF (the overview of all role profiles in the catalogue) alongside searching for their role title, and map their stated role and responsibilities to the closest profile(s) on Page 2.
3. **Be pragmatic, not overly rigid:**
   - If one profile (or a combination of two profiles) on Page 2 clearly corresponds to what the person does, open and read the single page dedicated to that role profile.
   - During discovery (`RunPreInterviewDiscovery`), if two profiles on Page 2 look plausible or their title is ambiguous, you can briefly ask a natural follow-up question to clarify which angle fits their actual seat better — do not demand that they know the exact HR catalogue title.
   - Do not read or summarize the entire PDF; stick to **Page 2 (overview)** and the **1–2 specific role-profile pages** that match.
4. **If no role in the catalogue fits (or the file cannot be accessed):** do not force a match or invent a profile. Simply continue with the standard interviewing framework without the catalogue.
5. **Keep it in the background:** do not lecture the interviewee about the catalogue or recite their official HR job description back to them. Use it as background context for discovery follow-ups and question design.

---

## Step 2 — Extract the role's structure

From the matched role-profile page, extract:

- **Focus-area weights (percentages):** the split across Technical, Consulting, Strategy, Collaboration, Leadership (or the role's specific dimensions).
- **Role description, responsibilities, and goals:** how the catalogue translates those focus areas into day-to-day expectations.
- **Prerequisites and expectations:** baseline qualifications a successor is assumed to have.
- **Dimensions, specialization areas, and capability progression:** the capabilities and skills expected at *starting in the role*, *increasing expertise*, and *strong developed expertise* (color-coded by category to match the focus areas).
- **Suitable next steps:** treat as low-priority background only, since the interviewee is leaving the role.

---

## Step 3 — How this shapes Question Generation (`GenerateTopicsAndQuestions`)

### 1. Weighting the question mix
- **Skew question allocation to match the role's focus-area percentages** (while still honoring the interviewee's named `focusTopics` as dedicated topics per rule 2 of `SKILL.md` and the backend topic/question count limits):
  - **Heavily Consulting-weighted role:** dedicate a larger share of questions to stakeholder navigation, managing client/business-unit expectations, unspoken alignment rules, scoping trade-offs, and where formal consulting handoffs break down in practice.
  - **Heavily Strategy-weighted role:** dedicate a larger share of questions to long-horizon trade-offs, unwritten governance/funding realities, how priorities are actually negotiated behind the scenes, and which strategic assumptions a successor must watch.
  - **Heavily Technical-weighted role:** dedicate a larger share of questions to operational/architectural judgment, fragile integrations, undocumented system quirks, failure modes, and diagnostic heuristics.

### 2. Technical focus ≠ "Hard skill" quiz (CRITICAL)
- **Never ask textbook or "hard skill" questions** (for example, how a standard framework, programming language, or tool works in general). A successor hired into the role already has the baseline hard skills listed in the catalogue's prerequisites.
- **Always translate technical capabilities into tacit, role-specific know-how:**
  - *Wrong (hard skill / generic):* "How do you configure CI/CD pipelines or use SAP in your day-to-day?"
  - *Right (tacit / BASF-specific):* "When a deployment or interface in [named system from discovery] fails silently, what is the first thing you check that isn't in the runbook?"
  - Use the catalogue's *strong developed expertise* bullets to spot where deep tribal judgment lives, then ask how that judgment applies to **their actual systems, projects, and stakeholders from discovery**.

### 3. Probing the gap between the HR blueprint and lived reality
- Do not assume the catalogue accurately describes the interviewee's individual seat; treat it as a hypothesis to test against their discovery profile.
- Use the contrast between the formal role profile and their actual experience to frame tacit-knowledge questions:
  - Where their real day-to-day responsibilities and impact diverged from the formal role design (hidden operational load, informal ownership, unwritten expectations).
  - Which capabilities from the profile became most critical in practice, and where constraints in the role forced them to build workarounds or rely on informal networks instead.
  - What a successor reading only the official GD role profile would misjudge about their first 90 days in this seat.

### 4. Alignment with `SKILL.md` rules
- The catalogue's focus-area weights guide the **proportion** of questions across technical, consulting, strategic, collaborative, and leadership themes, while `SKILL.md` rule 8 ("Tacit knowledge only") governs **how each question is asked** (never ask what can be read from a document or the catalogue itself).
- Every generated question must still name concrete systems, processes, or responsibilities from **this person's discovery** (`SKILL.md` rule 4), remain answerable in 2–5 spoken sentences (rule 5), and be written in the **interview language** from state.
- Never invent facts in summaries or the final handover from the catalogue — only what the interviewee confirms in their answers is retained.
