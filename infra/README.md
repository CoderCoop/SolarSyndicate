# Repository settings as code

GitHub settings for this repository are managed here, not clicked through the
web UI. If something needs changing, change `main.tf` and apply — don't flip it
in Settings and let the code drift. If a UI change has already happened,
reconcile the code to match it (or revert it) promptly.

## What is managed

Description, homepage and topics; issues/wiki/projects toggles; merge policy;
branch deletion on merge; Pages build type; vulnerability alerts; secret
scanning and push protection.

Branch protection is **not** here yet — there are no rules to adopt. Add it
when there are.

## Why there is no state file

Every apply re-adopts the existing repository through an `import` block,
reconciles it, and discards the state. That means no state to store, no state
to lose, and no possibility of the state disagreeing with reality — at the cost
of the plan being slightly slower. For a handful of repository settings that is
the right trade.

State files are gitignored regardless, along with `*.tfvars`. Never commit
either.

## Running it locally

```bash
cd infra
export GITHUB_TOKEN=$(gh auth token)
terraform init
terraform plan          # read this before applying
terraform apply
```

Your token needs administration rights on the repository. Applying with a
token that lacks them fails on the security settings rather than silently
skipping them.

## Running it in CI

`.github/workflows/infra.yml` applies on merge to `main`.

The built-in `GITHUB_TOKEN` **cannot** administer repository settings, so the
workflow uses a fine-grained PAT stored as the `INFRA_TOKEN` secret:

- Resource owner: `CoderCoop`
- Repository access: **only** `SolarSyndicate`
- Permissions: **Administration → Read and write**. Nothing else.

Until that secret exists the workflow skips with a notice rather than failing,
so a missing token never blocks a merge.

## Merge policy

All three merge methods stay enabled, as GitHub ships them.
`delete_branch_on_merge` is on so merged branches are cleaned up rather than
lingering and diverging from `main`.
