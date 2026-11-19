---
description: Traite une évolution par issue GitHub, implémentation, revue indépendante et fusion.
---

Évolution demandée : $ARGUMENTS

Si le mode Plan est actif, arrête-toi avant toute écriture et invite l'utilisateur à passer en Build. Si la demande est vide ou ne définit pas de périmètre exploitable, demande une description ou un lien d'issue avant d'agir.

Applique le workflow GitHub d'`AGENTS.md` dans l'ordre : délègue à `github-issue`, puis à `implementation`, puis à `review` avec l'outil `task`. Reprends les corrections dans la même PR et fais relire son dernier SHA. En tant qu'agent principal, vérifie les conditions de fusion et rends les liens et l'état réel du travail.
