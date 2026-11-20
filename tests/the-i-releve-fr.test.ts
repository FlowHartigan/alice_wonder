import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";

function lireJson(fichier: string | URL): unknown {
  return JSON.parse(readFileSync(fichier, "utf8").replace(/^\uFEFF/, ""));
}

const taille = 30;
const referenceFr = "LKY WWR-R01-FR";
const texte = z.string().trim().min(1);
const effet = z.string().refine((libelle) => libelle.trim() !== "", "Effet vide");
const typeCarte = z.enum(["simple", "divisee", "corrompue"]);
const groupes = z.strictObject({
  commun: z.array(effet),
  haut: z.array(effet).min(1),
  bas: z.array(effet).min(1),
  siDeAccepte: z.array(effet).min(1),
}).partial();

const clesParType = {
  simple: ["commun"],
  divisee: ["commun", "haut", "bas"],
  corrompue: ["commun", "siDeAccepte"],
} as const;

type Groupes = z.infer<typeof groupes>;
type TypeCarte = z.infer<typeof typeCarte>;

function groupesCompatibles(type: TypeCarte, effets: Groupes, complets: boolean) {
  const attendus: readonly (keyof Groupes)[] = clesParType[type];
  return Object.keys(effets).every((cle) => attendus.some((attendu) => attendu === cle))
    && (!complets || attendus.every((cle) => effets[cle] !== undefined));
}

// Une signature conserve les frontières et la multiplicité des effets de chaque groupe.
function signature(type: TypeCarte, effets: Groupes) {
  return JSON.stringify([type, clesParType[type].map((cle) => [...effets[cle]!].sort())]);
}

const catalogue = z.object({ definitions: z.array(z.object({
  id: texte,
  type: typeCarte,
  ...groupes.shape,
})).min(1) }).parse(lireJson(new URL("../docs/the-i/the-i.json", import.meta.url)));

const definitions = new Map<string, string>();
for (const { id, type, ...effets } of catalogue.definitions) {
  if (definitions.has(id) || !groupesCompatibles(type, effets, true)) {
    throw new Error(`Définition #37 invalide ou dupliquée : ${id}`);
  }
  definitions.set(id, signature(type, effets));
}
const signaturesConnues = new Set(definitions.values());

const comparaison = z.discriminatedUnion("statut", [
  z.strictObject({ statut: z.literal("exact"), definition: texte }),
  z.strictObject({ statut: z.literal("nouveau"), ecart: z.strictObject({
    definition: texte,
    description: texte,
  }).optional() }),
  z.strictObject({ statut: z.literal("indecis"), raison: texte }),
]);

const fiche = z.strictObject({
  boite: z.strictObject({
    id: texte,
    reference: z.literal(referenceFr),
    provenanceMaterielle: texte,
    tirage: texte.nullable(),
  }),
  exemplaires: z.array(z.strictObject({
    position: z.number().int().min(1).max(taille),
    preuve: texte,
    type: typeCarte.nullable(),
    groupes: groupes.nullable(),
    comparaison,
  })).length(taille),
});

function controler(donnees: unknown) {
  const { exemplaires } = fiche.parse(donnees);
  const positions = new Set<number>();
  const preuves = new Set<string>();
  const confirmes = new Map<string, number>();
  const nouveaux = new Map<string, number>();
  const indecis: number[] = [];
  let totalNouveaux = 0;

  for (const { position, preuve, type, groupes: effets, comparaison: resultat } of exemplaires) {
    function refuser(message: string): never {
      throw new Error(`Position ${position} : ${message}`);
    }
    if (positions.has(position)) refuser("position en double");
    if (preuves.has(preuve)) refuser("repère de preuve en double");
    positions.add(position);
    preuves.add(preuve);

    if (resultat.statut === "indecis") {
      const typesPossibles = type === null ? typeCarte.options : [type];
      if (effets !== null && !typesPossibles.some((possible) => groupesCompatibles(possible, effets, false))) {
        refuser("groupes partiels incompatibles");
      }
      indecis.push(position);
      continue;
    }

    if (type === null || effets === null || !groupesCompatibles(type, effets, true)) {
      refuser("type ou groupes complets attendus");
    }
    const motif = signature(type, effets);
    if (resultat.statut === "exact") {
      const attendu = definitions.get(resultat.definition);
      if (attendu === undefined) refuser("définition inconnue");
      if (motif !== attendu) refuser("le type ou les groupes diffèrent de la définition");
      confirmes.set(resultat.definition, (confirmes.get(resultat.definition) ?? 0) + 1);
    } else {
      if (resultat.ecart && !definitions.has(resultat.ecart.definition)) refuser("définition d'écart inconnue");
      if (signaturesConnues.has(motif)) refuser("le motif déclaré nouveau existe déjà dans #37");
      nouveaux.set(motif, (nouveaux.get(motif) ?? 0) + 1);
      totalNouveaux++;
    }
  }

  return {
    total: exemplaires.length,
    positionsUniques: positions.size,
    preuvesUniques: preuves.size,
    confirmesParMotif: Object.fromEntries(confirmes),
    nouveaux: { total: totalNouveaux, parMotif: Object.fromEntries(nouveaux) },
    indecis: { total: indecis.length, positions: indecis.sort((a, b) => a - b) },
  };
}

const positionsAttendues = Array.from({ length: taille }, (_, i) => i + 1);
type Exemplaire = z.input<typeof fiche>["exemplaires"][number];

// Toutes les positions et tous les repères ci-dessous sont fictifs.
function synthetique() {
  const exemplaires: Exemplaire[] = positionsAttendues.map((position) => ({
    position, preuve: `fictif-${position}`, type: null, groupes: null,
    comparaison: { statut: "indecis", raison: "Lecture fictivement incertaine" },
  }));
  const divisee: Groupes = {
    commun: ["Affectation : 2 unités"],
    haut: ["Force du Chef : +1", "Pioche : 1 Quête"],
    bas: ["Déblocage : 1 capacité de Faction au choix"],
  };
  const variante: Groupes = {
    commun: ["Affectation : 2 unités", "Déblocage : 1 capacité de Faction au choix"],
    siDeAccepte: ["Jet du dé Éclat", "Affectation supplémentaire : 3 unités"],
  };
  const marches: Groupes = {
    commun: ["Marché : choix de 1 carte Pays des Merveilles", "Affectation : 1 unité"],
    siDeAccepte: ["Gain : 1 Allié faible au choix", "Jet du dé Éclat"],
  };
  Object.assign(exemplaires[0], {
    type: "divisee", groupes: divisee, comparaison: { statut: "exact", definition: "the-i-29426" },
  });
  Object.assign(exemplaires[1], {
    type: "divisee", groupes: { ...divisee, haut: [...divisee.haut!].reverse() },
    comparaison: { statut: "exact", definition: "the-i-29426" },
  });
  Object.assign(exemplaires[2], {
    type: "corrompue", groupes: variante, comparaison: { statut: "nouveau", ecart: {
      definition: "the-i-capacite-de-unites", description: "Une unité supplémentaire de plus dans siDeAccepte",
    } },
  });
  Object.assign(exemplaires[3], {
    type: "corrompue", groupes: { ...variante, siDeAccepte: [...variante.siDeAccepte!].reverse() },
    comparaison: { statut: "nouveau" },
  });
  Object.assign(exemplaires[4], {
    type: "corrompue", groupes: marches,
    comparaison: { statut: "exact", definition: "the-i-marche-de-allie-faible" },
  });
  Object.assign(exemplaires[5], { type: "divisee", groupes: { haut: ["Effet fictif lisible"] } });
  Object.assign(exemplaires[6], {
    type: "simple", groupes: { commun: ["Gain : 1 jeton Forge", "Force du Chef : +1", "Défausse : 1 Éclat"] },
    comparaison: { statut: "exact", definition: "the-i-29415" },
  });
  return {
    boite: { id: "boite-fictive", reference: referenceFr, provenanceMaterielle: "Simulation", tirage: null },
    exemplaires,
  } satisfies z.input<typeof fiche>;
}

describe("Thé I FR — contrôle documentaire hors application", () => {
  it("vérifie le gabarit vierge sans le prendre pour une relève", () => {
    const gabarit = lireJson(new URL("../docs/the-i/releve-fr.gabarit.json", import.meta.url));
    expect(gabarit).toEqual({
      boite: { id: null, reference: null, provenanceMaterielle: null, tirage: null },
      exemplaires: positionsAttendues.map((position) => ({
        position, preuve: null, type: null, groupes: null, comparaison: null,
      })),
    });
    expect(() => controler(gabarit)).toThrow();
  });

  it("compte les exemplaires du même motif et sépare les nouveaux des indécis", () => {
    const releve = synthetique();
    const bilan = controler(releve);
    expect(bilan).toMatchObject({
      total: 30, positionsUniques: 30, preuvesUniques: 30,
      confirmesParMotif: { "the-i-29426": 2, "the-i-marche-de-allie-faible": 1, "the-i-29415": 1 },
      nouveaux: { total: 2 },
      indecis: { total: 24, positions: [6, ...positionsAttendues.slice(7)] },
    });
    expect(Object.values(bilan.nouveaux.parMotif)).toEqual([2]);
  });

  const invalides: [string, (releve: ReturnType<typeof synthetique>) => void, RegExp][] = [
    ["29 lignes", (r) => { r.exemplaires.pop(); }, /exemplaires/],
    ["une position hors plage", (r) => { r.exemplaires[0].position = 31; }, /position/],
    ["une position répétée", (r) => { r.exemplaires[1].position = 1; }, /position en double/],
    ["une preuve répétée", (r) => { r.exemplaires[1].preuve = " fictif-1 "; }, /preuve en double/],
    ["une preuve manquante pour un indécis", (r) => { r.exemplaires[5].preuve = " "; }, /preuve/],
    ["une provenance vide", (r) => { r.boite.provenanceMaterielle = " "; }, /provenanceMaterielle/],
    ["une autre édition", (r) => { Object.assign(r.boite, { reference: "autre édition" }); }, /reference/],
    ["une référence exacte orpheline", (r) => {
      r.exemplaires[0].comparaison = { statut: "exact", definition: "inconnue" };
    }, /définition inconnue/],
    ["une référence d'écart orpheline", (r) => {
      r.exemplaires[2].comparaison = { statut: "nouveau", ecart: { definition: "inconnue", description: "Écart" } };
    }, /définition d'écart inconnue/],
    ["une carte divisée sans bas", (r) => { delete r.exemplaires[0].groupes!.bas; }, /groupes complets/],
    ["deux branches permutées", (r) => {
      const g = r.exemplaires[0].groupes!;
      [g.haut, g.bas] = [g.bas, g.haut];
    }, /diffèrent de la définition/],
    ["un groupe de dé sur une simple", (r) => {
      r.exemplaires[6].groupes!.siDeAccepte = ["Jet du dé Éclat"];
    }, /groupes complets/],
    ["un motif connu déclaré nouveau", (r) => { r.exemplaires[4].comparaison = { statut: "nouveau" }; }, /existe déjà/],
    ["des groupes partiels incompatibles", (r) => {
      r.exemplaires[5].groupes!.siDeAccepte = ["Jet du dé Éclat"];
    }, /groupes partiels incompatibles/],
    ["un indécis sans raison", (r) => { r.exemplaires[5].comparaison = { statut: "indecis", raison: " " }; }, /raison/],
  ];

  it.each(invalides)("refuse %s", (_cas, modifier, erreur) => {
    const releve = synthetique();
    modifier(releve);
    expect(() => controler(releve)).toThrow(erreur);
  });

  it("ne fusionne pas deux motifs qui diffèrent par la répétition d'un effet", () => {
    const releve = synthetique();
    const effets = releve.exemplaires[3].groupes!.siDeAccepte!;
    effets.push(effets[0]);
    expect(Object.values(controler(releve).nouveaux.parMotif)).toEqual([1, 1]);
  });

  const chemin = process.env.THE_I_RELEVE_FR;
  it.skipIf(chemin === undefined)("contrôle la relève locale indiquée par THE_I_RELEVE_FR", () => {
    const bilan = controler(lireJson(chemin!));
    console.log(JSON.stringify(bilan, null, 2));
  });
});
