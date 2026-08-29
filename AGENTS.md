# Agent Instructions - Tool Repo

You are a coding agent working inside an internal Dux tool repository. Alongside whatever the developer asks you to do, you have a standing responsibility: **keep `TOOL_DOC.md` accurate.** This file is the public-facing description of the tool inside the company-wide [`dux-tool-registry`](https://github.com/usedux/dux-tool-registry).

## Padroes de UI do sistema (leitura obrigatoria)

Antes de mexer em qualquer coisa visual - componente, pagina, CSS, template de
documento, texto de interface - leia `CLAUDE.md`. Ele define as regras fixas do
sistema: icones sempre em SVG de traco vindos de `src/components/icons.tsx` (emoji e
proibido fora das mensagens do Slack), travessao longo (em dash) e medio proibidos em
todo o repositorio, e consistencia obrigatoria de cor, raio, sombra, transicao, hover e
foco via os tokens de `src/styles/main.css`. Essas regras valem sempre, mesmo que o
pedido do desenvolvedor nao as mencione.

## What `TOOL_DOC.md` is

A single markdown page that describes:
- What this tool is and who uses it (Scope)
- Its tech stack
- Its full dependency list (Packages - must remain parseable JSON)
- Known warnings and vulnerabilities
- A changelog

Every push to `main` that modifies `TOOL_DOC.md` triggers a workflow that opens a PR against `dux-tool-registry`, updating the canonical copy at `docs/<tool>.md`. **`TOOL_DOC.md` is therefore not internal notes - treat it as published documentation.**

## Language

The team's working language is **Brazilian Portuguese**. Write the free-text content of `TOOL_DOC.md` in pt-BR - the Scope, Architecture, On-Call notes, Warnings descriptions, Recent Changes entries, and any other prose.

**Keep these in English regardless** - they are machine-readable anchors that the registry's tooling depends on:

- All frontmatter keys (`tool:`, `created_by:`, `owner:`, `status:`, `data_classification:`, etc.)
- Frontmatter enum values (`prototype`, `active`, `maintenance`, `deprecated`, `public`, `internal`, `confidential`, `pii`, `financial`)
- All section headers exactly as they appear in the template (`## Scope`, `## Tech Stack`, `## Packages`, `## Architecture`, `## Data & Compliance`, `## On-Call & Runbook`, `## Consumed By`, `## Cost & Hosting`, `## Warnings & Known Vulnerabilities`, `## Recent Changes`)
- JSON content inside the Packages block, including `ecosystem` values (`npm`, `pypi`, `go`, `cargo`, etc.)
- Severity labels in Warnings (`info`, `low`, `medium`, `high`, `critical`)
- Code blocks, command names, file paths, error messages quoted verbatim

If the existing `TOOL_DOC.md` is written in English (older tool, or created before this guidance landed), don't rewrite it wholesale - write your new content in pt-BR alongside, and the doc will gradually converge.

## Roles: `created_by` vs `owner`

The frontmatter has two people-fields that look similar but are not:

- **`created_by`** - who built the tool. Attribution only. Often a non-technical person (sales rep, finance analyst, ops lead) who used an agent to build something for their own workflow. They don't need to be able to review GitHub PRs.
- **`owner`** - technical sponsor. The person who can read a diff, judge a CVE, and review changes to the doc. This handle is what lands in `CODEOWNERS` upstream and what gets paged on audit findings.

For tools where the creator *is* technical, these are the same handle. For tools built by non-technical creators, the owner is a paired engineer or eng manager - never invent one. **If the developer hasn't told you who the sponsor is, ask. Don't guess.**

## When to update `TOOL_DOC.md`

Update it **before pushing** if the change you just made affects any of the following:

| Change | Section to update |
|---|---|
| New dependency, removed dependency, version bump | **Packages** |
| Switched runtime, framework, database, or deployment target | **Tech Stack** |
| Tool now does something it didn't before (new feature area) | **Scope** |
| Tool stopped supporting something it used to | **Scope** |
| New core concept or domain term a contributor must know | **Concepts & Domain Vocabulary** |
| Architectural shift (new service, new boundary) | **Architecture** |
| You saw a security warning during `npm install`, `pip install`, build, or audit | **Warnings & Known Vulnerabilities** |
| Status changed (e.g., prototype → active, active → deprecated) | Frontmatter `status` |
| Tool now reads/writes a new data category (PII, financial, customer data) | **Data & Compliance** + frontmatter `data_classification` |
| New consumer / integration / downstream dependency added | **Consumed By** |
| Hosting target or estimated cost changed materially | **Cost & Hosting** |
| New on-call channel, escalation contact, or known failure mode | **On-Call & Runbook** |
| Technical sponsor changed (handoff) | Frontmatter `owner` |
| **Any new feature shipped** | **Data Exposure & Leak Surface** - re-evaluate every row, add new ones if the feature opens a new surface |
| New entity, schema column, or external data format introduced | **Data Model** |
| Sensitive field added or removed (PII, financial, customer-identifying) | **Data Exposure & Leak Surface** + **Data & Compliance** + `data_classification` |
| Mitigation deployed that closes a previously-open exposure surface | **Data Exposure & Leak Surface** - flip `**open**` → `closed`, name the mitigation |
| Tool became reachable at a new URL (first deploy, domain change, env split) | Frontmatter `deployed_url` |
| Audit completed or waived for this tool | Frontmatter `audit_status` + `audit_date`. **Agent does not set this** - only an auditor does (humans). If you see `audit_status: pending`, leave it as-is. |

Skip the update for: pure refactors, formatting changes, doc-only edits inside the source code, dev-only script tweaks that don't change the public behavior.

**Always** bump the `updated:` field in frontmatter when you change anything in `TOOL_DOC.md`. **Always** add a one-line entry to **Recent Changes**.

## Data exposure review protocol

Run this when (and only when) a new feature has shipped or you're about to push something that changes what the tool does. Skip for refactors, formatting, dependency bumps, and doc-only changes.

The review has three concrete steps:

1. **Walk the existing exposure table.** Read every row in `## Data Exposure & Leak Surface`. For each `closed` row, ask: does the mitigation still hold after this feature? If you changed how data is logged, returned, exported, or sent to a third party, the answer may have flipped. If a mitigation is now broken, flip `closed` → `**open**` and note in the Mitigation column what regressed.

2. **Search for new surfaces.** For the feature you just shipped, check every place data leaves the safe core:
   - **Logs** - any new `console.log`, `logger.info`, error stack traces that print user data?
   - **API responses / UI** - are you returning fields you weren't before? Cross-tenant exposure risk?
   - **Files / exports** - new CSV columns, S3 puts, file downloads?
   - **Queues / webhooks** - new payload shapes sent to external systems?
   - **Third parties** - sending anything new to HubSpot / Stripe / Slack / etc.?
   - **Error paths** - `throw new Error(\`failed for user ${email}\`)` style leaks?
   - **Build artifacts** - `.env` files committed, secrets in client bundles, source maps with PII in fixtures?

   If you find a new surface, **add a row** to the table. Set `Status` honestly - if you haven't mitigated it, write `**open**` with a clear Mitigation entry like "none yet - needs scrubber" or "TODO before launch."

3. **Update `data_classification` if the feature changes data categories.** If you added PII handling to a tool previously marked `internal`, bump it to `pii` and add a Recent Changes note.

**Be conservative - bias toward marking surfaces `open`.** An honest "open" row that prompts a follow-up is more useful than a falsely `closed` row that hides a real risk. The monthly registry audit counts `open` rows across the whole registry; leadership uses that number to prioritize security work. Don't game it.

If the tool genuinely handles only public data, write "n/a - handles only public data" in the section body and skip this protocol entirely.

## How to update the Packages section

The Packages block must stay valid JSON inside a fenced ` ```json ` code block. The downstream audit job parses it directly.

To refresh it:

1. Read the manifest file(s) of record: `package.json`, `requirements.txt` / `pyproject.toml`, `go.mod`, `Cargo.toml`, etc.
2. Emit one JSON block per ecosystem.
3. Use **resolved versions**, not ranges. If a `package.json` says `"next": "^14.0.0"` but the lockfile resolved to `14.2.3`, write `14.2.3`.
4. Include both runtime (`dependencies`) and dev (`devDependencies`) where the ecosystem distinguishes them.
5. Do not invent versions. If a version is missing or unresolved, omit the entry and add a note under Warnings.

Schema:

```json
{
  "ecosystem": "npm | pypi | go | cargo | maven | nuget | composer | rubygems",
  "manifest": "<filename>",
  "dependencies": [
    { "name": "<package>", "version": "<resolved-version>" }
  ],
  "devDependencies": [
    { "name": "<package>", "version": "<resolved-version>" }
  ]
}
```

## How to record warnings

Be conservative. Only add entries that a maintainer or operator should actually know about. Format:

```
- **YYYY-MM-DD - <severity>** - short description. <link to CVE / advisory / PR / issue if relevant>
```

Severity values: `info`, `low`, `medium`, `high`, `critical`. Use `high`/`critical` only when you have a concrete CVE or a clear exploit path. Vague linter complaints don't go here.

Examples of what *does* belong:
- A package install printed a deprecation notice for a transitive dep.
- A version pinned here has an open CVE.
- A known runtime quirk (e.g., "Node 22 required because we use `--experimental-vm-modules`").
- A piece of behavior that's load-bearing but easy to break (e.g., "auth header is checked case-sensitively - proxies that lowercase headers will break login").

Examples of what *does not* belong:
- TODOs.
- Code style preferences.
- Generic "we should add tests" notes.

## Rules

1. **Never delete the section structure.** Other tools depend on the headings being present and stable.
2. **Keep the Packages JSON parseable.** A syntax error breaks the audit job for everyone.
3. **Don't fabricate.** If you don't know an owner, contact, or version, leave it blank or write `unknown` - don't guess.
4. **Don't push secrets.** `TOOL_DOC.md` is replicated company-wide. No tokens, no internal URLs that aren't already public inside the company.
5. **Update `updated:` and add a Recent Changes entry** whenever you modify the file.
6. **Match facts to reality** - if `TOOL_DOC.md` says the tool uses Postgres but the code now uses SQLite, fix the doc, don't fix the code to match the doc.
