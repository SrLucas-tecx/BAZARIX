# Conectar BAZARIX a una hoja de Google (modo Equipo) — versión 3

Lo hace **una sola persona por grupo: el dueño de la hoja**. Después todo el equipo entra con **códigos**.
Tarda ~10 minutos.

## 1. Crear la hoja y pegar el script
1. En Google Drive crea una **hoja de cálculo nueva** (ponle el nombre de tu grupo o bazar).
2. **Extensiones → Apps Script**.
3. Pega el contenido de **`Core.gs`** en `Código.gs` y renómbralo `Core`.
4. Con **＋ → Script** agrega otro archivo, pega **`Sheet.gs`** y nómbralo `Sheet`. Guarda 💾.

## 2. Preparar la hoja
1. Vuelve a la hoja y **recarga la página**: aparece el menú **BAZARIX**.
2. **BAZARIX → 1. Preparar hoja** (autoriza la primera vez: Revisar permisos → tu cuenta → Avanzado → Ir al proyecto → Permitir).
   Crea las pestañas `Datos`, `Usuarios`, `Miembros`, `Codigos` y `RolesAcceso`, y genera la **clave del dueño**.

## 3. Publicar el script
1. **Implementar → Nueva implementación → ⚙️ Aplicación web**.
2. **Ejecutar como:** *Yo*. **Quién tiene acceso:** *Cualquier persona*.
   (Quien no tenga clave o código no obtiene nada: el script lo rechaza.)
3. **Implementar** y copia la **URL** (termina en `/exec`).

> Si luego cambias el código: **Implementar → Administrar implementaciones → ✏️ → Versión nueva**. Sin eso la URL usa el código viejo.

> **¿Ya usabas la versión 2?** Pega los dos archivos nuevos, ejecuta **Preparar hoja** otra vez y publica **versión nueva**. Las filas de la versión 2 no traen bazar asociado y no estarán protegidas por rol: lo más limpio es borrar las filas de la pestaña `Datos` (deja la fila 1) y volver a sincronizar desde tu dispositivo.

## 4. Conectar tu dispositivo como dueño
1. **BAZARIX → 2. Ver URL y clave del dueño** (se pueden copiar de ahí).
2. En la app: ⚙️ → **Almacenamiento → 👥 Equipo** → *Soy el dueño de la hoja* → pega **URL** y **clave** → *Probar conexión* → *Guardar y usar*.
3. **La clave del dueño es solo para ti**: da control total. El equipo entra con códigos.

## 5. Cómo entra el equipo
| Quién | Cómo entra | Qué rol recibe |
|---|---|---|
| **Dueño de la hoja** | Clave del dueño | Todo, en todos los bazares |
| **Quien crea un bazar** | Un *código de creación* que le da el dueño | **Administrador** de ese bazar |
| **Cualquier persona que se une** | Un *código de invitación* del admin del bazar | **Vista** (solo lectura), salvo que el código traiga otro rol |

- **Códigos de creación** (solo el dueño): ⚙️ → 👥 Miembros y roles → *Códigos para crear bazares*. Cada crédito = un bazar nuevo.
- **Códigos de invitación** (admin de cada bazar): ⚙️ → 👥 Miembros y roles → *Invitar con un código*. Eliges rol, usos y días de validez. **El código completo solo se muestra al crearlo.**
- Quien recibe un código: ⚙️ → Almacenamiento → Equipo → *Tengo un código de invitación* → pega la **URL** (te la da el dueño), el **código** y tu **nombre**.
- El admin del bazar puede cambiar el rol de cualquiera, quitarlo del bazar o crear **roles personalizados**.

## 6. Roles y permisos
- **Administrador** (rango 100): todo en su bazar. Siempre debe quedar al menos uno.
- **Vista** (rango 0): ve todo, no cambia nada.
- **Roles personalizados** (rango 1 a 99): el admin elige qué puede hacer (marcar pagos, caja, plano, asistencia, tareas, compras, costos…) con plantillas: Cajero, Acceso / Check-in, Logística y Finanzas.
- **Si dos personas editan lo mismo a la vez:** gana el **rango mayor**; con rango igual, quien llegó primero.
- **Todo se valida en el servidor.** Si alguien sin permiso intenta cambiar algo, el servidor lo rechaza y la app deshace ese cambio con un aviso.

## 7. Cómo funciona (resumen)
- Cada expositor, tarea, mesa, movimiento de caja… es **una fila** en `Datos` con su versión y el rango de quien la editó.
- La app guarda **primero en tu dispositivo** y sube en segundo plano solo lo que cambió. Sin internet no se pierde nada.
- **Cada bazar está aislado:** solo lo ven sus miembros (y el dueño). Los catálogos (categorías, características, expositores guardados) son del equipo y solo los editan los administradores.
- **Las fotos no se suben** (logo, foto de expositor, fondo del plano): se quedan en el dispositivo de quien las puso.

## Importante
- **No edites a mano** las pestañas de la hoja. Respaldo: *Archivo → Descargar* o *Hacer una copia*.
- Los tokens de las personas se guardan **cifrados (hash)**; los códigos también. Quien edite la hoja o el script puede ver los datos del bazar, así que no des acceso de edición a la hoja a quien no deba verlos.
- Hay un límite de intentos de código (15 fallos en 10 minutos bloquea los canjes un rato).
- **Hoy un Vista puede leer todo**, incluidos teléfonos y montos. Ocultar campos por rol llegará más adelante.
- Límites de Google: cuota diaria y ~6 minutos por ejecución. Sobra para un grupo; no para cientos de personas a la vez.
