# Guía de lanzamiento de HABLA

Checklist para publicar el proyecto y compartir el link de descarga. Pensada para
el repo canónico `habla-voz/habla` — si se usa otra cuenta/org, correr primero el
paso 0.

## 0 · (Solo si cambia el dueño) Reapuntar el repo

Los links al repo están centralizados en estos archivos; un solo reemplazo los cubre:

```bash
grep -rl "habla-voz/habla" src src-tauri docs README.md DEPLOY.md | \
  xargs sed -i 's|habla-voz/habla|TU-ORG/TU-REPO|g'
```

## 1 · Crear la org y el repo

1. Crear la organización **habla-voz** en GitHub (verificado libre al 2026-07-11).
2. Publicar:

```bash
gh repo create habla-voz/habla --public --description "No lo tipees. Dilo. Dictado por voz libre, gratis y 100% offline, hecho para Latinoamérica." --homepage "https://habla-voz.github.io/habla/"
git remote set-url origin https://github.com/habla-voz/habla.git
git push -u origin main
```

## 2 · Activar la landing (GitHub Pages)

La landing vive en `docs/`. En **Settings → Pages**: Source = *Deploy from a branch*,
Branch = `main`, carpeta `/docs`. En ~1 minuto queda viva en:

**https://habla-voz.github.io/habla/**

O por CLI:

```bash
gh api repos/habla-voz/habla/pages -X POST -f "source[branch]=main" -f "source[path]=/docs"
```

## 3 · Compilar los instaladores (release v1.0.0)

Los instaladores se compilan en GitHub Actions — no hace falta Rust local:

1. En el repo: **Actions → Release → Run workflow** (o `gh workflow run release.yml`).
2. El workflow compila Windows (x64/ARM), macOS (Intel/Apple Silicon) y Linux
   (deb/rpm/AppImage, x64/ARM) y crea un **draft release** `v1.0.0` con todos los assets.
3. Revisar el draft y publicarlo. El botón de la landing y el README ya apuntan a
   `releases/latest`.

Notas del estado actual (decisiones para poder lanzar hoy):

- **Binarios sin firma de código.** Windows/macOS van a mostrar la advertencia
  típica de app no firmada (normal en open source indie). Cuando haya certificados,
  restaurar `sign-binaries: true` en los workflows y el `signCommand` de Windows.
- **Auto-updates desactivadas** (`createUpdaterArtifacts: false`). El chequeo de
  versión nueva dirige a `releases/latest`. Para activar el updater completo:
  `bunx tauri signer generate`, poner la pubkey en `tauri.conf.json` (campo
  `plugins.updater.pubkey`, hoy tiene un placeholder), agregar los secretos
  `TAURI_SIGNING_PRIVATE_KEY` y `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, volver a
  `createUpdaterArtifacts: true` y generar `latest.json` en cada release.

## 4 · Anunciar

- Landing: https://habla-voz.github.io/habla/
- Descarga directa: https://github.com/habla-voz/habla/releases/latest
- Copy de lanzamiento listo en `marca/identidad-verbal.md` (sección "Ejemplos aplicados").

## Registro de decisiones

- Fork de [cjpais/handy](https://github.com/cjpais/handy) (MIT). Su licencia exige
  marca propia en forks: por eso HABLA tiene nombre, logo e íconos propios y el
  About de la app acredita al proyecto original.
- Los modelos se descargan de `blob.handy.computer` (CDN del proyecto original),
  igual que en upstream. Si algún día conviene, se pueden espejar en un bucket propio.
- Versión inicial: **1.0.0** (relanzamiento como producto; upstream iba por 0.9.1).
