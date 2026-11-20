import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function lire(nom: string) {
  return JSON.parse(readFileSync(new URL(`../docs/the-i/${nom}`, import.meta.url), "utf8"));
}

type Definition = {
  id: string;
  type: "simple" | "divisee" | "corrompue";
  commun: string[];
  haut?: string[];
  bas?: string[];
  siDeAccepte?: string[];
};
type Vue = { page: number; repere: string; visuel?: string };
type Motif = { id: string; preuve: string; correspondance: string; definition: string; illustrations: Vue[] };
type Observation = Omit<Motif, "definition"> & {
  definitionComparee?: string;
  groupesVisibles: Partial<Record<"commun" | "haut" | "bas" | "siDeAccepte", string[]>>;
  observation: string;
};

const inventaire = lire("livret-fr.json");
const motifs: Motif[] = inventaire.motifsComplets;
const partiels: Observation[] = inventaire.observationsPartielles;
const releve = lire("the-i.json");
const visuels = lire("visuels.json");
const definitions = new Map((releve.definitions as Definition[]).map((d) => [d.id, d]));
const exemplaires = releve.exemplaires as { id: string; definition: string; rectosTtsConcordants: string[] }[];
const ressources = visuels.ressources as { id: string; source: string; page?: number; face: string }[];

describe("Thé I — inventaire des illustrations du livret FR", () => {
  it("lie chaque observation à une page et à un repère distinct, sans compter de cartes FR", () => {
    expect(inventaire).toMatchObject({
      source: "livret-fr", manifestVisuels: "visuels.json", catalogueComparaison: "the-i.json", quantitesParMotifFr: null,
    });
    expect(visuels.sources[inventaire.source].url).toBe(
      "https://luckyduckgames.com/france/index.php?controller=attachment&id_attachment=1416",
    );
    expect(motifs).toHaveLength(11);
    expect(new Set(motifs.map((m) => m.definition)).size).toBe(motifs.length);
    const observations = [...motifs, ...partiels];
    expect(new Set(observations.map((m) => m.id)).size).toBe(observations.length);
    const locateurs = new Set<string>();
    for (const observation of observations) {
      expect(observation.id).toMatch(/^fr-[a-z0-9-]+$/);
      expect(observation.illustrations.length).toBeGreaterThan(0);
      expect(observation).not.toHaveProperty("occurrences");
      const definition = "definition" in observation ? observation.definition : observation.definitionComparee;
      if (definition !== undefined) expect(definitions.has(definition)).toBe(true);
      for (const vue of observation.illustrations) {
        expect(visuels.sources[inventaire.source].pagesReleve).toContain(vue.page);
        expect(vue.repere.trim()).not.toBe("");
        const locateur = `${vue.page}:${vue.repere}`;
        expect(locateurs.has(locateur)).toBe(false);
        locateurs.add(locateur);
        if (vue.visuel !== undefined) {
          expect(ressources.find((r) => r.id === vue.visuel)).toMatchObject({
            source: inventaire.source, page: vue.page, face: "recto",
          });
        }
      }
    }
    expect(motifs.find((m) => m.definition === "the-i-29400")?.illustrations).toHaveLength(3);
  });

  it("distingue les groupes complets des rapprochements partiels", () => {
    const groupesParType = { simple: [], divisee: ["haut", "bas"], corrompue: ["siDeAccepte"] };
    for (const motif of motifs) {
      expect(motif.correspondance).toBe("exacte");
      expect(["recto-lisible", "recto-lisible-en-scene"]).toContain(motif.preuve);
      const d = definitions.get(motif.definition)!;
      for (const cle of ["commun", "haut", "bas", "siDeAccepte"] as const) {
        if (cle === "commun" || groupesParType[d.type].some((groupe) => groupe === cle)) {
          expect(d[cle]?.length).toBeGreaterThan(0);
          expect(d[cle]?.every((effet) => typeof effet === "string" && effet.trim() !== "")).toBe(true);
        } else {
          expect(d[cle]).toBeUndefined();
        }
      }
    }
    for (const partiel of partiels) {
      expect(["partielle", "absente", "indeterminee"]).toContain(partiel.correspondance);
      expect(partiel).not.toHaveProperty("definition");
      expect(partiel.definitionComparee !== undefined).toBe(partiel.correspondance !== "indeterminee");
      expect(["recto-partiel", "lecture-incertaine", "scene-masquee"]).toContain(partiel.preuve);
      expect(partiel.observation.trim()).not.toBe("");
      expect(Object.keys(partiel.groupesVisibles).length).toBeGreaterThan(0);
      for (const [cle, effets] of Object.entries(partiel.groupesVisibles)) {
        expect(["commun", "haut", "bas", "siDeAccepte"]).toContain(cle);
        expect(effets.length).toBeGreaterThan(0);
        expect(effets.every((effet) => typeof effet === "string" && effet.trim() !== "")).toBe(true);
      }
    }
    expect(partiels.find((p) => p.id === "fr-p11-flamant-quete")).toMatchObject({
      preuve: "recto-partiel", definitionComparee: "the-i-29408",
    });
    expect(partiels.find((p) => p.id === "fr-p11-alice-de-coin")).toMatchObject({
      correspondance: "absente", definitionComparee: "the-i-29424",
    });
    expect(motifs.map((m) => m.definition)).not.toContain("the-i-29408");
    expect(definitions.get("the-i-29420")).toMatchObject({
      commun: ["Affectation : 2 unités"], haut: ["Marché : choix de 1 carte Pays des Merveilles"],
      bas: ["Déblocage : 1 capacité de Faction au choix"],
    });
  });

  it("garde distincts le témoignage FR de L1C10, L2C10 et les deux variantes TTS", () => {
    const l1c10 = exemplaires.find((e) => e.id === "the-i-bgg-l1c10")!;
    const l2c10 = exemplaires.find((e) => e.id === "the-i-bgg-l2c10")!;
    expect(motifs.find((m) => m.definition === l1c10.definition)).toMatchObject({
      illustrations: [{ page: 9, visuel: "livret-the-i-corrompue" }],
    });
    expect(definitions.get(l1c10.definition)).toMatchObject({
      commun: ["Affectation : 1 unité", "Marché : choix de 1 carte Pays des Merveilles"],
      siDeAccepte: ["Jet du dé Éclat", "Gain : 1 Allié faible au choix"],
    });
    expect(motifs.map((m) => m.definition)).not.toContain(l2c10.definition);
    expect(partiels.find((p) => p.definitionComparee === l2c10.definition)).toMatchObject({
      correspondance: "partielle",
      groupesVisibles: { siDeAccepte: ["Jet du dé Éclat", "Affectation supplémentaire (nombre incertain)"] },
    });
    expect(definitions.get(l2c10.definition)).toMatchObject({
      commun: ["Affectation : 2 unités", "Déblocage : 1 capacité de Faction au choix"],
      siDeAccepte: ["Jet du dé Éclat", "Affectation supplémentaire : 2 unités"],
    });
    expect(exemplaires).toHaveLength(30);
    expect(definitions.size).toBe(29);
    expect(exemplaires.filter((e) => e.rectosTtsConcordants.length > 0)).toHaveLength(28);
    expect([l1c10, l2c10].every((e) => e.rectosTtsConcordants.length === 0)).toBe(true);
    expect(releve.comparaisonTts.variantesTtsSansEquivalentExactSurLaPhoto).toMatchObject([
      { rectoReference: "tts-carte-29427-recto", siDeAccepte: ["Jet du dé Éclat", "Affectation supplémentaire : 3 unités"] },
      { rectoReference: "tts-carte-29428-recto", commun: ["Affectation : 1 unité", "Déblocage : 1 capacité de Faction au choix"] },
    ]);
    for (const variante of releve.comparaisonTts.variantesTtsSansEquivalentExactSurLaPhoto) {
      expect(ressources.find((r) => r.id === variante.rectoReference)?.source).toBe("tts-2886627193");
      expect(exemplaires.some((e) => e.rectosTtsConcordants.includes(variante.rectoReference))).toBe(false);
    }
  });
});
