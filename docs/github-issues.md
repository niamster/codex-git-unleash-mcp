# GitHub Issues

Keep issues concise and concrete. This repository is small and policy-heavy, so issue bodies should describe the exact behavior gap or requested capability without extra ceremony.

## Titles

- Keep titles short and specific.
- Avoid bracketed type prefixes such as `[feature]` or `[improvement]`.
- Prefer the title to describe the actual problem or capability, not its label.

## Labels

- Let labels carry issue type and other classification.
- Do not repeat label information in the title when a label already covers it.

## Bodies

Use the lightest template that still makes the issue easy to act on.

### Improvement

Use:

- `Why`
- `Non-goals`

Add more sections only when they materially reduce ambiguity.

### Bug / Risk

Use:

- `Problem`
- `Impact`
- `Recommendation or possible fixes`

For policy or safety issues, describe both the behavior that is currently possible and the narrower behavior the repository should allow instead.

## Scope

- Prefer one concern per issue.
- Keep recommendations constrained to this repository's explicit Git, GitHub, and policy boundary rather than generic platform changes.
- When relevant, point to the exact files, tools, or policy rules involved.
