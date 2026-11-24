// ============================================================
//  Configuración del recorrido virtual.
//  Editá este archivo para personalizar el sitio sin tocar main.js
// ============================================================
export const CONFIG = {
  // Textos
  schoolName: 'Nuestra escuela',          // aparece arriba a la izquierda y en la pantalla de carga
  pageTitle: 'Recorrido virtual',          // título de la pestaña del navegador

  // Modelo (el archivo va en la carpeta /models).
  // Si algún día querés ofrecer dos versiones (por ejemplo una sin techo), agregá otra línea
  // y aparece un selector de versión automáticamente.
  models: [
    { id: 'escuela', label: 'Escuela', url: 'models/escuela.glb', roofed: true },
    // { id: 'abierta', label: 'Sin techo', url: 'models/escuela-sin-techo.glb', roofed: false },
  ],

  // Cómo arranca el sitio:
  //   'walk'  = directo en modo caminata (recomendado para el público)
  //   'orbit' = vista general desde afuera, y el visitante elige cuándo caminar
  startMode: 'walk',

  // true = el visitante puede salir a la vista general (botón "Vista general" y doble toque
  // para entrar en un lugar). false = solo caminata, interfaz más simple.
  // Aunque esté en false, agregando ?debug a la dirección se habilita igual para vos.
  allowOrbit: false,

  // Punto de inicio de la caminata (en metros, con el modelo ya centrado en 0,0 y el piso en y=0).
  //   x, z : posición en el plano
  //   y    : altura del piso en ese punto (podés omitirlo y se calcula solo)
  //   yaw  : hacia dónde mira al empezar, en grados (0 = hacia -Z; positivo = gira a la izquierda)
  // null = automático (cerca del centro del edificio, mirando hacia el centro).
  // Para encontrar los valores fácilmente: abrí el sitio con ?debug, caminá hasta el lugar
  // donde querés empezar, mirá hacia donde querés, tocá "Copiar spawn" y pegá acá la línea.
  // Ejemplo:  spawn: { x: 6.02, y: 0.20, z: 7.66, yaw: 135 },
  spawn: null,

  // Escala: 'auto' detecta si el modelo está en centímetros (lo habitual al exportar
  // de Sweet Home 3D) y lo pasa a metros. También podés poner un número fijo,
  // por ejemplo 0.01 (cm -> m) o 1 (ya está en metros).
  // También se puede probar sin editar nada agregando ?scale=0.01 a la dirección.
  unitScale: 1,

  // Modo caminata (medidas en metros, ya con el modelo escalado)
  eyeHeight: 1.65,       // altura de los ojos
  walkSpeed: 2.2,        // velocidad de caminata (m/s)
  runMultiplier: 2,      // multiplicador al correr
  playerRadius: 0.35,    // "grosor" de la persona para chocar con paredes
  stepHeight: 0.45,      // escalón máximo que se puede subir

  // Materiales: true evita paredes "invisibles" cuando faltan caras en el modelo
  doubleSided: true,
};
