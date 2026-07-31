---
name: Alertes en arrière-plan — garanties réelles
description: Ce que chaque mécanisme de notification garantit vraiment (page vs Service Worker)
---

# Alertes en arrière-plan — garanties réelles

**Règle :** le chemin fiable pour notifier onglet en arrière-plan est un poll ≥ 60 s dans la **page** (les timers ≥ 1/min survivent au throttling des onglets inactifs). Les timers d'un Service Worker ne sont PAS fiables : le navigateur termine les SW inactifs.

**Why :** une première implémentation basée sur `setInterval` dans le SW a été rejetée en revue — le SW est suspendu dès qu'il est idle ; Periodic Background Sync n'existe que sur Chrome/Edge avec PWA installée et à une fréquence décidée par le navigateur.

**How to apply :** garder le watcher dans la page (poll + `registration.showNotification` avec tag partagé pour dédupliquer avec le SW) ; traiter periodicsync comme un bonus opportuniste ; pour couvrir navigateur fermé, il faut Web Push côté serveur (clés VAPID + abonnements).

Note : les ids d'alertes sont des entiers (serial PostgreSQL), pas des chaînes.
