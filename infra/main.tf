terraform {
  required_version = ">= 1.5"

  required_providers {
    github = {
      source  = "integrations/github"
      version = "~> 6.0"
    }
  }
}

# Auth comes from the environment, never from a committed file:
#   export GITHUB_TOKEN=$(gh auth token)
# In CI it is a fine-grained PAT with Administration write on this repo only.
provider "github" {
  owner = "CoderCoop"
}

# Adopt the repository that already exists rather than trying to create it.
# Paired with the ephemeral-state workflow in .github/workflows/infra.yml,
# this makes every apply a re-adoption: no state file to store, lose, or
# let drift.
import {
  to = github_repository.this
  id = "SolarSyndicate"
}

resource "github_repository" "this" {
  name         = "SolarSyndicate"
  description  = "A spaceship management simulation. You are not the captain — you are the guild."
  homepage_url = "https://codercoop.github.io/SolarSyndicate/"
  visibility   = "public"

  topics = [
    "game",
    "simulation",
    "typescript",
    "pwa",
    "space",
    "incremental-game",
  ]

  # has_downloads is deprecated in the provider and no longer does anything.
  has_issues   = true
  has_wiki     = false
  has_projects = false

  # --- merge policy -------------------------------------------------------
  #
  # Squash is off deliberately. It collapses a branch into a single
  # GitHub-authored commit, which destroys per-commit authorship and the
  # Co-Authored-By trailers. Rebase keeps each commit and its author.
  #
  # delete_branch_on_merge is the setting that actually matters day to day:
  # with the remote branch gone after a merge, recreating it from main is a
  # fresh push rather than a force. That is what removes the need to rewrite
  # history on every follow-up change.
  allow_rebase_merge     = true
  allow_merge_commit     = true
  allow_squash_merge     = false
  allow_auto_merge       = true
  delete_branch_on_merge = true

  # --- security -----------------------------------------------------------
  vulnerability_alerts = true

  security_and_analysis {
    secret_scanning {
      status = "enabled"
    }
    secret_scanning_push_protection {
      status = "enabled"
    }
  }

  # The repository has history; Terraform must never be able to replace it.
  lifecycle {
    prevent_destroy = true
  }
}

# Pages is served from the Actions workflow, not from a branch. Adopted the
# same way as the repository: it was enabled by hand before this config
# existed, and this brings it under management without recreating it.
import {
  to = github_repository_pages.this
  id = "SolarSyndicate"
}

resource "github_repository_pages" "this" {
  repository = github_repository.this.name

  # No `source` block: that is for the legacy deploy-from-branch mode.
  build_type = "workflow"
}
