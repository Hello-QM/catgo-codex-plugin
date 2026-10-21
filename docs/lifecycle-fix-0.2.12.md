# Editor lifecycle fixes: 0.2.12

Two regressions were reproduced in the real bundled editor before the fixes:

- A file loaded in a hidden, zero-size iframe raised an initialization error
  after three seconds, although its renderer existed. The old warning remained
  when the tab later became visible.
- A resource notification delivered after a successful Save reloaded the same
  saved file, cleared Undo/Redo history and closed the coordinates panel. A
  subsequent operation waiting for Undo could no longer proceed.

## Resulting behavior

Initialization checks now wait for a visible layout. Resize and visibility
events schedule another check, and a late renderer can clear its own readiness
warning without reopening the tab. Timers, the observer and the visibility
listener are removed on destruction. Genuine render exceptions are kept
separate and remain visible.

Resource notifications now read and compare the host's opaque file version.
The editor's own saved version and repeated input for the same file preserve
the active document, selection, coordinate panel and history. Notifications
received during Save are reconciled after it completes; a read started before
a completed write is rechecked rather than applied as an older version.
Callbacks for a different or superseded document are ignored. Existing resource
subscriptions are retained when refreshing the same URI.

Returning to the active file cancels a slower pending open for a different
file while retaining the active document and its history. Resource subscription
changes are serialized and recheck the actual active document after each
acknowledgement, including when a prior unsubscribe completes late. Destruction
also drains a late subscription rather than leaving it registered.

A genuinely changed clean resource still loads from disk. If there are unsaved
edits, the editor preserves them and shows the external-change notice. Writes
continue to use `ifMatch`; conflicts never trigger unconditional overwrites.
These changes fix document lifecycle handling; they do not replace or reconnect
the SDK transport after a genuine host transport failure.

## Verification

The new lifecycle case uses the actual packaged UI and official SDK in an
isolated protocol test host, with a public three-atom water fixture. It keeps
the iframe hidden for 3.5 seconds before first display, exercises a second
hide/show cycle, delivers updates before the write acknowledgement and after
Save, then uses Undo/Redo in the same editor. It also sends duplicate file input
and a real external version change. Delayed file reads and unsubscribe
acknowledgements exercise rapid A → B → A file switching. It asserts a single SDK initialization and
a single resource subscription across Save and hide/show. No reopen is used to
make those assertions pass.

Both original failures and both file-switch races were observed before their
corresponding code fixes.
The lifecycle case and the existing unavailable-GPU case then passed locally;
the latter confirms that a genuine graphics failure is reported while coordinate
editing remains usable. CI runs these cases alongside the existing six browser
cases, document/runtime/upstream tests, MCP client and scalar WASM checks.

See the [versioned receipt](../plugins/catgo-editor/acceptance/lifecycle-fix-0.2.12.json).
The protocol host identifies itself as a test harness. These results do not
alone establish native Codex rendering, host transport recovery or behavior on
native macOS/Windows. The earlier [0.2.11 native report](native-host-0.2.11.md)
remains a historical record of that older program, including its interruptions.

Private scientific structures, paths, screenshots and session identifiers are
not included in this public report. Test-file Save semantics and scientific
structure validity remain separate checks.
