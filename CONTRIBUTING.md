# Contributing to Mina

Mina welcomes thoughtful issues: bug reports, ideas, awkward real-life money stories, documentation gaps, and well-reasoned challenges to how things work. It does not accept external pull requests.

This is a personal project in very active iteration. Keeping implementation and copyright ownership with the maintainer lets Mina move quickly without making contributors navigate shifting internals or leaving the project with a patchwork of licensing rights. Your time is valuable; please spend it explaining the problem, not preparing code that cannot be merged.

## How to Help

- **Found a bug?** Open an issue with reproduction steps, expected and actual behavior, Mina version, environment, and useful logs or screenshots.
- **Have an idea?** Describe the person and problem first. Include your proposed approach, alternatives, tradeoffs, examples, and relevant prior art when they help explain the thinking.
- **Hit an awkward workflow?** Tell the whole story. Split bills, reimbursements, shared money, and other untidy household cases are exactly the kind of product pressure Mina needs.
- **Found confusing documentation?** Open an issue with the affected page, what you expected to learn, and where the explanation went off course.

Please search existing issues before opening another one and keep each issue focused on one problem. Detailed reasoning is welcome; a finished implementation is not required or expected.

## Please Do Not Open Pull Requests

Mina does not accept external code, test, configuration, or documentation pull requests, including small fixes. Unsolicited pull requests will be closed without code review. This is an ownership and project-management boundary, not a judgment of the work or the person who prepared it.

The maintainer may use an issue as input and implement the change independently. Opening an issue does not promise that an idea will be accepted or scheduled, but a clear problem statement gives it the best chance of shaping Mina.

Forking and modifying Mina for your own use is welcome under the [O'Saasy License](LICENSE.md). A fork is also a good place to prove an idea for yourself; share what you learned in an issue rather than submitting the patch.

## Know the Current Terrain

Mina is driven first by real personal-finance use cases:

- Backend architecture is mostly stable and settled.
- The accounting data model still fluctuates as real workflows pressure-test it.
- The frontend is a deliberate vibe-coded rush toward a useful whole through at least `0.1.0`.
- Compatibility is not promised before `0.1.0`; commands, configuration, APIs, and database shape can change.

The ride may be rocky before `0.1.0`, and product feedback may be direct. An idea can be technically sound and still not fit Mina's household-scale direction.

Useful context:

- [VISION.md](VISION.md): the product destination and character.
- [SCOPE.md](SCOPE.md): durable in-scope and out-of-scope boundaries.
- [PROJECT_STATE.md](PROJECT_STATE.md): what is implemented now.

Thanks for helping Mina encounter more interesting financial reality than one household can generate on its own.
