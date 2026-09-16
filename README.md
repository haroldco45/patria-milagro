# Seguimiento a la Patria Milagro

Bitácora ciudadana de las cinco misiones del Decreto 1373 de 2026. Un robot busca noticias todos los días, Claude las clasifica y usted aprueba cuáles se publican.

## Cómo funciona

1. **6:00 a. m. (hora de Colombia):** el robot `Buscar noticias` revisa Google Noticias con búsquedas fijas.
2. Descarta las noticias que ya revisó y manda las nuevas a Claude, que decide si son relevantes, a qué misión pertenecen y redacta un resumen neutral.
3. Cada noticia relevante queda como un **issue** con la etiqueta `pendiente`. GitHub le avisa por correo y en la app de GitHub.
4. Usted abre el pendiente, mira el enlace y agrega la etiqueta **`aprobar`** o **`rechazar`**.
5. Si aprueba, el robot `Aplicar decisión` agrega el registro a `datos/datos.json`, cierra el pendiente y la página pública se actualiza sola en uno o dos minutos.

Si un pendiente propone actualizar un indicador (por ejemplo, el PIB de un trimestre nuevo), al aprobarlo también se actualiza ese indicador. Verifique la cifra en la fuente antes.

## Instalación (una sola vez)

1. **Cree el repositorio** en GitHub, público, por ejemplo `patria-milagro`. Suba todos los archivos de esta carpeta, incluidas las carpetas ocultas `.github` y el archivo `.nojekyll`.
   Si arrastra archivos en la web de GitHub, las carpetas que empiezan con punto a veces no se suben: use GitHub Desktop o `git push`.
2. **Agregue la clave de Claude:** Settings → Secrets and variables → Actions → New repository secret. Nombre `ANTHROPIC_API_KEY`, valor: su clave de la API (console.anthropic.com).
3. **Permisos del robot:** Settings → Actions → General → Workflow permissions → marque *Read and write permissions* y guarde.
4. **Active la página:** Settings → Pages → Source: *Deploy from a branch*, rama `main`, carpeta `/ (root)`. La dirección queda como `https://haroldco45.github.io/patria-milagro/`.
5. **Pruebe el robot:** pestaña Actions → *Buscar noticias* → *Run workflow*. Al terminar, revise la pestaña Issues.
6. **Notificaciones:** en el repositorio, botón *Watch* → *All Activity*, para que le lleguen los pendientes al correo. En el celular, la app de GitHub permite poner la etiqueta en pocos toques.

## Ajustes opcionales

- **Modelo:** por defecto usa `claude-sonnet-5`. Para cambiarlo, cree una variable (no secreto) `CLAUDE_MODEL` en Settings → Secrets and variables → Actions → Variables.
- **Búsquedas:** edite la lista `BUSQUEDAS` en `scripts/buscar.mjs`.
- **Hora:** edite el `cron` en `.github/workflows/buscar-noticias.yml` (está en UTC; Colombia es UTC−5).
- **Valoración de cada misión y nuevos indicadores:** edite `datos/datos.json` directamente en GitHub.
- **Firma:** el texto del pie de página está al final de `index.html`.

## Costos

GitHub Actions y GitHub Pages son gratuitos para repositorios públicos. La API de Claude cobra por uso; las instrucciones fijas usan prompt caching, así que en cada lote después del primero se cobran a una fracción del precio normal. En la pestaña Actions, cada ejecución muestra en el registro cuántos tokens se leyeron de caché.
