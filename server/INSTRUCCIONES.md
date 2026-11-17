# Conectar BAZARIX a una hoja de Google (modo Equipo)

Se hace **una vez por grupo**. Quien lo haga será el dueño de los datos. Tarda ~10 minutos.

## 1. Crear la hoja y pegar el script
1. En Google Drive crea una **hoja de cálculo nueva** (ponle el nombre de tu bazar o grupo).
2. Menú **Extensiones → Apps Script**.
3. Borra lo que haya en `Código.gs` y pega el contenido de **`Core.gs`**. Renombra ese archivo a `Core`.
4. Con **＋ → Script** agrega un segundo archivo, pega **`Sheet.gs`** y nómbralo `Sheet`.
5. Guarda (💾).

## 2. Preparar la hoja
1. Vuelve a la hoja y **recarga la página**. Aparece el menú **BAZARIX**.
2. **BAZARIX → 1. Preparar hoja.** Google pedirá permisos la primera vez (Revisar permisos → tu cuenta → Avanzado → Ir al proyecto → Permitir). Es normal: el script es tuyo.
   Crea la pestaña `Datos` y genera la **clave del equipo**.

## 3. Publicar el script
1. En Apps Script: **Implementar → Nueva implementación → ⚙️ Aplicación web**.
2. **Ejecutar como:** *Yo*. **Quién tiene acceso:** *Cualquier persona*.
   (La protección es la clave del equipo; sin ella el script no responde.)
3. **Implementar** y copia la **URL** (termina en `/exec`).

> Si luego editas el código: **Implementar → Administrar implementaciones → ✏️ → Versión nueva**. Sin eso la URL sigue usando el código viejo.

## 3b. Ver URL y clave cuando quieras
Menú **BAZARIX → 2. Ver URL y clave del equipo** (se pueden copiar de ahí).

## 4. Conectar la app
1. En BAZARIX abre ⚙️ → **Almacenamiento → 👥 Equipo**.
2. Pega la **URL** y la **clave**, pulsa **Probar conexión** (debe decir ✅ Conectado) y **Guardar y usar**.
3. Cada persona del equipo repite el paso 4 en su dispositivo con la misma URL y clave.
4. En ⚙️ puedes pulsar **🔄 Sincronizar ahora** cuando quieras.

## Cómo funciona (resumen)
- Cada expositor, tarea, mesa, movimiento de caja… es **una fila** de la pestaña `Datos` con su versión.
- La app guarda **primero en tu dispositivo** y sube en segundo plano solo lo que cambió. Sin internet no se pierde nada.
- Si dos personas editan **lo mismo** desde la misma versión, gana la que llegó primero y a la otra se le avisa.
- **Las fotos no se suben** (logo, foto de expositor, fondo del plano): se quedan en el dispositivo de quien las puso.
- Los movimientos de caja son filas separadas: varios cajeros pueden cobrar a la vez.

## Importante
- **No edites a mano** la pestaña `Datos`. Si necesitas respaldo: *Archivo → Descargar* o *Hacer una copia*.
- Comparte la clave **solo con tu equipo**. Para cambiarla: **BAZARIX → Regenerar clave** (todos tendrán que poner la nueva).
- Hoy todos los que tienen la clave pueden ver y editar todo. Los **roles y códigos de invitación** llegan en el sprint 3.
- Contiene teléfonos y correos de terceros: avisa a tus expositores y no compartas la hoja con quien no deba verla.
- Límites de Google: cuota diaria de ejecuciones y ~6 minutos por ejecución. Sobra para un grupo; no para cientos de personas a la vez.
