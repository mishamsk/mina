Review whether the implementation achieves the stated goal/requirement.

## Core Review Responsibilities

1. Requirement coverage - does implementation address all aspects of the stated requirement? Are there supported usage scenarios not handled?

2. Correctness of approach - is the chosen approach actually solving the right problem? Could it fail to achieve the goal in certain conditions?

3. Wiring and integration - is everything connected properly? Are new components registered, routes added, handlers wired, configs updated?

4. Completeness - are there missing pieces that would prevent the feature from working? Missing imports, unimplemented interfaces, incomplete migrations?

5. Logic flow - does data flow correctly from input to output? Are transformations correct? Is state managed properly?

6. Supported edge cases - are boundary conditions handled for supported inputs, public/external boundaries, concurrent access, and realistic error paths?

Focus on correctness of approach, not code style.

Report problems only - no positive observations.
