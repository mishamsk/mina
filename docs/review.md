## .pre-commit-config.yaml:1 ( )
all add all the relevant prek built in hooks from https://prek.j178.dev/builtin/#supported-hooks_1

## .pre-commit-config.yaml:9 ( )
we should not run a pre-commit check that modifies generated code. it should fail if the generated code is not matching latest generator config, but leave it to the developer to fix, not force regenerate

## .pre-commit-config.yaml:19 ( )
we should not require any tests as pre-commit hooks, to heavy

## AGENTS.md:22 ( )
this is too verbose. justfile will speak for itself.

## AGENTS.md:38 ( )
remove this line

## Justfile:1 ( )
add import? '~/.justfile'  set shell := ["bash", "-euo", "pipefail", "-c"] set windows-shell := ["pwsh", "-NoLogo", "-Command"]

## Justfile:2 ( )
instead of this line, add an "init" recipe, that checks for existance of prek, mise and install prek pre-commit hook via prek. also add a mise.toml file with go pinned to 1.25.

## Justfile:4 ( )
remove

## Justfile:19 ( )
make sure full end 2 end testscript based tests are not executed on regular test calls

## Justfile:21 ( )
this is ridicioulous. our test policy is that we do not have any other tests besides the black-box styled boundary tests + the full integration tests via testscript. with the testscript driven tests NOT executed by default. your "test-boundary" is hallucination and slop. remove this and any ambigouty that let you to create a separate recipe, which in reality runs the same full test suite

## Justfile:31 ( )
this should not exist. end 2 end rest api tests should salso go through testscript. not some special different approach

## Justfile:33 ( )
comment out this recipe, in the comment clarify that this should be used by agent when it needs to run some manual smokes that are not covered by testscript end-2-end test suite. there is nothing here for now, so we should remove this redundant recipe

## PROJECT_STATE.md (file-level)
You have bloated and killed the purpose of this doc. it was supposed to be a succint bullet list explaining where on the phase/stage roadmap the project is and you made it a stupid enumeration of project context that is already readily available to agents. Read other comments related to this file and simplify it, going back to it's original purpose

## PROJECT_STATE.md:4 ( )
meaningless. go apparent from mise.toml we will add. main pacakge easy to find

## PROJECT_STATE.md:5 ( )
meaningless, already clear from justfile, go.mod

## PROJECT_STATE.md:10 ( )
meaningless, go.mod specifies this

## PROJECT_STATE.md:15 ( )
meaningles repetition of architecture doc and/or package docs

## PROJECT_STATE.md:149 ( )
meaningless, self-documented in justfile

## docs/architecture.md:27 ( )
this is clearly confusing agents. remove from core terms.

## docs/architecture.md:29 ( )
this is a repeat of AGENTS.md, remove

## docs/architecture.md:59 ( )
we need to expand this. we have an in-memory database always, this is what we open on app open. we then attach using duckdb attach a persistent acocunting state database. all accounting state lives in one schema of this attached database (default is main, but should be configurable to be a different schema). if no accounting state database passed in, we should allow storing in the schema of the in-memory database for demo purposes (and tests). but from app perspective it should be abstraced in store state. it knows which fully qualified schema (attached or not) owns the accounting state and later we will need the in-memory database schemas for throwaway caches etc

## docs/architecture.md:101 ( )
we need to clarify this section. frist and foremost we have only two types of tests. end-2-end aka integration that run only via testscripts and are not ran on every commit. these tests should be used for real network based rest api tests, cli tests and later tui tests (via tmux). all other tests are using a test harness that bypasses cli/network, but otherwise excercises app logic at high level boundaries via in memory client. for these tests we should have a two tier system. most basic operations, like "create a transaction - a new row is present in database" - we should test by sending a request to create transaction and checking attached database. but all other tests should fully go through client, both for fixture setup and for assertions. so a test that does something with transactions and asserts state, should assert by calling client to list transaction. we should encode explictly the rule, that a good test is that is fully independnet of implementation detail. and we should also have a test framework that provides ready made building blocks for tests, so that test read like a scenario and not a bunch of boilerplate. we should use in-memory database and per-test schema. make updates to targeted bullet lists here that are high-lelve rules and separately create a plan to create this test system and refactor current tests to it using our running todo template. do not implement the plan
