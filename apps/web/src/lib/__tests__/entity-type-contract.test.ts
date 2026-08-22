/**
 * Contract between the three places an entity type is named.
 *
 * Regression guard: the sync protocol was first written against the Dexie table
 * names ("patients") while the outbox actually writes the domain entity type
 * ("patient"), so the hub rejected every clinical change. Unit tests on both
 * sides passed because both used the same wrong name. This test compares them.
 */
import { describe, expect, it } from "vitest";
import { ENTITY_CLASS_BY_TYPE, STATE_PRIORITY, IDENTITY_CRITICAL_FIELDS } from "@phc/shared";
import { ENTITY_TYPE_BY_TABLE } from "../../db/repository";
import { TABLE_BY_ENTITY_TYPE } from "../sync-engine";

const knownTypes = Object.keys(ENTITY_CLASS_BY_TYPE);

describe("entity_type naming contract", () => {
  it("gives every type the outbox can emit a conflict class", () => {
    for (const [table, entityType] of Object.entries(ENTITY_TYPE_BY_TABLE)) {
      expect(
        knownTypes,
        `${table} writes entity_type "${entityType}", which the hub does not know`,
      ).toContain(entityType);
    }
  });

  it("maps every syncable type back to a real Dexie table", () => {
    for (const [entityType, table] of Object.entries(TABLE_BY_ENTITY_TYPE)) {
      expect(knownTypes, `no conflict class for "${entityType}"`).toContain(entityType);
      // Config is hub-authoritative and never applied from a pull.
      expect(
        Object.values(ENTITY_TYPE_BY_TABLE).includes(entityType) || entityType === "audit_event",
        `"${entityType}" -> "${table}" is not a type the repository ever writes`,
      ).toBe(true);
    }
  });

  it("keys the state ladders and identity fields by wire type", () => {
    for (const entityType of Object.keys(STATE_PRIORITY)) {
      expect(knownTypes).toContain(entityType);
    }
    for (const entityType of Object.keys(IDENTITY_CRITICAL_FIELDS)) {
      expect(knownTypes).toContain(entityType);
    }
  });

  it("uses snake_case singular on the wire, never a Dexie table name", () => {
    const tableNames = Object.keys(ENTITY_TYPE_BY_TABLE);
    for (const entityType of knownTypes) {
      expect(tableNames, `"${entityType}" looks like a table name`).not.toContain(entityType);
      expect(entityType).toMatch(/^[a-z][a-z_]*$/);
    }
  });
});
