# Tracker adapter: trello

The project's tickets are cards on one Trello board. Config (`node "<repo root>/.claude/scripts/config.mjs" get tracker`):

```json
{ "type": "trello", "board": "<board URL>", "lists": { "todo": "<list>", "inProgress": "<list>", "review": "<list>", "done": "<list>" } }
```

All Trello work goes through the `trello-manager` subagent: never call Trello tools in the main conversation. Every dispatch passes the board URL, the four list names from the config, the base branch (`git.baseBranch`) and, for a write, the exact approval. The subagent uses the claude.ai Trello connector (`mcp__claude_ai_Trello__*`); without it, this adapter cannot work.

## parse

The argument is a card URL `https://trello.com/c/<short link>[/<n>-<slug>]`. The id is `<short link>` (8 characters); the canonical ref is the URL as given. Anything else is not a Trello ticket: say so and stop.

## read

Dispatch `trello-manager`, read-only, to read one card: title, full description unchanged, every checklist with its items, its list, dependencies, and the current state of the related code. The card's state is the workflow state whose list name matches its list; a list that matches none is "other".

## move

`move(<id>, <from>, <to>)`: dispatch `trello-manager` with the card URL, the source list `lists[<from>]` and the target list `lists[<to>]`, and state that the move is the workflow's own, approved by invoking `/work-ticket` (or its `done`). It re-reads the card and moves it only if it is still in the source list; otherwise it makes no write and reports the current list. A move is done only when its report lists it as made.

## prLine

`**Ticket:** <card URL>`.

## done-on-merge

`.github/workflows/trello.yml` moves the card on the PR description's `**Ticket:**` line to the done list when a PR into the base branch is merged. It needs the repository secrets `TRELLO_KEY` and `TRELLO_TOKEN` and the variable `TRELLO_DONE_LIST_ID` (the done list's id). If that run fails, `/work-ticket <card URL> done` is the fallback.

