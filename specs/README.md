# Specifications

One directory per feature, in [Spec Kit](https://github.com/github/spec-kit)
shape. `spec.md` states intended behaviour and acceptance criteria — what the
software should do and why, never how the code achieves it.

Project-wide principles live in
[`.specify/memory/constitution.md`](../.specify/memory/constitution.md). They
are binding: a spec that violates one is wrong even if it is otherwise good.

| Spec | Milestone | Status |
| --- | --- | --- |
| [`002-travel-and-contracts`](002-travel-and-contracts/spec.md) | M2 | Draft, awaiting approval |
| [`003-ship-view`](003-ship-view/spec.md) | — (presentation) | Implemented; superseded in part by 004 |
| [`004-rooms-flows-crew`](004-rooms-flows-crew/spec.md) | — (presentation + §4.2) | Approved, in progress |

## M0 and M1 have no spec

They were built before this practice was adopted, and writing specifications
after the fact would produce documents describing whatever the code happens to
do — which is exactly the failure mode the rules warn against. Their intended
behaviour is covered by [`docs/design.md`](../docs/design.md) (the reasoning),
[`ARCHITECTURE.md`](../ARCHITECTURE.md) (the structure), and the test suite
(the enforceable claims). New work gets a spec first.

## Keeping them true

When intended behaviour changes, `spec.md` changes in the same commit as the
code. If code and spec disagree, that is a finding to raise — not a licence to
quietly rewrite the spec to match the code.
