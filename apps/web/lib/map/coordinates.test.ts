import { describe, expect, it } from "vitest";
import { formatCoords, parseCoords } from "./coordinates";

describe("formatCoords", () => {
  it("écrit latitude puis longitude, en degrés décimaux", () => {
    expect(formatCoords(43.451234, 1.893456)).toBe("43.45123, 1.89346");
  });

  it("garde le signe des hémisphères sud et ouest", () => {
    expect(formatCoords(-43.5, -1.5)).toBe("-43.50000, -1.50000");
  });

  it("complète les décimales manquantes, pour que deux relevés s'alignent à l'œil", () => {
    expect(formatCoords(43, 1)).toBe("43.00000, 1.00000");
  });
});

describe("parseCoords", () => {
  it("relit ce que formatCoords écrit", () => {
    const point = { lat: 43.45123, lng: 1.89345 };
    expect(parseCoords(formatCoords(point.lat, point.lng))).toEqual(point);
  });

  it("accepte l'espace et le point-virgule comme séparateurs", () => {
    for (const text of ["43.45 1.89", "43.45;1.89", "43.45 ; 1.89"]) {
      expect(parseCoords(text)).toEqual({ lat: 43.45, lng: 1.89 });
    }
  });

  it("accepte la virgule décimale française", () => {
    expect(parseCoords("43,45 1,89")).toEqual({ lat: 43.45, lng: 1.89 });
    expect(parseCoords("43,45123, 1,89345")).toEqual({ lat: 43.45123, lng: 1.89345 });
    expect(parseCoords("43,45;1,89")).toEqual({ lat: 43.45, lng: 1.89 });
    expect(parseCoords("43,45,1,89")).toEqual({ lat: 43.45, lng: 1.89 });
  });

  it("lit les degrés-minutes-secondes copiés depuis Google Maps", () => {
    const point = parseCoords("43°27'04.4\"N 1°53'36.4\"E");
    expect(point!.lat).toBeCloseTo(43.451222, 5);
    expect(point!.lng).toBeCloseTo(1.893444, 5);
  });

  it("lit les degrés et minutes décimales", () => {
    const point = parseCoords("43° 27.073' N, 1° 53.607' E");
    expect(point!.lat).toBeCloseTo(43.451216, 5);
    expect(point!.lng).toBeCloseTo(1.89345, 5);
  });

  it("comprend les lettres d'hémisphère devant comme derrière, O compris", () => {
    expect(parseCoords("N43.45 O1.89")).toEqual({ lat: 43.45, lng: -1.89 });
    expect(parseCoords("43.45S, 1.89W")).toEqual({ lat: -43.45, lng: -1.89 });
  });

  it("remet dans l'ordre quand les lettres donnent l'axe", () => {
    expect(parseCoords("1.89E, 43.45N")).toEqual({ lat: 43.45, lng: 1.89 });
  });

  it("accepte les signes et les espaces surnuméraires", () => {
    expect(parseCoords("  +43.45 ,  -1.89  ")).toEqual({ lat: 43.45, lng: -1.89 });
  });

  it("normalise les apostrophes typographiques et l'espace insécable", () => {
    const point = parseCoords("43°27’04.4”N 1°53’36.4”E");
    expect(point!.lat).toBeCloseTo(43.451222, 5);
  });

  // ------------------------------------------------------------------------
  // Ce qui doit être refusé. Une coordonnée fausse mais plausible est le seul résultat
  // vraiment coûteux : elle envoie quelqu'un ailleurs sans que rien ne le signale.
  // ------------------------------------------------------------------------

  it("refuse une latitude hors bornes", () => {
    expect(parseCoords("143.45, 1.89")).toBeNull();
    expect(parseCoords("43.45, 281.89")).toBeNull();
  });

  it("refuse ce qui n'est pas un couple de nombres", () => {
    for (const text of ["", "   ", "bonjour", "43.45", "43.45, 1.89, 12", "43.45, abc"]) {
      expect(parseCoords(text)).toBeNull();
    }
  });

  it("refuse des minutes ou des secondes supérieures à 60", () => {
    expect(parseCoords("43°90'00\"N 1°00'00\"E")).toBeNull();
    expect(parseCoords("43 90, 1 30")).toBeNull();
  });

  it("refuse deux composantes sur le même axe", () => {
    expect(parseCoords("43.45N, 44.45N")).toBeNull();
  });

  it("ne devine jamais une permutation : sans lettre, l'ordre écrit fait foi", () => {
    expect(parseCoords("1.89, 43.45")).toEqual({ lat: 1.89, lng: 43.45 });
  });
});
