# Meal Plan — funciones implementadas

1. **Cuestionario nutricional** — pestaña Cuestionario en `/meals` (`PUT /api/meals/preferences`)
2. **Tinder de comidas** — pestaña Gustos (`GET /swipe-cards`, `POST /swipe`)
3. **Calendario flexible** — mover, posponer, próxima semana, reemplazar, “comí otra cosa”, estados
4. **Equilibrio nutricional** — `nutritionNote` por plato
5. **Recetas IA** — regenerar / más rápida / económica / despensa / sustituir / favorita / cocinar
6. **Preparaciones anticipadas** — `preps` en el plan
7. **Batch cooking** — `GET /api/meals/:planId/batch`
8. **Despensa + lista** — faltantes → necesidades; cocinar descuenta despensa
9. **Estados** — ver `MEAL_STATUSES` en `@fridgeorder/shared`

La información nutricional es orientativa y no sustituye consejo médico.
