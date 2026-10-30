# General Code Design Guidelines

Apply the following design guidelines whenever planning an implementation, detailing an implementation strategy, generating the code, and reviewing the code generated and its design.

Apply these design guidelines both for the implementation code and for the test code.

## Encapsulation + Information Hiding + Abstraction

Bundle data and related methods together.
Keep implementation details and internal state private.
Hide implementation details that callers do not need to know.

Avoid access to external global state and singletons.

## Dependency Inversion AKA Inversion of Control + Separation of concerns

Wire all the objects where the execution flow starts: wire concrete dependencies at the composition root (application entry point, factory, or bootstrap), rather than inside domain/business objects.

Use a factory  when the consumer must create a later runtime-selected dependency, or while the composition root/factory owns concrete dependency construction that the consumer should not know about (therefore maintaining the separation of concerns); otherwise inject the required dependency directly.

Do not pass global unrelated objects, dependencies, variables around through different layers to modules, objects, functions that should not know or need to know about or depend on those, therefore breaking the separation of concerns.

Inner/domain/shared code must not depend on UI, HTTP, AWS, persistence, or caller layers.

## Single Responsibility

Every module and object should own a responsibility that should not be spread or duplicated across different layers or objects.
Every module and object should avoid multiple responsibilities, even more when unrelated.

## Modularity + Simplicity

Organise the code in a modular way that minimises dependencies between modules.

Keep the design and the code simple.

When a single requirement or specification has:

- a large blast radius,
- a need for new concurrency/asynchrony/guards that would otherwise be unnecessary, or
- adds material complexity to the design and the code

the cost and risk should be highlighted to the user during the inception phase asking the user to review the implementation strategy and design chosen and allowing the user to either consider and change the strategy or the requirement/specification.

If the concern is discovered during Execution or Review: record the design drift, stop and ask the user for input.
