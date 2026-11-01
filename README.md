# RASTRO ID

Extensión del Kit RASTRO para Chrome y Edge (Manifest V3, Chrome 111 o superior). Obtiene el ID numérico de perfiles de **Instagram, TikTok y X** y genera informes exportables.

| Red | Username → ID | ID → Username | Sesión |
|---|---|---|---|
| Instagram | ✔ | ✔ | Opcional para username → ID; necesaria para ID → username |
| TikTok | ✔ | — (no hay método fiable) | No necesaria |
| X | ✔ | ✔ | **Necesaria** (inicia sesión en x.com en ese navegador) |

## Instalación
1. Descomprime `rastro-social-id-extension.zip` en una carpeta fija.
2. Abre `chrome://extensions` (o `edge://extensions`) y activa el **Modo de desarrollador**.
3. Pulsa **Cargar descomprimida** y elige la carpeta `rastro-social-id-extension`.

## Uso
- **Consulta:** elige la red o pega directamente la URL del perfil; la red se detecta sola.
  - El botón "Usar el perfil de la pestaña actual" sirve para las tres redes.
  - X tarda unos segundos, porque abre el perfil en una pestaña en segundo plano.
- **Lotes:** uno por línea. Puedes mezclar redes con URLs o con los prefijos `ig:`, `tt:` y `x:`.
  - Pausa mínima: 6 s en X y 2 s en TikTok.
  - El lote se detiene solo ante un 429, o si X exige sesión o devuelve 403.
- **Historial:** se puede filtrar por red y por texto, y exportar a JSON o CSV.
- **Informe:** funciona como un carrito.
  - **Añadir perfiles:** con el botón «＋ Añadir al informe», que aparece en:
    - la ficha de cada consulta;
    - cada línea del historial;
    - el final de un lote («Añadir los N perfiles encontrados»).
  - El número junto a la pestaña **Informe** indica cuántos perfiles hay seleccionados.
  - **Pestaña Informe:**
    1. Lista de perfiles únicos, cada uno con su última consulta. Se marca o desmarca con un clic, y se puede buscar, filtrar por red o por referencia actual, y ver solo los seleccionados.
    2. Datos del informe: unidad, investigador/TIP y observaciones. Opciones de fotos, todas las consultas de cada perfil y consultas sin resultado.
    3. Generar: **Abrir informe HTML**, para imprimir o guardar como PDF, o **Descargar TXT**. Cada descarga lleva su `.sha256`.
  - La selección se conserva al cerrar la ventana.

## Contenido del informe
1. Datos del informe: referencia, unidad, investigador, fecha UTC y local, y hash del conjunto de datos.
2. Resumen de los perfiles: red, username, ID, nombre y hora de consulta.
3. Ficha de cada perfil: foto embebida, ID, username, nombre, bio, enlaces, contadores, privacidad, verificación, fecha de creación y su origen, datos extra y método.
   - Datos extra: FBID en Instagram; secUid y último cambio de username en TikTok; verificación azul en X.
   - Incluye el hash SHA-256 del registro y el de la foto.
4. Consultas sin resultado (opcional).
5. Metodología de cada red utilizada.
6. Observaciones y espacio para firmas.

## Fecha de creación
- **X:** la devuelve la API. Además se calcula a partir del ID (Snowflake) para contrastarla.
- **TikTok:** se calcula a partir del ID (32 bits superiores = segundos Unix).
- **Instagram:** no se puede calcular, porque sus IDs son secuenciales.

## Cómo funciona
- **Instagram:** obtiene el ID con la misma lógica que Rastro InstaId (`web_profile_info`, con el HTML como respaldo).
  - Si el ID sale del HTML, completa la ficha con `users/{id}/info` cuando hay sesión.
  - Sin sesión, saca del HTML el nombre, los contadores aproximados y la foto.
- **Fotos de perfil:** se descargan desde la extensión enviando a la CDN de cada red el `Referer` de su web y sin la cabecera `Origin`.
  - Se prueban varias resoluciones.
  - Si no se consigue, el motivo queda registrado en la ficha («Foto de perfil: …»).
- **TikTok:** descarga el perfil y lee el JSON incrustado `__UNIVERSAL_DATA_FOR_REHYDRATION__`. Si hay captcha o bloqueo, lo lee desde una pestaña en segundo plano.
- **X:** abre el perfil, o `x.com/i/user/{id}`, en una pestaña en segundo plano. Captura de forma pasiva la respuesta `UserByScreenName` o `UserByRestId` que pide la propia web de X.
  - Así no depende de los identificadores de consulta ni de las cabeceras que X cambia a menudo.
  - El script de captura se ejecuta en x.com, pero solo lee esas dos respuestas, no modifica nada, y el service worker las descarta si la pestaña no la abrió una consulta.

## Notas operativas
- Usa cuentas de trabajo en cada red: las consultas quedan asociadas a esa sesión.
- X suspende cuentas que hacen consultas masivas, así que mantén pausas amplias.
- TikTok: si aparece "posible captcha", abre tiktok.com, resuélvelo y repite la consulta.
- El historial (máximo 3.000 registros, con fotos) se guarda solo en el almacenamiento local de la extensión.
- Los endpoints son internos de cada red y pueden cambiar. Cada red está en su propio archivo dentro de `providers/`.

LICENCIA MIT
