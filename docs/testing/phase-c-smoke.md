# Smoke tests de Fase C

## Estado

- Flujo mock de imagen, edición, vídeo, descarga, historial y share: cubierto por la suite
  automatizada.
- Smoke de producción local 2026-07-29: Worker `/health` 200, OpenAPI 3.1 con cuatro
  rutas, preview web servido y asset de vídeo mock descargado correctamente.
- Smoke live de edición y Veo: pendiente de autorización explícita y key personal. No se ejecuta
  automáticamente ni forma parte de CI.

## Verificación mock local

1. Ejecutar `pnpm run lint && pnpm run format && pnpm run typecheck && pnpm run test`.
2. Ejecutar `pnpm run build`.
3. Arrancar la API y la web según `README.md`.
4. Recorrer solo con teclado:
   - usar un ejemplo de imagen;
   - editar una imagen local;
   - generar y descargar el resultado;
   - restaurarlo y eliminarlo desde el historial;
   - generar el vídeo mock;
   - abrir Share, copiar el enlace y cerrarlo con Escape;
   - navegar Preview/API con flechas.
5. Confirmar que la URL compartida no contiene keys, uploads, resultados, blobs ni task IDs.

## Smoke live opt-in de pago

Condiciones obligatorias:

- usar exclusivamente una key personal de Google AI Studio con billing propio;
- introducirla en el panel de la UI, que usa `sessionStorage`; nunca añadirla a comandos, archivos,
  logs, capturas ni Git;
- obtener autorización explícita inmediatamente antes de cada operación;
- borrar la key desde la UI al terminar.

Operaciones y coste estimado con el pricing verificado el 2026-07-29:

1. Edición con `gemini-3.1-flash-lite-image`: **USD 0.0336** por imagen.
2. Vídeo con `veo-3.1-lite-generate-preview`, 4 s, 720p: **USD 0.20**.

Para cada operación, comprobar la estimación mostrada, autorizar el diálogo de confirmación y
verificar resultado, descarga e historial. En Veo, confirmar además POST 202, polling sin reinicio
de operación y descarga MP4 autenticada. Si no existe autorización o presupuesto, detenerse antes
de pulsar Generar; los tests contractuales no necesitan key.
