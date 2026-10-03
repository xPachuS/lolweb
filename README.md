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

## Probarla en tu ordenador

Los módulos JavaScript no funcionan abriendo `index.html` con doble clic: hace falta un servidor local.

```bash
cd lolweb
python3 -m http.server 8000
# abre http://localhost:8000
```

(o `npx serve` si usas Node, o la extensión *Live Server* de VS Code).

## Publicarla gratis

**Netlify (lo más fácil)**: entra en app.netlify.com/drop y arrastra la carpeta `lolweb`. En segundos tienes una URL.

**GitHub Pages**: sube la carpeta a un repositorio → *Settings → Pages* → rama `main`, carpeta `/ (root)`.

**Cloudflare Pages / Vercel**: "nuevo proyecto" desde el repositorio, sin comando de build y con directorio de salida `/`.

## Estructura

```
index.html        cabecera, menú y contenedor de vistas
css/styles.css    todo el diseño (variables de color al principio)
js/config.js      ligas, histórico de Mundiales, clave y tiempos de refresco
js/api.js         llamadas a lolesports y Leaguepedia + caché
js/app.js         rutas (#/, #/mundiales, #/mundial/2024, #/ligas, #/liga/lec) y vistas
```

## Personalizar

- **Añadir o quitar ligas**: edita `LEAGUES` en `js/config.js`. El `slug` es el de lolesports (p. ej. `lck`, `lec`, `lta_cross`, `vcs`, `ljl-japan`).
- **Cerrar una edición nueva en la hemeroteca**: cuando acabe un Mundial, la web ya calcula el campeón a partir de la final. Si quieres que tenga sede y ficha completa como las demás, añade una línea a `WORLDS_HISTORY`.
- **Colores**: variables `--gold`, `--teal`, etc. en `css/styles.css`.

## Si algo deja de cargar

- *"No se ha podido conectar con lolesports"*: Riot puede cambiar la clave pública. Busca la actual (aparece en las peticiones de lolesports.com, pestaña Red del navegador) y cámbiala en `LOLESPORTS_KEY`.
- *Leaguepedia lenta o con error*: limita las consultas anónimas si hay muchas seguidas. La caché lo mitiga; vuelve a intentarlo en un minuto.
- Si alguna API bloqueara las peticiones directas desde el navegador (CORS), la solución es un pequeño proxy (p. ej. una función de Netlify o un Worker de Cloudflare) que reenvíe la petición; basta con cambiar las URL base en `js/config.js`.

Proyecto de aficionados sin relación con Riot Games.
