# Code Quality Guardrails

When implementing or modifying code, follow these rules.

## 1. Scope control
- Limit changes strictly to what is required for the task.
- Do not perform unrelated refactors, renames, or architecture changes.
- Do not modify shared contracts or schemas unless explicitly required.

## 2. Architecture
- Preserve existing architectural boundaries.
- Do not move business logic into UI/rendering layers.
- Keep state transitions, data access, and business rules in appropriate layers.
- Avoid hidden side effects.

## 3. Readability
- Use clear, domain-specific names.
- Avoid vague names such as `data`, `item`, `obj`, `temp`, `misc`, or `handleData`.
- Keep functions focused and readable.
- Avoid deep nesting and overly long functions.

## 4. Reuse
- Avoid copy-paste logic.
- Extract helpers only when reuse is real and improves clarity.
- Do not over-abstract prematurely.

## 5. Error handling
- Handle failure paths explicitly.
- Do not silently swallow errors.
- Do not use console logging as a substitute for error handling.

## 6. Testability
- Write code that is testable by design.
- Add stable testIDs or selectors for critical flows where needed.
- Avoid implementation patterns that make testing brittle.

## 7. Integrity
- Do not hardcode values or add test-only shortcuts just to make tests pass.
- Do not weaken tests to fit the implementation.
- The implementation must satisfy the intended business behavior, not only the test surface.
