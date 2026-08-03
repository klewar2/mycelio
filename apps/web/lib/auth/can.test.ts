import { describe, expect, it } from "vitest";
import { can, canAny, type SessionContext } from "./can";
import type { Tables } from "@/types/database";

function context(permissions: string[]): SessionContext {
  return {
    userId: "00000000-0000-0000-0000-000000000001",
    email: "test@mycelio.test",
    profile: { role: "lecture" } as Tables<"profiles">,
    permissions: new Set(permissions),
  };
}

describe("can", () => {
  it("accorde une permission présente", () => {
    expect(can(context(["map.view"]), "map.view")).toBe(true);
  });

  it("refuse une permission absente", () => {
    expect(can(context(["map.view"]), "finds.create")).toBe(false);
  });

  it("refuse tout sans session", () => {
    expect(can(null, "map.view")).toBe(false);
  });

  it("ne déduit rien du rôle porté par le profil", () => {
    // Le profil dit `lecture`, mais seules les permissions comptent : c'est ce qui permet à la
    // matrice éditable de piloter réellement le comportement.
    const ctx = {
      ...context(["admin.users.manage"]),
      profile: { role: "lecture" },
    } as SessionContext;
    expect(can(ctx, "admin.users.manage")).toBe(true);
  });
});

describe("canAny", () => {
  it("suffit qu'une seule permission soit accordée", () => {
    expect(canAny(context(["finds.export"]), ["finds.create", "finds.export"])).toBe(true);
  });

  it("refuse quand aucune ne l'est", () => {
    expect(canAny(context([]), ["finds.create", "finds.export"])).toBe(false);
  });
});
