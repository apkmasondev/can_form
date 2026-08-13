# PREMIUM CAN — WebGL × MP4 × Scroll-Driven
## Bardzo dokładny plan implementacji dla agenta AI

> **Cel dokumentu:** zbudować piękną wizualnie, komercyjną, statyczną stronę produktową łączącą WebGL, teksturowalny model puszki, dwa filmy MP4 oraz scroll-driven storytelling. Priorytety w kolejności: **płynność → stabilność → jakość wizualna → wydajność → poprawność → łatwe wdrożenie na GitHub Pages**.
>
> Agent ma traktować ten dokument jako specyfikację wykonawczą, ale **nie może zakładać, że coś działa poprawnie tylko dlatego, że tak opisano**. Każdy istotny element trzeba uruchomić, zmierzyć i sprawdzić na desktopie oraz mobile. Jeżeli istniejący projekt/repozytorium ma inną, sensowną architekturę, agent najpierw robi audyt i dopiero potem proponuje zmianę.

---

# 0. Najważniejsza zasada projektu

To **nie ma być strona z filmem i kilkoma napisami**.

Głównym bohaterem ma być **realny, interaktywny produkt WebGL** — smukła puszka premium — na który można nakładać i płynnie przełączać tekstury/branding. MP4 służy wyłącznie do momentów, które wyglądają lepiej jako prerenderowany cinematic:

1. ekstremalne macro aluminium i kropli,
2. otwarcie zawleczki, para i detal wieczka.

Docelowa narracja:

```text
WEBGL HERO
→ WebGL camera push-in
→ MP4 #1: macro → pełna puszka
→ WebGL pełna puszka
→ konfigurator tekstur / 360°
→ WebGL przygotowanie kadru
→ MP4 #2: pełna puszka → góra → otwarcie
→ WebGL otwarta puszka / final hero
→ CTA
```

Przejścia mają być tak dopracowane, aby użytkownik możliwie długo **nie był pewien, czy ogląda model 3D, czy prerenderowany materiał**.

---

# 1. Materiały wejściowe

## Film 1

Plik źródłowy:

```text
Aluminum_can_product_video_202608131716.mp4
```

Zweryfikowane parametry źródła:

```text
czas:         ~10.005 s
rozdzielczość: 1280 × 720
fps:          24
video:        H.264
audio:        AAC, 48 kHz, stereo
bitrate video: ~1.73 Mb/s
rozmiar:      ~2.34 MB
```

Charakter materiału:

- początek: ekstremalne macro powierzchni puszki,
- aluminium + kondensacja,
- kamera płynnie się wycofuje,
- środkowa część pokazuje górę i front,
- koniec: pełny centralny hero shot puszki,
- czarny / bardzo ciemny prostokątny obszar brandingu,
- ciemne studyjne tło,
- brak agresywnych cięć.

Film #1 jest materiałem **zaakceptowanym**. Nie regenerować go bez wyraźnej przyczyny.

---

## Film 2

Plik źródłowy:

```text
Camera_pushing_toward_opening_can_202608131722.mp4
```

Zweryfikowane parametry źródła:

```text
czas:         ~10.005 s
rozdzielczość: 1280 × 720
fps:          24
video:        H.264
audio:        AAC, 48 kHz, stereo
bitrate video: ~2.10 Mb/s
rozmiar:      ~2.80 MB
```

Charakter materiału:

- start: pełna puszka w podobnym ciemnym studio,
- kamera płynnie jedzie w kierunku górnej części,
- zbliżenie na wieczko i ring pull,
- końcówka: zawleczka otwarta,
- widoczna para / chłodna mgła,
- mocny macro detail,
- ciemne studyjne tło.

Film #2 jest materiałem **zaakceptowanym**. Nie regenerować go bez wyraźnej przyczyny.

---

# 2. Nienaruszalne zasady przetwarzania filmów

## 2.1. Oryginałów nie modyfikować

Pliki źródłowe należy zachować w stanie nietkniętym.

Nie nadpisywać ich.

Sugerowana struktura:

```text
/assets-source/video/
  Aluminum_can_product_video_202608131716.mp4
  Camera_pushing_toward_opening_can_202608131722.mp4
```

Pliki produkcyjne mają trafić osobno.

---

## 2.2. Nie skalować do 1080p

Materiały są natywne 1280×720.

**Zakaz sztucznego upscale do 1920×1080.**

Nie daje to nowych detali, zwiększa transfer i koszt dekodowania.

Wersja desktop ma zachować:

```text
1280 × 720 / 24 fps
```

Wersja mobile ma bazowo używać:

```text
960 × 540 / 24 fps
```

Jeżeli profilowanie na słabszych urządzeniach pokaże problem, dopiero wtedy można dodać opcjonalny wariant:

```text
854 × 480 / 24 fps
```

Nie tworzyć go jako domyślnego bez potrzeby.

---

## 2.3. Audio usunąć fizycznie

Nie wystarczy `muted`.

Audio ma zostać **całkowicie usunięte ze strumienia pliku**.

Cel:

- mniej danych,
- mniej dekodowania,
- brak przypadkowego dźwięku,
- prostszy scrub,
- brak polityk autoplay związanych z audio.

Element `<video>` nadal ma mieć `muted` defensywnie.

---

# 3. Pipeline wideo — wersje produkcyjne

Ponieważ wideo ma być **scrubowane scrollem**, priorytetem jest szybkie i precyzyjne seekowanie.

Bazowy wariant: H.264, wszystkie klatki kluczowe / GOP=1.

## 3.1. Desktop — 1280×720

Dla filmu #1:

```bash
ffmpeg -y \
  -i "Aluminum_can_product_video_202608131716.mp4" \
  -an \
  -c:v libx264 \
  -preset slow \
  -crf 21 \
  -pix_fmt yuv420p \
  -r 24 \
  -g 1 \
  -keyint_min 1 \
  -sc_threshold 0 \
  -movflags +faststart \
  "can-film-01-desktop.mp4"
```

Dla filmu #2:

```bash
ffmpeg -y \
  -i "Camera_pushing_toward_opening_can_202608131722.mp4" \
  -an \
  -c:v libx264 \
  -preset slow \
  -crf 21 \
  -pix_fmt yuv420p \
  -r 24 \
  -g 1 \
  -keyint_min 1 \
  -sc_threshold 0 \
  -movflags +faststart \
  "can-film-02-desktop.mp4"
```

W wykonanym teście referencyjnym takie ustawienia dały około:

```text
Film 1 desktop: ~5.0 MB
Film 2 desktop: ~5.4 MB
Razem:          ~10.4 MB
```

Traktować jako punkt odniesienia, nie gwarantowaną wartość byte-for-byte.

---

## 3.2. Mobile — 960×540

Film #1:

```bash
ffmpeg -y \
  -i "Aluminum_can_product_video_202608131716.mp4" \
  -an \
  -vf "scale=960:-2:flags=lanczos" \
  -c:v libx264 \
  -preset slow \
  -crf 22 \
  -pix_fmt yuv420p \
  -r 24 \
  -g 1 \
  -keyint_min 1 \
  -sc_threshold 0 \
  -movflags +faststart \
  "can-film-01-mobile.mp4"
```

Film #2:

```bash
ffmpeg -y \
  -i "Camera_pushing_toward_opening_can_202608131722.mp4" \
  -an \
  -vf "scale=960:-2:flags=lanczos" \
  -c:v libx264 \
  -preset slow \
  -crf 22 \
  -pix_fmt yuv420p \
  -r 24 \
  -g 1 \
  -keyint_min 1 \
  -sc_threshold 0 \
  -movflags +faststart \
  "can-film-02-mobile.mp4"
```

Test referencyjny:

```text
Film 1 mobile 540p: ~3.0 MB
Film 2 mobile 540p: ~3.3 MB
Razem:               ~6.3 MB
```

---

## 3.3. Wariant awaryjny 480p

Tylko jeśli realne testy na słabszym Androidzie pokażą, że 540p GOP=1 jest za ciężkie.

Przykład:

```bash
-vf "scale=854:-2:flags=lanczos"
-crf 22
```

Test referencyjny dla 854×480:

```text
Film 1: ~2.6 MB
Film 2: ~2.8 MB
```

---

# 4. Automatyzacja pipeline wideo

Agent nie powinien robić konwersji ręcznie i jednorazowo.

Utworzyć skrypt, np.:

```text
scripts/process-videos.sh
```

Skrypt ma:

1. sprawdzić obecność `ffmpeg`,
2. sprawdzić obecność obu inputów,
3. utworzyć katalog output,
4. usunąć audio,
5. wygenerować desktop 720p,
6. wygenerować mobile 540p,
7. dodać `faststart`,
8. zachować 24 fps,
9. wymusić GOP=1,
10. po renderze automatycznie wykonać `ffprobe`,
11. przerwać proces z błędem, jeśli:
   - plik zawiera ścieżkę audio,
   - fps ≠ 24,
   - rozdzielczość jest błędna,
   - duration mocno odbiega od źródła,
   - output ma 0 bajtów.

Przykładowa struktura końcowa:

```text
src/assets/media/
  can-film-01-desktop.mp4
  can-film-01-mobile.mp4
  can-film-02-desktop.mp4
  can-film-02-mobile.mp4

  can-film-01-start.webp
  can-film-01-end.webp
  can-film-02-start.webp
  can-film-02-end.webp
```

---

# 5. Poster frames / klatki referencyjne

Wygenerować osobne WebP:

```text
can-film-01-start.webp
can-film-01-end.webp
can-film-02-start.webp
can-film-02-end.webp
```

Nie wybierać dosłownie pierwszej/ostatniej zakodowanej klatki bez sprawdzenia.

Bazowe punkty:

```text
Film 1 start: ~0.10 s
Film 1 end:   ~9.70 s
Film 2 start: ~0.10 s
Film 2 end:   ~9.70 s
```

Przykład:

```bash
ffmpeg -ss 9.70 \
  -i can-film-01-desktop.mp4 \
  -frames:v 1 \
  -c:v libwebp \
  -quality 82 \
  can-film-01-end.webp
```

Klatki mają służyć do:

- posterów,
- fallbacków,
- kalibracji WebGL ↔ MP4,
- debugowania crossfade,
- trybu `prefers-reduced-motion`,
- błędu WebGL / context lost.

---

# 6. Model 3D puszki — wymagania

## 6.1. Format

Preferowany:

```text
GLB / glTF
```

Finalny model nie może być tylko prymitywem `CylinderGeometry`, jeżeli ma pełnić funkcję portfolio/commercial demo.

Cylinder może być użyty wyłącznie do prototypu.

---

## 6.2. Model powinien posiadać

Osobne logiczne części / meshe:

```text
Body
Top
Tab
Bottom
```

Opcjonalnie:

```text
InnerOpening
Rim
```

Najważniejsze:

- poprawne normals,
- brak odwróconych face,
- brak zbędnej geometrii niewidocznej,
- spójna skala,
- origin ustawiony sensownie,
- ring pull jako osobny mesh,
- pivot taba umożliwiający animację otwarcia,
- top geometry umożliwiająca wizualne dopasowanie do końca Filmu 2.

---

## 6.3. UV

To jest **krytyczny element całego projektu**.

Body puszki musi mieć przewidywalny UV unwrap:

```text
U: pełen obwód puszki 0 → 1
V: wysokość powierzchni nadruku 0 → 1
```

Seam najlepiej umieścić z tyłu produktu.

Top / bottom nie mogą wykorzystywać tego samego obszaru UV co body, jeżeli ma to komplikować teksturowanie.

Agent ma przygotować i zachować:

```text
can-uv-template.png
```

lub SVG, z czytelną granicą obszaru nadruku.

Dzięki temu późniejsze warianty labeli mogą powstawać bez zmiany modelu.

---

## 6.4. Budżet geometrii

Produkt jest prosty.

Cel:

```text
idealnie: 20k–40k tris
maksymalnie bez uzasadnienia: ~60k tris
```

Nie używać setek tysięcy polygonów dla puszki.

Detal ma pochodzić głównie z:

- normal map,
- roughness,
- światła,
- environment,
- dobrego beveling,
- właściwej geometrii top/tab.

---

# 7. Materiały WebGL

## Body

Preferować `MeshPhysicalMaterial` lub dopracowany `MeshStandardMaterial`.

Punkt startowy — nie kopiować bez testów:

```text
metalness:  0.55–0.75
roughness:  0.25–0.40
clearcoat:  bardzo subtelny, jeżeli pasuje do nadruku
```

Nie robić puszki jak lustra.

---

## Top / Tab / Bottom

Bardziej surowe aluminium:

```text
metalness:  ~0.85–1.0
roughness:  ~0.22–0.38
```

Parametry dobrać wizualnie do MP4.

Najważniejsze jest **dopasowanie charakteru odbić do filmów**, nie teoretyczne PBR.

---

# 8. System tekstur / wariantów

Strona ma demonstrować klientowi realną funkcję biznesową.

Minimum cztery presety:

```text
NOIR
LIME
CHERRY
ZERO
```

Nazwy są robocze. Agent może użyć neutralnego fictional brandingu, ale nie kopiować realnej marki.

Każdy preset:

```text
id
name
albedo/map
roughnessMultiplier
metalnessMultiplier
optional accentColor
```

Przykładowa konfiguracja:

```ts
type CanVariant = {
  id: string
  name: string
  textureUrl: string
  roughness: number
  metalness: number
}
```

---

# 9. Rozdzielczość tekstur

## Desktop

Bazowo:

```text
2048 px w dłuższym wymiarze
```

## Mobile

Bazowo:

```text
1024 px
```

Nie ładować wszystkich 2K wariantów na starcie.

Pierwszy wariant:

```text
preload
```

Pozostałe:

```text
lazy / po wejściu do sekcji konfiguratora
```

---

# 10. Format tekstur

Preferencja:

1. KTX2/Basis — jeżeli agent ma sprawdzony pipeline i poprawnie skonfiguruje transcoder.
2. WebP — prosty i bezpieczny fallback.
3. PNG tylko wtedy, gdy realnie wymagana jest alfa / jakość bezstratna.

Nie używać dużych JPEG/PNG bez pomiaru.

Jeżeli KTX2 zwiększa złożoność lub generuje problemy na Safari — **wybrać poprawne WebP zamiast wdrażać kompresję na siłę**.

---

# 11. Zmiana tekstury — ma być płynna

Nie robić:

```text
klik → natychmiastowy skok mapy
```

Preferowane:

```text
250–450 ms crossfade
```

Najlepiej:

```glsl
mix(textureA, textureB, uMix)
```

lub równoważne lekkie rozwiązanie.

Nie dublować ciężkich meshów tylko po to, by uzyskać crossfade, jeśli powoduje to z-fighting / overdraw.

Zmiana finish:

```text
Matte
Gloss
Metallic
```

może animować:

```text
roughness
metalness
clearcoat
```

---

# 12. Funkcja „Try your label” — rekomendowana

To może być najmocniejszy element portfolio.

Użytkownik może wczytać lokalnie własny:

```text
PNG
JPG
WebP
```

i natychmiast zobaczyć go na puszce.

## Wymagania

- brak backendu,
- plik nie opuszcza urządzenia,
- użyć `URL.createObjectURL()` lub lokalnego odczytu,
- zwolnić poprzedni object URL przez `URL.revokeObjectURL()`,
- limit np. 10 MB,
- walidacja MIME,
- informacja o wymaganym UV/template,
- przycisk `Reset`,
- po zmianie pliku texture musi poprawnie dispose'ować poprzedni GPU resource.

Copy może brzmieć np.:

```text
Try your label
Preview your artwork directly on the can.
Processed locally in your browser.
```

To jest feature w pełni możliwy na statycznym GitHub Pages.

Jeżeli feature powoduje regresję stabilności — oznaczyć jako Phase 2, ale architektura tekstur ma go umożliwiać.

---

# 13. Stack aplikacji

Jeżeli repo jest puste:

```text
React
TypeScript
Vite
Three.js
React Three Fiber
```

Można użyć `@react-three/drei` tylko dla elementów, które realnie upraszczają kod.

Nie instalować dużej biblioteki wyłącznie dla jednej małej funkcji.

Nie wymagać:

- Next.js,
- SSR,
- backendu,
- React Router,
- bazy danych.

To ma być **statyczny projekt kompatybilny z GitHub Pages**.

Jeżeli repo już istnieje — najpierw audyt, potem decyzja.

---

# 14. Proponowana struktura projektu

```text
/
├─ .github/
│  └─ workflows/
│     └─ deploy-pages.yml
│
├─ scripts/
│  └─ process-videos.sh
│
├─ src/
│  ├─ app/
│  │  └─ App.tsx
│  │
│  ├─ assets/
│  │  ├─ media/
│  │  ├─ models/
│  │  ├─ textures/
│  │  └─ images/
│  │
│  ├─ components/
│  │  ├─ ExperienceStage.tsx
│  │  ├─ VideoLayer.tsx
│  │  ├─ ProductCopy.tsx
│  │  ├─ TextureSwitcher.tsx
│  │  ├─ FinishSwitcher.tsx
│  │  ├─ LabelUploader.tsx
│  │  ├─ LoadingScreen.tsx
│  │  └─ FallbackExperience.tsx
│  │
│  ├─ webgl/
│  │  ├─ CanScene.tsx
│  │  ├─ CanModel.tsx
│  │  ├─ StudioLighting.tsx
│  │  ├─ CanMaterial.ts
│  │  └─ cameraStates.ts
│  │
│  ├─ hooks/
│  │  ├─ useScrollProgress.ts
│  │  ├─ useVideoScrub.ts
│  │  ├─ useQualityTier.ts
│  │  ├─ useReducedMotion.ts
│  │  └─ usePageVisibility.ts
│  │
│  ├─ config/
│  │  ├─ timeline.ts
│  │  └─ variants.ts
│  │
│  ├─ styles/
│  │  ├─ global.css
│  │  └─ experience.css
│  │
│  └─ main.tsx
│
├─ index.html
├─ vite.config.ts
├─ package.json
├─ tsconfig.json
└─ README.md
```

---

# 15. Architektura layoutu

Nie budować siedmiu ciężkich ekranów DOM.

Preferowany model:

```text
<body>
  bardzo wysoki scroll-container
  └─ sticky stage 100svh
      ├─ WebGL canvas
      ├─ Video 1 layer
      ├─ Video 2 layer
      ├─ copy/UI layer
      └─ navigation / progress
```

Centralny stage:

```css
position: sticky;
top: 0;
height: 100svh;
overflow: clip;
```

Fallback:

```css
height: 100vh;
```

Mobile:

- uwzględnić `safe-area-inset-*`,
- nie opierać krytycznych wymiarów wyłącznie na `100vh`,
- przetestować dynamiczne paski Safari/Chrome.

---

# 16. Scroll — klucz do płynności

## Zakaz

Nie robić:

```js
window.addEventListener('scroll', () => {
  video.currentTime = ...
  setState(...)
  ...
})
```

w naiwny sposób.

Nie wykonywać ciężkich React renderów na każdy event scroll.

---

## Model działania

1. scroll aktualizuje tylko lekki `targetProgress`,
2. render loop `requestAnimationFrame` czyta target,
3. `easedProgress` zbliża się do targetu,
4. wszystkie warstwy korzystają z **jednego źródła prawdy**,
5. WebGL, tekst i video dostają tę samą eased timeline.

Pseudo:

```ts
target = normalizedDocumentScroll
eased += (target - eased) * factor
```

Lerp ma być zależny od delta-time, a nie sztywno od FPS.

Cel:

- desktop: szybkie, lekko filmowe doganianie,
- mobile: mniej bezwładności niż desktop,
- brak feelingu „strona walczy z palcem”.

---

# 17. Nie używać scroll hijackingu

Nie zastępować natywnego scrollowania własnym systemem.

Nie blokować:

```text
wheel
touchmove
```

Nie wymuszać snapów na całej stronie.

Nie używać ciężkiego smooth-scroll tylko dla samego efektu.

Natywny scroll + eased progress daje lepszą odporność na mobile.

---

# 18. Wstępna timeline

To punkt startowy. Agent ma dostroić po realnym uruchomieniu.

## Desktop

Przykład:

```text
0.00–0.10  WebGL hero
0.10–0.20  WebGL camera → macro / przygotowanie Film 1
0.20–0.40  MP4 Film 1 scrub
0.40–0.46  MP4 #1 → WebGL full can
0.46–0.64  configurator / 360 / textures
0.64–0.70  WebGL ustawienie do Film 2
0.70–0.90  MP4 Film 2 scrub
0.90–0.95  Film 2 → WebGL open top
0.95–1.00  final hero / CTA
```

Całkowita wysokość startowa:

```text
~850–950vh
```

Przetestować.

---

## Mobile

Timeline logicznie ta sama, ale:

- krótsza całkowita droga,
- mniejsza bezwładność,
- konfigurator dłuższy w sensie czasu ekranowego,
- użytkownik nie może wykonać 10 długich swipe'ów tylko po to, by zobaczyć produkt.

Startowo:

```text
~700–820vh
```

Nie traktować wartości jako dogmatu.

---

# 19. Scrubbing MP4

Film ma 24 fps.

Nie ma sensu wymuszać setek seeków na sekundę.

Logika:

```text
desiredTime = localVideoProgress * duration
desiredFrame = round(desiredTime * 24)
```

Aktualizować `currentTime`, gdy zmieni się docelowa klatka lub gdy różnica od desiredTime jest wystarczająca.

Nie wykonywać ciągłych zbędnych seeków, gdy scroll stoi.

Użyć `requestVideoFrameCallback`, jeżeli dostępne, do synchronizacji finalnego frame display / overlay.

Zaimplementować fallback bez tej funkcji.

---

# 20. Video element — wymagane atrybuty

```html
<video
  muted
  playsinline
  preload="metadata"
  disablepictureinpicture
></video>
```

Po przypisaniu aktywnego źródła i zbliżeniu się do sekcji:

```text
preload → auto
video.load()
```

Nie używać standardowego autoplay timeline.

Wideo pozostaje `paused`; czas kontroluje scroll.

---

# 21. Strategia ładowania video

## Na first paint

Nie ładować obu pełnych filmów.

First screen powinien dostać przede wszystkim:

- HTML/CSS,
- podstawowy JS,
- model,
- pierwszą teksturę,
- poster/reference image.

---

## Film #1

Po:

```text
first render
+
idle / krótki delay
```

lub gdy użytkownik zbliża się do segmentu Film 1.

Film ma zostać wystarczająco wcześnie pobrany, aby wejście w scrub nie czekało na sieć.

---

## Film #2

Nie pobierać na starcie.

Prefetch/load:

```text
gdy scroll zbliża się do konfiguratora
lub
gdy Film 1 jest już gotowy i przeglądarka ma zasoby
```

---

# 22. Wybór desktop/mobile video

Nie pobierać jednocześnie wersji 720p i 540p.

Na starcie wybrać jeden URL.

Przykład logiczny:

```text
desktop / duży viewport / sensowny device tier → 720p
mobile / mały viewport → 540p
save-data / bardzo słaby tier → opcjonalnie 480p lub poster fallback
```

Po załadowaniu źródła nie zmieniać go agresywnie przy każdym resize.

Zmiana orientacji telefonu nie może powodować kilkukrotnego pobierania mediów.

---

# 23. Mobile video crop

Nie przygotowywać na siłę pionowych renderów, dopóki nie ma realnej potrzeby.

Źródła są centralnie kadrowane.

Na mobile:

```css
width: 100%;
height: 100%;
object-fit: cover;
object-position: 50% 50%;
```

Dla Film 2 można dostroić `object-position` po testach.

Nie rozciągać video.

---

# 24. WebGL ↔ MP4 — kalibracja

To jeden z najważniejszych etapów QA.

Agent ma przygotować **debug calibration mode**, np.:

```text
?debug=1
```

W debug mode:

- można wyświetlić `can-film-01-start.webp`,
- można ustawić opacity referencji,
- WebGL pozostaje pod spodem,
- można zmieniać:
  - camera position,
  - target,
  - FOV,
  - can position,
  - can scale,
  - can rotation,
- wartości mają być łatwe do skopiowania do `cameraStates.ts`.

Potrzebne stany:

```text
hero
film1Start
film1End
configurator
film2Start
film2End
final
```

---

# 25. Film 1 — dopasowanie

## Przed wejściem do Film 1

WebGL:

- puszka centralnie,
- kamera wykonuje push-in,
- kieruje użytkownika w stronę metalowej powierzchni,
- finalna pozycja możliwie pasuje do pierwszego macro frame Film 1.

Crossfade:

```text
WebGL opacity ↓
Film 1 opacity ↑
```

Nie robić crossfade przez 2 sekundy.

Ma być krótki, elegancki i praktycznie niewidoczny.

---

## Wyjście z Film 1

Ostatni frame Film 1 to pełna puszka.

WebGL ma być przygotowany w bardzo podobnym:

- rozmiarze,
- pitch/yaw,
- FOV,
- ekspozycji,
- pozycji.

Pod video już czeka WebGL.

Na końcu:

```text
Film1 opacity 1 → 0
WebGL 0 → 1
```

Silhouette nie może „podskoczyć”.

---

# 26. Film 2 — dopasowanie

## Wejście

Film #2 zaczyna się pełną puszką.

Przed crossfade WebGL wraca do podobnego hero framing.

Następnie video przejmuje kadr.

---

## Wyjście

Film #2 kończy się:

- widokiem z góry / macro,
- otwartą puszką,
- otwartą zawleczką,
- parą.

Idealny final WebGL powinien umieć odwzorować:

- top camera,
- otwarty tab,
- otwór w puszce,
- bardzo podobny framing.

Jeżeli dokładne odwzorowanie pary w WebGL byłoby ciężkie — nie implementować ciężkiej volumetryki.

Można:

1. wygasić parę jeszcze w MP4,
2. zrobić krótki CSS/WebGL soft haze,
3. przejść do czystego WebGL top shot.

---

# 27. Crossfade — zasady

Nie korzystać z ciężkich filtrów blur na pełnym viewport.

Preferować:

```text
opacity
subtelny exposure match
ew. bardzo lekki transform
```

GPU-friendly.

Warstwy:

```text
canvas:      z-index 1
video1:      z-index 2
video2:      z-index 3
ui/copy:     z-index 5
```

Poza aktywnym segmentem video ma mieć:

```css
opacity: 0;
visibility: hidden;
pointer-events: none;
```

Nie usuwać elementu z DOM, jeśli ponowne mountowanie powoduje utratę bufferu.

---

# 28. WebGL renderer — desktop

Punkt startowy:

```text
WebGL2
powerPreference: high-performance
alpha: true/false zależnie od kompozycji
dpr clamp: 1.0–1.5
```

Nie renderować automatycznie DPR 2.0+ na Retina.

To niepotrzebnie podwaja / zwielokrotnia koszt fragment shaderów.

---

# 29. WebGL renderer — mobile

Start:

```text
DPR: 1.0–1.25
```

Na mocnych telefonach można dynamicznie podnieść do ~1.4–1.5, jeśli realny profiler to uzasadnia.

Priorytet:

```text
stabilny frame pacing > laboratoryjna ostrość
```

---

# 30. Dynamic quality tier

Utworzyć prostą warstwę:

```text
HIGH
MEDIUM
LOW
```

Nie opierać się wyłącznie na user-agent.

Brać pod uwagę:

- viewport,
- DPR,
- `hardwareConcurrency` jeśli dostępne,
- `deviceMemory` jeśli dostępne,
- save-data jeśli dostępne,
- realny FPS w pierwszych sekundach.

Jeżeli przez kilka sekund średni frame time jest słaby:

```text
obniż DPR
wyłącz postprocessing
obniż jakość environment
```

Nie robić gwałtownych zmian w środku cinematic transition.

---

# 31. Frame budget

Target:

```text
desktop: stabilne ~60 fps w WebGL
mobile high/mid: 50–60 fps, bez widocznego szarpania
```

Jeżeli 60 nie jest możliwe:

- stabilne 45–50 jest lepsze niż oscylowanie 60 → 25 → 60,
- redukować koszt w pierwszej kolejności, nie dodawać „sztuczne smooth”.

---

# 32. Render loop

Zakaz:

- `setState()` 60 razy na sekundę,
- rerender całego React tree na scroll,
- obliczanie layoutu w każdej klatce.

Preferować:

- refs,
- lightweight store / mutable timeline state,
- R3F `useFrame`,
- style updates tylko dla potrzebnych elementów.

Jeżeli scena jest całkowicie statyczna przez dłuższą chwilę, rozważyć ograniczenie render loop / invalidation.

---

# 33. Lighting — klucz do premium wyglądu

Nie budować efektu przez ogromny Bloom.

Puszka ma wyglądać premium głównie dzięki:

1. geometrii,
2. metalowi,
3. miękkim studyjnym refleksom,
4. dobrze ustawionemu environment,
5. kontrolowanemu tone mapping.

Setup może używać:

```text
1 key
1 rim
1 soft fill
environment map / studio reflection
```

Ważniejsze są długie, eleganckie highlighty na aluminium niż mnogość lamp.

---

# 34. Environment

Nie ładować 8K HDRI.

Start:

```text
256–512 px lub odpowiednio skompresowane studio environment
```

Jeżeli 1K daje zauważalnie lepsze refleksy i nadal mieści się w budżecie — można użyć desktop.

Mobile powinien dostać lżejszy wariant.

---

# 35. Postprocessing

Desktop:

- bardzo subtelny vignette,
- minimalny bloom tylko jeśli realnie pomaga,
- ewentualnie delikatny grain na warstwie 2D.

Mobile:

- domyślnie bez ciężkiego postprocessing,
- żadnego SSAO bez bardzo dobrego powodu,
- żadnego DoF liczonego stale na cały ekran.

Puszka jest prosta — nie potrzebuje technologicznego „festiwalu efektów”.

---

# 36. Kolorystyka

Kierunek:

```text
near-black background
silver/aluminum highlights
off-white typography
subtle gray secondary copy
texture colors tylko na produkcie
```

Strona ma być elegancka, a nie neonowa.

Kolor jest bohaterem wtedy, gdy użytkownik zmienia label.

---

# 37. Typografia

Nowoczesna, czysta, editorial/product.

Nie przesadzać z ilością fontów.

Preferowane:

```text
1 rodzina fontu
2–3 wagi
```

Jeżeli font zewnętrzny:

- self-host WOFF2, jeśli licencja pozwala,
- preload tylko krytycznego fontu,
- `font-display: swap`.

Jeśli nie ma dobrego assetu — użyć jakościowego system stack zamiast blokować render.

---

# 38. Copy — minimum

To ma być visual-first.

Przykładowa hierarchia:

## Hero

```text
YOUR LABEL.
IN MOTION.

Interactive product visualization for modern brands.
```

CTA:

```text
Explore
```

## Configurator

```text
MAKE IT YOURS

Choose a finish.
Change the label.
Rotate the product.
```

## Upload

```text
TRY YOUR LABEL

Preview your artwork directly on the can.
Processed locally in your browser.
```

## Final

```text
PRODUCT,
MADE INTERACTIVE.
```

CTA:

```text
Start a project
```

Tekst jest propozycją. Agent ma zachować minimalizm.

---

# 39. UI — zasady

Przepiękne nie oznacza „dużo elementów”.

UI:

- dużo oddechu,
- cienkie linie,
- minimalistyczne chipy,
- wyraźny focus state,
- duże, eleganckie headline,
- małe technical labels,
- brak generycznych gradient cards,
- brak glassmorphism wszędzie,
- brak ciężkich box-shadow.

---

# 40. Texture switcher

Desktop:

```text
dolny / prawy panel
4 warianty
duże aktywne state
```

Mobile:

```text
dolny horizontal rail
thumb-friendly
min. ~44 px touch target
```

Nie zasłaniać puszki.

---

# 41. 360° interaction

Po wejściu do konfiguratora użytkownik może delikatnie obracać puszkę.

Nie używać agresywnego OrbitControls, które blokuje scroll.

Preferować:

```css
touch-action: pan-y;
```

Horizontal drag:

```text
deltaX → rotationY
```

Vertical gesture nadal powinien przewijać stronę.

Dodać delikatną inercję rotation.

Po puszczeniu:

- puszka może powoli wrócić do preferred hero angle,
- albo zachować pozycję, jeśli UX wygląda lepiej.

---

# 42. Interaction vs scroll

W konfiguratorze:

- click/tap w wariant nie może przesuwać timeline,
- vertical scroll nadal działa,
- horizontal drag obraca,
- pointer capture tylko gdy realnie potrzebne,
- Escape / keyboard focus działa poprawnie na desktop.

---

# 43. Reduced Motion

Dla:

```css
@media (prefers-reduced-motion: reduce)
```

Nie zmuszać użytkownika do scrubbingu cinematic.

Tryb:

- statyczny hero,
- proste fade między posterami,
- normalny konfigurator tekstur,
- brak długich camera moves,
- bez automatycznej inercji.

Strona ma nadal wyglądać dobrze.

---

# 44. Save Data / bardzo słabe urządzenie

Jeżeli `saveData === true`:

- nie prefetchować obu GOP1 MP4,
- użyć posterów,
- WebGL quality LOW,
- ograniczyć tekstury,
- umożliwić ręczne „Load cinematic” opcjonalnie.

Nie pokazywać białej pustki.

---

# 45. WebGL fallback

Jeżeli:

- WebGL nie działa,
- context zostanie utracony,
- model nie załaduje się,

strona nadal ma pokazać elegancki produkt.

Fallback:

- poster/full can,
- tekst,
- warianty jako statyczne mockupy jeśli istnieją,
- CTA.

Obsłużyć:

```text
webglcontextlost
webglcontextrestored
```

Nie zostawiać czarnego ekranu.

---

# 46. Page Visibility

Gdy:

```text
document.hidden === true
```

zatrzymać:

- aktywne animacje,
- zbędny RAF,
- manualne seekowanie.

Po powrocie zsynchronizować timeline ze scroll position.

---

# 47. Performance budgets

## Initial critical path

Cel:

```text
HTML + CSS + initial JS + hero/model critical assets
bez pełnego ładowania obu MP4
```

JS nie powinien być niepotrzebnie rozdmuchany.

Punkt kontrolny:

```text
initial JS gzip: najlepiej < ~450 KB
```

Jeżeli wyżej:

- sprawdzić bundle analyzer,
- usunąć zbędne biblioteki,
- lazy-load noncritical UI.

---

## GLB

Cel:

```text
< ~700 KB
```

jeżeli jakość na to pozwala.

Użyć:

```text
Meshopt / Draco
```

tylko jeśli realnie poprawia wynik i loader jest poprawnie obsłużony.

---

## Textures

Initial hero:

```text
~0.5–1.2 MB maks. jako sensowny punkt startowy
```

Nie ładować 4 wariantów 2K upfront.

---

## Video

Desktop GOP1:

```text
~10.4 MB oba
```

ale **nigdy oba na initial critical path**.

Mobile 540p:

```text
~6.3 MB oba
```

również lazy.

---

# 48. Core UX performance goals

Po produkcyjnym buildzie:

```text
CLS: praktycznie 0
brak zauważalnych long tasks podczas scroll
brak czerwonych serii frame drops
brak gwałtownego memory growth
brak rebuffer przy wejściu w aktywny film na typowym 4G/Wi‑Fi
```

Agent ma raportować realne wyniki, nie pisać „optimized”.

---

# 49. Canvas sizing

Canvas zawsze dopasowany do viewport.

Nie przebudowywać renderer size kilkadziesiąt razy podczas mobile address bar animation.

Resize handler:

- debounce/throttle,
- reaguje na realne zmiany rozmiaru,
- nie powoduje migotania.

---

# 50. CSS performance

Unikać:

- pełnoekranowego `backdrop-filter`,
- wielu dużych blurów,
- animowania layout properties,
- `filter: blur()` na całym 4K video,
- ogromnych shadows.

Animować głównie:

```text
transform
opacity
```

`will-change` tylko tymczasowo i tylko tam, gdzie potrzebne.

---

# 51. Loading screen

Nie robić 10-sekundowego sztucznego intro.

Loader ma pojawić się tylko, jeśli krytyczne assety faktycznie jeszcze nie są gotowe.

Minimalny:

```text
small wordmark
thin progress line
0–100
```

Po gotowości hero:

```text
fade 250–400 ms
```

---

# 52. Preload modelu

Model i pierwsza textura są ważniejsze niż MP4 #2.

Priorytet:

```text
1 HTML/CSS
2 app shell
3 can model
4 first can texture
5 Film 1
6 secondary textures
7 Film 2
8 optional effects
```

---

# 53. Accessibility

Mimo visual-first:

- semantic buttons,
- aria-label dla swatchy,
- widoczny keyboard focus,
- nie polegać tylko na kolorze,
- tekst ma mieć odpowiedni kontrast,
- `Try your label` dostępne klawiaturą,
- odpowiednie `alt` dla fallback images,
- brak audio,
- reduced motion.

---

# 54. SEO / metadata

Jedna statyczna strona.

Dodać:

- poprawny `<title>`,
- meta description,
- canonical zgodnie z finalnym URL,
- Open Graph,
- Twitter card,
- `theme-color`,
- favicon SVG,
- favicon PNG fallback,
- Apple touch icon,
- `robots.txt`,
- prosty `sitemap.xml` jeśli finalny URL jest znany.

Nie indeksować debug mode.

---

# 55. Favicon

Przygotować dopracowany:

```text
/favicon.svg
```

Prosty, czytelny w 16×16.

Nie skalować pełnego skomplikowanego logo do favicon.

---

# 56. GitHub Pages — architektura deploy

Projekt ma być statyczny.

Budowanie:

```bash
npm ci
npm run build
```

Output:

```text
dist/
```

Publikacja przez GitHub Actions → GitHub Pages.

W repo:

```text
Settings
→ Pages
→ Source
→ GitHub Actions
```

Workflow ma budować Vite i publikować `dist`.

Agent ma użyć **aktualnych oficjalnych wersji GitHub Pages Actions dostępnych w momencie implementacji**, nie kopiować na ślepo starych numerów z losowego tutoriala.

---

# 57. Vite `base` — krytyczne

Agent ma ustalić finalny typ deploy.

## Jeśli:

```text
https://USERNAME.github.io/
```

lub custom domain:

```text
https://example.com/
```

to:

```ts
base: '/'
```

lub domyślna wartość.

## Jeśli:

```text
https://USERNAME.github.io/REPO/
```

to:

```ts
base: '/REPO/'
```

Nie hardcodować repo name, jeśli go jeszcze nie znamy.

Jeżeli w chwili wdrożenia nie wiadomo, czy projekt będzie custom-domain czy project-pages — agent ma zgłosić tę jedną informację przed finalnym deploy.

---

# 58. GitHub workflow — wymagania

Workflow ma:

1. checkout,
2. setup Node,
3. cache npm,
4. `npm ci`,
5. `npm run build`,
6. konfigurację Pages,
7. upload `dist`,
8. deploy Pages.

Trigger:

```text
push → main
```

oraz:

```text
workflow_dispatch
```

Permissions minimalne, wymagane do Pages.

Nie publikować `node_modules`.

---

# 59. Brak routera

To jest single-page experience.

Nie dodawać React Router, jeśli nie jest potrzebny.

Dzięki temu nie ma problemu:

```text
GitHub Pages 404 przy deep-link
```

Jeżeli później routing zostanie dodany — wtedy osobno rozwiązać fallback.

---

# 60. Asset URLs

Nie robić:

```text
/src/assets/...
C:\...
/home/...
```

w runtime.

Wszystkie URL muszą działać po `vite build`.

Preferować importy Vite, żeby pliki dostały fingerprint/hash.

Video jako asset nie może zostać przypadkowo inline'owane.

---

# 61. Cache busting

Ponieważ GitHub Pages nie jest własnym serwerem z dowolną konfiguracją headers:

- JS/CSS: hashing Vite,
- modele/tekstury/video: również hashed imports albo wersjonowane nazwy,
- nie używać ciągle `video.mp4` przy zmieniającej się treści bez wersjonowania.

---

# 62. Brak backendu

Wszystkie funkcje muszą działać static-only.

Upload label:

```text
local browser only
```

Nie dodawać:

- Firebase,
- Supabase,
- API,
- serverless,
- analytics wymagającego cookie banner,

chyba że użytkownik osobno o to poprosi.

---

# 63. Privacy-friendly

Jeśli nie ma analytics:

```text
zero trackers
zero third-party scripts
zero unnecessary cookies
```

Dobrze pasuje do portfolio demo i upraszcza projekt.

---

# 64. Responsywność — desktop

Testować minimum:

```text
1366×768
1440×900
1920×1080
2560×1440
```

Nie projektować wyłącznie pod 1920×1080.

Na 1366×768:

- copy nie może nachodzić na puszkę,
- controls nie mogą wypaść poza ekran,
- film nadal musi wyglądać premium.

---

# 65. Responsywność — mobile

Testować minimum:

```text
360×800
390×844
412×915
```

oraz:

```text
portrait
landscape
```

Sprawdzić realny Safari i Chrome mobile, nie tylko DevTools.

---

# 66. Mobile visual composition

Na portrait:

- puszka jest centralnym bohaterem,
- headline ma mniej słów / mniejszy max-width,
- controls są przy dolnej bezpiecznej strefie,
- nie przyklejać UI do fizycznej dolnej krawędzi,
- zachować `env(safe-area-inset-bottom)`.

---

# 67. Desktop visual composition

Można pozwolić sobie na:

- większą typografię,
- tekst asymetrycznie,
- subtelny technical label po przeciwnej stronie,
- więcej negative space.

Puszka nadal centralna.

---

# 68. Film + copy

W segmentach cinematic nie zasypywać video tekstem.

Film 1:

```text
SURFACE
ALUMINUM / CONDENSATION / FINISH
```

maksymalnie 1–2 krótkie labelki.

Film 2:

```text
OPEN
COLD / PRESSURE / DETAIL
```

Copy ma wejść/wyjść przed kluczowym momentem otwarcia.

---

# 69. Progress indicator

Opcjonalny, bardzo subtelny.

Np. cienka pionowa linia / numer:

```text
01
02
03
```

Nie klasyczny scrollbar replacement.

Natywny scroll zostaje.

---

# 70. Sound

Obecnie:

```text
brak audio
```

Nie implementować muzyki jako ukrytego autoplay.

Jeżeli soundtrack zostanie dodany później:

- osobny asset,
- user gesture,
- explicit sound toggle,
- fade in/out,
- nigdy nie łączyć go ze ścieżką MP4.

---

# 71. Memory management

Po zmianie tekstury:

- dispose starej texture, jeśli nie jest cache'owana i używana dalej,
- nie tworzyć setek material instances,
- nie duplikować rendererów.

Po unmount:

```text
geometry/material/texture cleanup
```

R3F pomaga, ale agent ma zweryfikować.

---

# 72. Nie renderować dwóch canvasów

Jedna scena WebGL.

Nie robić osobnego canvasu dla każdej sekcji.

Całość:

```text
1 sticky canvas
```

zmieniający stan zgodnie z timeline.

---

# 73. Nie dekodować dwóch filmów jednocześnie

W danej chwili aktywnie scrubowany jest maksymalnie jeden.

Drugi może być zbufferowany, ale:

- opacity 0,
- paused,
- bez ciągłego currentTime update.

---

# 74. Debug tools

W dev tylko:

```text
?debug=1
```

Pokazywać:

- global progress,
- segment,
- local film progress,
- desired time,
- current time,
- current frame,
- avg FPS,
- DPR,
- quality tier,
- WebGL camera values,
- active variant.

Debug panel nie może znaleźć się w finalnym UI.

---

# 75. Dev calibration shortcuts

Opcjonalnie w debug:

```text
1 → hero
2 → film1 start
3 → film1 end
4 → configurator
5 → film2 start
6 → film2 end
7 → final
```

Znacznie przyspieszy strojenie.

---

# 76. Browser testing

Obowiązkowo:

Desktop:

- Chrome,
- Edge,
- Firefox,
- Safari jeśli dostępny.

Mobile:

- Chrome Android,
- Safari iOS.

Szczególnie sprawdzić:

- seek H.264 GOP1,
- poster → video,
- first frame,
- szybki flick scroll,
- cofanie scrolla,
- orientation change,
- visibility change.

---

# 77. Scenariusze agresywnego testu scroll

Agent ma wykonać:

1. bardzo wolny scroll,
2. szybki wheel,
3. szybkie trackpad swipe,
4. gwałtowny flick na telefonie,
5. scroll w dół i od razu w górę,
6. wejście do Film 2 przed pełnym pobraniem,
7. kilka zmian tekstury podczas przewijania,
8. background tab → powrót,
9. resize,
10. rotate mobile.

Nie może pojawić się:

- czarna klatka,
- stary frame przez 1 s,
- flash białego tła,
- skok puszki,
- odtwarzanie audio,
- zawieszenie scrolla.

---

# 78. Network test

Testować:

```text
Fast 4G
Slow 4G / throttled
cache disabled
```

Pierwsza wizyta ma nadal prezentować hero bez oczekiwania na 10 MB video.

---

# 79. Lighthouse / profiling

Uruchomić produkcyjny build, nie dev server.

Minimum:

```bash
npm run build
npm run preview
```

Następnie:

- Lighthouse,
- Chrome Performance,
- Memory,
- Network,
- Rendering/FPS.

Nie podawać wyniku Lighthouse bez zaznaczenia urządzenia/profile.

---

# 80. Bundle audit

Po build:

- sprawdzić rozmiary chunków,
- sprawdzić czy 3D libs nie zostały zdublowane,
- sprawdzić czy debug code nie wszedł do prod,
- sprawdzić czy nie bundlujemy ogromnych assetów nieużywanych.

Jeśli bundle jest duży:

- lazy import uploader,
- lazy import opcjonalnych efektów,
- usuń bibliotekę, jeśli można napisać 20 linii własnego kodu.

---

# 81. Zero console errors

Definition of done:

```text
0 errors
0 unhandled promise rejections
0 missing assets
0 React warnings
0 WebGL warnings powtarzanych w pętli
```

Warto ograniczyć także warningi third-party.

---

# 82. Error states

Jeżeli model nie wczyta się:

```text
poster + retry
```

Jeżeli video nie wczyta się:

```text
poster + kontynuacja timeline
```

Jeżeli texture upload jest błędny:

```text
czytelny inline error
```

Nigdy `alert()`.

---

# 83. Model asset gate — ważne

Przed finalną implementacją WebGL agent ma sprawdzić, czy istnieje produkcyjny model:

```text
can.glb
```

z:

- prawidłowym UV,
- osobnym top,
- osobnym tabem.

Jeżeli **nie ma takiego modelu**:

1. agent może zrobić prototyp na CylinderGeometry,
2. ale nie może uznać go za final,
3. ma jasno zgłosić brak produkcyjnego GLB,
4. jeśli agent ma narzędzie do modelowania — stworzyć prosty, schludny slim can,
5. jeśli nie ma — opisać dokładnie, jaki GLB jest potrzebny.

Nie ukrywać brakującego assetu pod „temporary placeholder” w finalnym buildzie.

---

# 84. Texture asset gate

Jeżeli nie ma jeszcze finalnych designów label:

- stworzyć neutralne, minimalistyczne demonstracyjne presety,
- zachować jeden wspólny UV template,
- nie używać logo realnych firm,
- oddzielić layout texture od logiki kodu.

Użytkownik później może podmienić pliki bez przebudowy sceny.

---

# 85. Faza implementacji — kolejność

## Phase 1 — Preflight

- sprawdź repo,
- sprawdź Node/npm,
- sprawdź filmy,
- sprawdź model,
- sprawdź UV,
- ustal deploy mode GitHub Pages,
- zrób notatkę o brakach.

Nie kodować efektów przed preflight.

---

## Phase 2 — Video pipeline

- wygeneruj 720p desktop,
- wygeneruj 540p mobile,
- usuń audio,
- GOP1,
- faststart,
- poster frames,
- ffprobe verify,
- wizualny compare.

---

## Phase 3 — Static product hero

- działający canvas,
- model,
- poprawny material,
- studio lighting,
- 1 tekstura,
- responsywny kadr,
- 60 fps target.

Dopiero gdy hero wygląda dobrze → dalej.

---

## Phase 4 — Scroll engine

- global progress,
- eased progress,
- sticky stage,
- camera states,
- copy transitions.

Bez filmów.

---

## Phase 5 — Film 1

- lazy load,
- scrub,
- crossfade start,
- crossfade end,
- debug calibration.

---

## Phase 6 — Configurator

- 4 textures,
- finish switch,
- horizontal rotate,
- smooth texture transition,
- mobile controls.

---

## Phase 7 — Film 2

- lazy,
- scrub,
- opening sequence,
- match final top shot,
- tab WebGL state.

---

## Phase 8 — Final CTA

- clean hero,
- subtle interaction,
- no cinematic overload.

---

## Phase 9 — Advanced

- `Try your label`,
- adaptive quality,
- reduced motion,
- save-data,
- context lost,
- fallback.

---

## Phase 10 — Production QA

- build,
- profiling,
- cross-browser,
- GitHub deploy,
- live URL test,
- no console errors.

---

# 86. Visual polish checklist

Agent ma sprawdzić ręcznie:

- czy puszka wygląda jak aluminium, a nie plastik,
- czy highlighty są eleganckie,
- czy tło nie jest „martwe”,
- czy czernie w video i WebGL są zbliżone,
- czy exposure nie skacze podczas crossfade,
- czy FOV WebGL nie deformuje puszki,
- czy model nie „pływa” bez powodu,
- czy copy nie zasłania produktu,
- czy mobile nie wygląda jak pomniejszony desktop,
- czy UI nie wygląda jak dashboard SaaS,
- czy texture switch jest wizualnie satysfakcjonujący.

---

# 87. Zakazane skróty

Nie robić:

- 1080p upscale,
- oba filmy preload na first paint,
- audio tylko wyciszone zamiast usuniętego,
- 4K label textures na mobile,
- DPR 2–3 bez limitu,
- custom smooth scroll blokującego mobile,
- `setState` na każdą klatkę,
- 2 osobne canvasy,
- ciężki bloom jako „premium”,
- przypadkowe particle systemy,
- neonowe cyberpunk efekty,
- generyczne gradient cards,
- autoplay sound,
- real brand copy,
- finalnego CylinderGeometry zamiast modelu,
- publikacji bez testu produkcyjnego `dist`.

---

# 88. README projektu

Agent ma przygotować README z:

1. opisem projektu,
2. uruchomieniem:
   ```bash
   npm install
   npm run dev
   ```
3. buildem:
   ```bash
   npm run build
   npm run preview
   ```
4. pipeline video,
5. gdzie wrzucać GLB,
6. gdzie wrzucać tekstury,
7. jaki UV layout obowiązuje,
8. jak dodać nowy wariant,
9. jak działa GitHub Pages deploy,
10. jak ustawić `base`,
11. jak włączyć debug mode,
12. znanymi ograniczeniami.

---

# 89. Definition of Done

Projekt jest skończony dopiero, gdy:

- [ ] oba źródłowe filmy zachowane bez zmian,
- [ ] oba MP4 desktop pozbawione audio,
- [ ] oba MP4 mobile pozbawione audio,
- [ ] desktop 1280×720/24,
- [ ] mobile 960×540/24,
- [ ] GOP=1 zweryfikowany,
- [ ] `faststart` obecny,
- [ ] wszystkie media działają po `npm run build`,
- [ ] WebGL hero działa,
- [ ] model ma poprawne UV,
- [ ] 4 texture presety działają,
- [ ] texture transition jest płynny,
- [ ] horizontal drag działa bez blokowania vertical scroll,
- [ ] Film 1 scrub działa w dół i w górę,
- [ ] Film 2 scrub działa w dół i w górę,
- [ ] przejście WebGL → Film 1 nie ma widocznego skoku,
- [ ] Film 1 → WebGL nie ma widocznego skoku,
- [ ] WebGL → Film 2 nie ma widocznego skoku,
- [ ] Film 2 → final WebGL jest estetyczne,
- [ ] mobile nie pobiera desktop MP4,
- [ ] desktop nie pobiera mobile MP4,
- [ ] Film 2 nie jest pobierany na first critical path,
- [ ] reduced motion działa,
- [ ] save-data fallback działa,
- [ ] WebGL fallback działa,
- [ ] `webglcontextlost` nie kończy się czarnym ekranem,
- [ ] brak audio,
- [ ] brak layout shift,
- [ ] brak console errors,
- [ ] brak broken assets,
- [ ] favicon SVG działa,
- [ ] OG/meta są poprawne,
- [ ] production build przechodzi,
- [ ] strona działa z finalnym `base`,
- [ ] workflow GitHub Pages przechodzi,
- [ ] live GitHub Pages został sprawdzony na desktopie,
- [ ] live GitHub Pages został sprawdzony na mobile.

---

# 90. Kryterium jakości finalnej

Finalna strona ma wywoływać reakcję:

> „To nie jest mockup. To wygląda jak interaktywna kampania produktu, którą można wdrożyć dla prawdziwej marki.”

Najważniejsza demonstracja dla potencjalnego klienta:

```text
MAM PRODUKT 3D
→ MOGĘ OBRACAĆ
→ MOGĘ PODMIENIAĆ BRANDING
→ MOGĘ ZMIENIAĆ FINISH
→ FILMOWE MOMENTY ŁĄCZĄ SIĘ Z 3D
→ CAŁOŚĆ DZIAŁA PŁYNNIE NA TELEFONIE
```

To jest właściwy cel biznesowy projektu.

---

# 91. Jedyna rzecz, której agent nie może zgadywać przy finalnym deploy

Przed ustawieniem finalnego `vite.base` agent musi znać:

```text
A) custom domain / USERNAME.github.io
czy
B) USERNAME.github.io/REPO/
```

Do czasu uzyskania tej informacji projekt może być przygotowany tak, by łatwo obsługiwał oba warianty.

Nie blokuje to developmentu.

---

# 92. Ostatnia instrukcja dla agenta

Po implementacji **nie raportuj tylko „gotowe”**.

Raport końcowy ma zawierać:

```text
1. Co zostało zrobione
2. Jakie pliki video powstały i ich rozmiary
3. Czy audio faktycznie nie istnieje w strumieniach
4. Jaki model/UV wykorzystano
5. Jakie texture warianty są dostępne
6. Jak działa adaptive quality
7. Jakie są wyniki build
8. Co zmierzono na mobile
9. Co zmierzono na desktop
10. Czy są jakiekolwiek znane problemy
11. Jak uruchomić lokalnie
12. Jak wdrożyć na GitHub Pages
```

Jeżeli coś nie działa lub jest kompromisem — napisać to jawnie.

**Nie zakładać poprawności. Sprawdzać.**
