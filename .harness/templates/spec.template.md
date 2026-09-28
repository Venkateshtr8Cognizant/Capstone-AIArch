# Spec — <feature name>

> Written by the **Planner**. The developer reads this and replies `APPROVED`
> before any code is written. Keep the headings exactly as they are: the
> Evaluator and Monitor locate sections by heading.

## 1. Request

<The developer's prompt, verbatim.>

## 2. Restatement in domain terms

<What this means in StoreOps vocabulary. Which modules change; which modules
only react. If the request was ambiguous in a way that changes the design,
state the interpretation you adopted and why.>

## 3. Failure-mode surface

Which of the four failure modes this feature could plausibly produce, and
where:

| Mode | Applies? | Where the risk is |
| --- | --- | --- |
| F1 — sibling repository import | yes/no | |
| F2 — raw `Error` throws | yes/no | |
| F3 — status-code-only tests | yes/no | |
| F4 — missing event integration | yes/no | |

## 4. Business rules

| Rule | Statement | Outcome when violated |
| --- | --- | --- |
| BR-1 | | HTTP <code>, `rule: BR-1` |

Each rule atomic, decidable and attributable to an HTTP outcome or a state
change.

## 5. API surface

| Method + path | Request | Success | Failure |
| --- | --- | --- | --- |

## 6. Events

| Event | Owner | Published when | Consumers |
| --- | --- | --- | --- |

## 7. Sprint breakdown

| Sprint | Scope | Rules | Deliverable |
| --- | --- | --- | --- |
| 1 | | | |
| 2 | | | |

## 8. Out of scope

<What this feature deliberately does not do, and why. This is what stops the
Generator helpfully building more than was asked.>

## 9. Open decisions for the developer

<Anything the developer should confirm or overrule before approving. Empty is
a valid answer.>

---

**Developer approval:** reply `APPROVED` to start the autonomous
Generator/Evaluator loop, or give change notes for a revision.
