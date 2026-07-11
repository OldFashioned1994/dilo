# HABLA — Identidad visual

## Concepto visual (4 palabras)

**Consigna impresa, calidez de terminal.**

La marca se ve como se oye: un grito corto y bien impreso (cartel de consigna,
tipografía negra y compacta) sobre la calidez de una terminal ámbar — los
monitores fósforo-ámbar de los 80, la estética nativa del que vive en la consola,
pero cálida como acá. Nada de gradientes violeta ni glassmorphism: tinta y fósforo.

## Isotipo: el «¡»

El signo de apertura de exclamación **solo existe en español**. Y dibujado con
la cápsula redonda arriba y el mango abajo, **es un micrófono**. Ese doble
sentido es la marca entera en un glifo: *un micrófono que solo nosotros tenemos*.

- Archivo: `marca/isotipo.svg` (mark) y `marca/logo.svg` (lockup con wordmark).
- Área de protección: media cápsula (½ del diámetro del punto) alrededor.
- Tamaño mínimo: 16 px de alto (favicon/tray). El mark funciona monocromo.

## Wordmark

**HABLA** compuesto en **Archivo Black**, mayúsculas, tracking apretado (-2%).
Junto al isotipo o solo. La «¡» puede reemplazar espacios en piezas gráficas:
`¡HABLA!` solo en contextos festivos, nunca en UI.

## Color

| Token | Hex | Rol |
|---|---|---|
| Carbón | `#171310` | Fondo oscuro / tinta sobre claro. Negro cálido, nunca #000. |
| Hueso | `#F4EDE3` | Fondo claro / texto sobre oscuro. Blanco cálido, nunca #FFF. |
| Ámbar | `#FFB300` | Acento sobre oscuro: el fósforo de la terminal. Solo decorativo sobre claro. |
| Ámbar tostado | `#8A5800` | Acento/links sobre fondo claro (AA: 5.2:1 sobre Hueso). |
| Rojo REC | `#E5482F` | Solo estado de grabación. Nunca decorativo. |
| Arena | `#6E6155` | Texto secundario sobre claro (AA: 5.2:1). |
| Arena claro | `#B9A88F` | Texto secundario sobre oscuro. |
| Superficies | `#FBF7F0` claro / `#201A15` oscuro | Cards, paneles. |
| Bordes | `#E5DACA` claro / `#2B241D` oscuro | Líneas, divisores. |

Contrastes verificados: Hueso/Carbón 15.9:1 · Ámbar/Carbón 10.3:1 ·
Ámbar tostado/Hueso 5.2:1 · Arena/Hueso 5.2:1. El ámbar puro **nunca** lleva
texto encima en modo claro.

## Tipografía

- **Display: Archivo Black** — grotesca negra de Omnibus-Type (**Buenos Aires**,
  SIL OFL). La marca se compone en tipografía latinoamericana libre: no es un
  detalle, es coherencia. Titulares en mayúsculas, tracking -1% a -2%.
- **Texto: Archivo** (regular/medium/semibold) — misma familia, misma fundición.
- **Código y atajos: JetBrains Mono** (OFL) con fallback `ui-monospace`.
- Escala modular 1.25 (mayor: 1.333 en hero de landing).

## Sistema gráfico

- **Signature:** el «¡»-micrófono. Toda la audacia va ahí; el resto, disciplinado.
- **Ondas:** grupos de 5 barras verticales redondeadas de alturas 40/70/100/55/30%
  — ecualizador de voz. Se usan como separador, bullet o estado "escuchando".
- **El prompt:** `>` inicial en titulares técnicos y snippets, siempre en ámbar.
- **Grilla:** 8 px; contenedores generosos, esquinas 12–16 px (la cápsula del
  «¡» marca el radio máximo).
- **Foto/ilustración:** nada de stock corporativo. Capturas reales de terminal
  y editor, tratadas sobre Carbón con acentos ámbar.

## Do / Don't

- ✅ Ámbar sobre Carbón; «¡» como bullet; capturas reales; humor seco en micro-copy.
- ❌ Gradiente violeta→celeste, blobs, glassmorphism, mock 3D.
- ❌ Rosa Handy (`#faa2ca`): esa marca no es nuestra y su licencia lo prohíbe.
- ❌ Texto ámbar sobre fondo claro; rojo REC fuera del estado de grabación.
- ❌ Banderitas de países: LatAm se dice con el idioma y el «¡», no con clip-arts.

## Rastreo a estrategia (test del hilo)

- «¡»-micrófono → *idioma propio + voz* (esencia: tu voz es tuya).
- Ámbar-terminal → *público dev que vive en la consola* + calidez Everyman.
- Archivo Black (Buenos Aires, libre) → *hecho en LatAm + software libre* (Forajido con causa).
