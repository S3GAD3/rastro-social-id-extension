<div align="center">
  <img src="icons/logo-rastro-id-banner.png" alt="RASTRO ID" width="420">

  # RASTRO ID

  **Extensión OSINT para identificar y documentar IDs de perfiles en redes sociales**

  Chrome / Edge · Manifest V3 · Versión 1.2.6 (prueba) · Creado por **S3GAD3**
</div>

## Descripción

**RASTRO ID** es una extensión de navegador del **Kit RASTRO** orientada a la investigación en fuentes abiertas (OSINT). Permite consultar identificadores numéricos de perfiles, conservar las consultas en un historial local y elaborar informes exportables para documentar los resultados.

La versión **1.2.6** incorpora mejoras en Instagram frente a errores HTTP de sus endpoints internos y un procedimiento de **contraste asistido** para las consultas inversas que no pueden resolverse automáticamente.

> **Importante:** es una versión de prueba. Los servicios de las plataformas pueden cambiar, exigir una sesión o restringir las peticiones. Una respuesta 403, 404 o 429 no demuestra por sí misma que el perfil no exista.

## Redes compatibles

| Plataforma | Username → ID | ID → Username | Observaciones |
|:--|:--:|:--:|:--|
| Instagram | ✅ | ⚠️ | Consulta inversa directa cuando está disponible; historial local y contraste asistido para IDs desconocidos. |
| Facebook | ✅ | — | La extracción depende de que el ID sea accesible en la URL o en los datos públicos del perfil. |
| TikTok | ✅ | — | Extracción desde los datos accesibles del perfil. |
| X (Twitter) | ✅ | ✅ | Puede requerir una sesión iniciada en X; se basa en las respuestas que carga la plataforma. |

**✅** Funcionalidad implementada, sujeta a disponibilidad y restricciones de cada red. **⚠️** No hay resolución automática fiable para todos los IDs desconocidos.

## Funcionalidades principales

- **Consulta individual:** introducción de username, URL o ID según la plataforma y el modo seleccionado.
- **Consulta por lotes:** entradas múltiples, detección de redes mediante URL o prefijos y pausas entre consultas.
- **Historial local:** registros de consultas y resultados, filtros y exportación a **JSON** y **CSV**.
- **Informes:** selección de perfiles, referencia de diligencias, unidad, investigador/TIP y observaciones; informes **HTML** imprimibles o convertibles a PDF y **TXT**.
- **Trazabilidad:** método de obtención, fecha/hora y hashes **SHA-256** para los registros o descargas según corresponda.
- **Identidad visual del Kit RASTRO:** logotipo RASTRO ID en amarillo y diseño institucional en tonos azules.

## Novedades de la versión 1.2.6

### Instagram: mayor tolerancia a errores

La ruta `web_profile_info` puede responder con un **HTTP 404**, incluso cuando el perfil está disponible. La extensión intenta obtener el ID mediante el HTML público del perfil en lugar de terminar automáticamente la consulta.

La conversión inversa **ID → username** sigue siendo más limitada: los endpoints internos de Instagram pueden devolver **403**, **404** o **429**. Cuando falla la consulta directa, se comprueba si ya existe una asociación previa en el historial local y, si es posible, se contrasta de nuevo con Instagram.

### Consulta inversa asistida con MiniWebtool

Para un ID desconocido que no se pueda resolver automáticamente, la extensión ofrece una ayuda manual mediante [MiniWebtool](https://miniwebtool.com/instagram-user-id-lookup/):

1. En RASTRO ID selecciona **Instagram → ID → Username**, introduce el identificador y pulsa **Buscar**.
2. Si no se obtiene resultado, pulsa **Consultar en MiniWebtool**.
3. RASTRO ID abrirá su interfaz en una **pestaña persistente** y MiniWebtool en otra, de forma que el popup no se pierda al cambiar el foco.
4. Consulta el ID en MiniWebtool y copia el username que aparezca.
5. Regresa a RASTRO ID, pega el username y pulsa **Contrastar**.
6. **Solo si Instagram devuelve el mismo ID para ese username**, la extensión registra la asociación como verificada; en caso contrario comunica que el resultado no se ha podido confirmar.

La consulta a MiniWebtool es **manual**, no hay extracción automática ni integración con su API. El servicio es ajeno a RASTRO y puede imponer límites de uso. La versión 1.2.6 **no requiere SandBase ni una API de pago**.

## Instalación en Chrome y Edge

1. Descarga el ZIP de la extensión y **descomprímelo** en una carpeta estable.
2. Accede a `chrome://extensions` o `edge://extensions`.
3. Activa **Modo de desarrollador**.
4. Pulsa **Cargar descomprimida**.
5. Selecciona la carpeta que contiene el archivo `manifest.json`.
6. Fija el icono **RASTRO ID** en la barra del navegador para acceder cómodamente.

> Para actualizar una instalación anterior, carga la carpeta nueva y evita mantener dos versiones activas de RASTRO ID, para no confundir los resultados.

## Uso operativo recomendado

- Comprueba siempre que el perfil localizado corresponde a la persona o entidad investigada. **La coincidencia de un identificador no acredita por sí sola la identidad civil del titular.**
- Distingue en tus informes los datos **obtenidos directamente de una plataforma**, los **proporcionados por terceros** y las **inferencias analíticas**.
- Conserva la referencia de investigación y revisa las marcas de tiempo y los hashes antes de incorporar datos a un expediente.
- Si Instagram limita las consultas, evita repetirlas de forma intensiva; no interpretes los errores de acceso como ausencia de la cuenta.
- Antes de introducir un ID investigado en MiniWebtool, valora la sensibilidad de los datos y el marco normativo aplicable. La consulta implica transmitir ese identificador a un servicio externo.
- Usa únicamente cuentas y perfiles a los que tengas acceso legítimo y respeta las condiciones aplicables de cada plataforma.

## Arquitectura del proyecto

```text
rastro-social-id-extension/
├── manifest.json
├── background.js
├── capture/            # Captura puntual de respuestas de X
├── icons/              # Iconos y logotipo
├── lib/                # Funciones comunes, historial e informes
├── providers/          # Instagram, Facebook, TikTok y X
├── report/             # Vista de informes
└── ui/                 # Popup e interfaz de usuario
```

La extensión utiliza **Manifest V3**. El historial y el estado temporal de la consulta asistida se mantienen en el almacenamiento del navegador. No se envían datos a SandBase en esta versión.

## Limitaciones conocidas

- **Instagram:** no se garantiza la conversión automática de ID a username para un identificador no consultado anteriormente. La comprobación asistida depende de fuentes externas y de que Instagram permita verificar la correspondencia.
- **Facebook:** la disponibilidad del ID depende de los datos que Meta exponga para cada perfil.
- **X:** ciertas consultas requieren sesión iniciada y pueden verse afectadas por cambios en GraphQL.
- **TikTok:** pueden aparecer medidas anti-automatización o captchas.
- Los endpoints no oficiales pueden cambiar sin previo aviso; la extensión no tiene relación oficial con Meta, TikTok o X.

## Estado del proyecto

**v1.2.6 — Versión de prueba.** La estructura y los flujos locales se han revisado, pero la disponibilidad de los endpoints debe comprobarse en el navegador del investigador. No se presentan las consultas externas como verificadas automáticamente.

## Autoría y licencia

Desarrollado por **S3GAD3** como parte del **Kit RASTRO**.

Licencia **MIT**. Para publicarlo en GitHub con esta licencia, añade también el archivo `LICENSE` que contenga el texto completo de la licencia MIT y el titular de copyright correspondiente.

Este proyecto es una herramienta independiente de investigación en fuentes abiertas. No está afiliado ni respaldado por las plataformas consultadas.
