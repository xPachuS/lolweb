# Grieta Archivo — Mundiales y ligas de League of Legends

Web estática (HTML + CSS + JavaScript, sin dependencias ni compilación) con:

- **Inicio**: el Mundial en curso con partidos en directo, próximos y resultados, más lo que se esté jugando en otras ligas.
- **Hemeroteca**: todos los Mundiales desde 2011, con campeón, final, sede y palmarés por organización y región. Cada edición muestra todas sus series por fase (Play-In, fase suiza / grupos, eliminatorias).
- **Ligas**: LCK, LPL, LEC, LCS, LCP, CBLOL, MSI y First Stand, con clasificación, calendario, resultados y selector de torneo.

## De dónde salen los datos

| Fuente | Para qué | Notas |
|---|---|---|
| API de lolesports (`esports-api.lolesports.com`) | Directo, calendarios y clasificaciones | No oficial, la misma que usa lolesports.com. Clave pública en `js/config.js`. |
| Leaguepedia (`lol.fandom.com/api.php`, tablas Cargo) | Partidos de cada Mundial y detección de ediciones nuevas | Licencia CC BY-SA: mantén la atribución del pie de página. |

**Actualización automática**: la página se refresca sola cada 30 s si hay partidos en directo y cada 5 min si no. Además, cuando empiece el Mundial 2027 (y siguientes) aparecerá solo en la hemeroteca porque se consulta a Leaguepedia; no hay que tocar código.

Las respuestas se guardan en `localStorage` (1 min para datos en vivo, 7 días para Mundiales terminados) para no saturar las APIs.

Proyecto de aficionados sin relación con Riot Games.
