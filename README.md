# Recorrido virtual de la escuela

Visor 3D para la web (three.js) que muestra tu escuela exportada de Sweet Home 3D como `.glb`.
Funciona en celular y en compu, y tiene:

- **Vista general:** girar, acercar y mover con los dedos o el mouse.
- **Modo caminata:** recorrer la escuela por dentro con joystick (celular) o WASD (compu), con colisiones contra paredes y seguimiento del piso (escalones y rampas).
- **Modo público:** arranca directo caminando, con el punto de inicio que elijas.
- **Opcional:** vista general desde afuera y una segunda versión del modelo (por ejemplo sin techo, para "espiar"; con doble toque sobre una sala entrás caminando ahí).

## Estructura

```
index.html
css/style.css
js/config.js     <- acá se cambian nombre, archivos, escala, velocidad, etc.
js/main.js       <- el visor
models/          <- acá van tus .glb
```

## Modo público y punto de inicio (spawn)

Por defecto el sitio está pensado para el público: **carga solo `escuela.glb` y arranca directo en modo caminata**, sin botón de vista general. Esto se controla en `js/config.js` con `startMode` y `allowOrbit`.

**Cómo elegir dónde empieza la gente:**

1. Abrí el sitio agregando `?debug` a la dirección (por ejemplo `http://localhost:8000/?debug` o `https://TU-USUARIO.github.io/REPO/?debug`).
2. Caminá hasta el lugar donde querés que empiece el recorrido y **mirá hacia donde querés que miren al entrar**. Abajo a la derecha ves tus coordenadas en vivo.
3. Tocá **"Copiar spawn"** (o apretá la tecla `P` en la compu). Se copia una línea como esta:
   ```js
   spawn: { x: 6.02, y: 0.20, z: 7.66, yaw: 135 },
   ```
4. Pegala en `js/config.js`, reemplazando `spawn: null,`, y subí el cambio a GitHub.

Con `?debug` también tenés disponible la vista general (para ubicarte) y, en ella, el doble toque para meterte directo en una sala. Los visitantes normales no ven nada de esto.

## 1. Poner tu modelo

Copiá tu archivo dentro de `models/` con este nombre (o cambialo en `js/config.js`):

- `models/escuela.glb`

Si más adelante querés ofrecer también una versión sin techo (u otra), copiala a `models/` y descomentá la segunda línea de `models` en `js/config.js`: aparece un selector de versión solo.

## 2. Hacer los modelos livianos (muy recomendado)

Un `.glb` de Sweet Home 3D suele ser pesado, y en un celular eso significa carga lenta o que se cierre el navegador. Lo ideal es que cada archivo quede por debajo de unos 30 a 50 MB (cuanto menos, mejor).

Necesitás [Node.js](https://nodejs.org). Después, en una terminal:

```bash
npm install -g @gltf-transform/cli

gltf-transform optimize escuela.glb models/escuela.glb \
  --compress meshopt --texture-compress webp --texture-size 2048

gltf-transform optimize escuela-sin-techo.glb models/escuela-sin-techo.glb \
  --compress meshopt --texture-compress webp --texture-size 2048
```

Consejos:

- Si el resultado se ve raro (detalles que desaparecen), agregá `--simplify false`.
- Si sigue pesando mucho, bajá las texturas con `--texture-size 1024`.
- Exportar desde Sweet Home 3D con menos texturas o sin objetos decorativos chicos también ayuda mucho.

## 3. Probarlo en tu compu

Abrir `index.html` con doble clic **no funciona** (el navegador bloquea la carga del modelo). Hay que verlo desde un servidor local. Desde la carpeta del proyecto:

```bash
python -m http.server 8000
```

y abrí <http://localhost:8000>. Para probarlo desde el celular, conectalo a la misma wifi y entrá a `http://IP-DE-TU-COMPU:8000`.

Si el modelo se ve gigante o minúsculo, probá agregando `?scale=0.01` (o `?scale=1`) a la dirección. Cuando encuentres el valor correcto, ponelo en `unitScale` dentro de `js/config.js`.

## 4. Publicarlo en GitHub Pages

1. Creá un repositorio en GitHub (público).
2. Subí **todo el contenido** de esta carpeta, incluida `models/` con los `.glb`.
   - La web de GitHub acepta archivos de hasta 25 MB. Si tus modelos pesan más, subilos con git desde la terminal o con GitHub Desktop (límite de 100 MB por archivo).
   - **No uses Git LFS**: GitHub Pages no sirve los archivos de LFS y el modelo no cargaría.
3. En el repositorio: **Settings → Pages → Build and deployment → Deploy from a branch**, elegí la rama `main` y la carpeta `/ (root)`, y guardá.
4. A los 1 o 2 minutos tu página queda en `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`.

Para la muestra escolar podés generar un código QR con esa dirección y pegarlo en un cartel.

## Detalles técnicos

- Las librerías (three.js y three-mesh-bvh) se cargan desde internet (CDN), así que el celular necesita conexión la primera vez.
- Si el sitio se ve con materiales muy oscuros o brillosos, el visor ya fuerza `metalness = 0` y materiales de doble cara; podés desactivar la doble cara con `doubleSided: false` en `js/config.js`.
- El modo caminata calcula colisiones la primera vez que se usa (unos segundos en modelos grandes).
