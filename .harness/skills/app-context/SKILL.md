# App context - StoreOps

## Purpose

Give every agent the same project-specific language before it plans, writes,
reviews, or records a StoreOps change.

## System

StoreOps is a Node.js 20+, Express 4, strict TypeScript reference API using
in-memory repositories, zod edge validation, Vitest, and supertest. It has five
modules: `activities`, `programmes`, `staff`, `alerts`, and `reports`.

- Activities owns operational tasks and status transitions.
- Programmes owns store programmes and membership.
- Staff owns authentication/profile data and exposes read-only identity ports.
- Alerts owns notifications and reacts to operational events.
- Reports aggregates data and never writes activities, programmes, or staff.

Each module uses Routes -> Service -> Repository. `src/app.ts` is the only
composition root. The nine base endpoints from the brief plus the demonstration
bulk-status endpoint are documented in `README.md`.

## Client risks

F1 sibling repository imports; F2 raw errors; F3 status-only tests; F4 missing
event-bus integration. Every agent output must be traceable to prevention of
these risks and to the approved sprint contract.

## Commands

`npm run gate`, `npm run gate:full`, `npm run gate:selftest`,
`npm run harness:verify`, and `npm run smoke` are the authoritative checks.
