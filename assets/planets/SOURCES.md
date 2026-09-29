# Orrery imagery

Sources were checked on 22 September 2026. No AI-generated imagery is used.

## New global maps

| Asset | Source and attribution | Licence and treatment |
| --- | --- | --- |
| `textures/earth.jpg` | [NASA/GSFC Blue Marble, distributed by NOAA Science On a Sphere](https://sos.noaa.gov/catalog/datasets/blue-marble/). [Source JPEG](https://sos.noaa.gov/ftp_mirror/land/blue_marble/blue_marble/4096.jpg). Credit NASA/GSFC; Reto Stöckli, with Robert Simmon. | US government imagery; [NASA media guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/). Re-encoded at 4096 × 2048, JPEG quality 92. This is a satellite composite, not a single photograph. It combines 2001 land and ocean observations with a three-day cloud composite. Polar clouds include thermal infrared observations. The renderer adds illustrative lighting and atmospheric scattering at the edge. |
| `textures/mars.jpg` | [NASA exploration imagery, distributed by NOAA Science On a Sphere](https://sos.noaa.gov/catalog/datasets/mars/). [Source JPEG](https://sos.noaa.gov/ftp_mirror/astronomy/mars/original/4096.jpg). Credit NASA; NOAA/Global Systems Division. | US government imagery; NASA media guidelines. Re-encoded at 4096 × 2048, JPEG quality 92. The catalogue does not specify the exact mission mixture for this composite. |
| `textures/uranus.jpg` | [Uranus map, ESO Supernova](https://supernova.eso.org/exhibition/images/uranusmap-10x5k-CC/). [Source JPEG](https://supernova.eso.org/static/archives/exhibitionimages/large/uranusmap-10x5k-CC.jpg). Credit NASA, via ESO Supernova. | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), under [ESO's image terms](https://www.eso.org/public/outreach/copyright/). Reduced from 10000 × 5000 to 4096 × 2048 with Lanczos resampling; JPEG quality 92. Treat this as an atmospheric reconstruction. The catalogue does not establish direct global photographic coverage or calibrated true colour. |
| `textures/neptune.jpg` | [Neptune map, ESO Supernova](https://supernova.eso.org/germany/exhibition/images/NEP0VTT1-CC-10x5k/). [Source JPEG](https://supernova.eso.org/static/archives/exhibitionimages/large/NEP0VTT1-CC-10x5k.jpg). Credit NASA, via ESO Supernova. | CC BY 4.0, under ESO's image terms. Reduced from 10000 × 5000 to 4096 × 2048 with Lanczos resampling; JPEG quality 92. Treat this as an atmospheric reconstruction. Its strong blue colour is not a calibrated natural-colour claim. |
| `textures/sun-global.jpg` | [Solar System Scope / INOVE](https://www.solarsystemscope.com/textures/). [Source JPEG](https://www.solarsystemscope.com/textures/download/8k_sun.jpg). | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Artist-prepared equirectangular solar reconstruction based on NASA imagery. Download labelled 8k currently supplies 4096 × 2048 pixels. Recoloured using the original NASA/SDO photograph's empirical palette and re-encoded at JPEG quality 95. This replaces the visibly stitched STEREO mosaic. |

## Sun processing and limits

The Sun uses an artist-prepared global map, not a single front-facing photograph wrapped around a sphere. Solar System Scope describes its maps as NASA imagery adaptations with enhanced colour and reconstructed missing coverage. This asset is an illustrative material, not a simultaneous measured solar surface.

`tools/prepare_sun.py` maps the source intensity ranks to an empirical palette sampled inside the existing SDO disc. The palette applies red, green, and blue gains of 1.08, 0.72, and 0.38. This keeps the darker orange colour while removing the conspicuous spacecraft joins in the previous global mosaic. The runtime applies mild limb shading.

The original `textures/sun-sdo.jpg` remains unchanged. It exactly matches [SDO/AIA, 10 July 2026 at 19:06:58 UTC](https://sdo.gsfc.nasa.gov/assets/img/browse/2026/07/10/20260710_190658_2048_0171.jpg). Credit NASA/SDO and the AIA science team. Its SHA-256 is `e1152719047958770662ecc202548ed10abbdc2520e7b8f7b45014a52fba048e`.

The renderer samples only its off-limb emission for the separate prominence layer. It places that photograph on one fixed plane, rotates it about the same display axis as the globe, and hides it behind the opaque sphere. This is a photographic display approximation, not a measured 3D corona. The layer becomes foreshortened as the camera turns. The software fallback retains the rotating global surface but omits the prominence plane and atmospheric scattering.

To rebuild the solar material, install Pillow and NumPy. Run these commands from the project root:

```sh
mkdir -p /tmp/portfolio-sun
curl -L --fail https://www.solarsystemscope.com/textures/download/8k_sun.jpg -o /tmp/portfolio-sun/source.jpg
python3 assets/planets/tools/prepare_sun.py /tmp/portfolio-sun/source.jpg assets/planets/textures/sun-sdo.jpg assets/planets/textures/sun-global.jpg
```

## Retained imagery

Mercury, Venus, Jupiter, Saturn, and Saturn's ring map remain from [Solar System Scope](https://www.solarsystemscope.com/textures), under CC BY 4.0. The Milky Way backdrop remains credited to ESO / S. Brunier. Existing planet portraits remain on disk but the orrery no longer renders them.

## Display conventions

All bodies keep the existing square-root radius scale. The Sun's model radius is 44; Jupiter's is 13.9; Earth's is 4.2; Mercury's is 2.6. The shared body scale is 1.0. This reduces all body radii by 37.5% from the previous factor of 1.6, without changing the orbital radii or relative body sizes. The renderer then applies the same perspective projection to every body. It does not apply a per-body screen-size minimum or replace textures with coloured dots.

Orbital distance is `90 × log(1 + r / 0.12)`, where `r` is in AU. Mercury's mean orbit is about 130 model units and Neptune's about 497. This expands the gaps, especially between the giant planets. The Sun's displayed model radius is 44, so Mercury's perihelion remains outside its surface and prominence layer. The camera stops zooming out at the complete-system framing distance. The smallest planets consequently show less detail in the overview than in their chapters; they always render their texture. No independent minimum sizes or dot substitutes are used. Projected occultations remain possible when the user views aligned bodies or turns the system edge-on.

Camera yaw and elevation are unrestricted. Drag and two-pointer gestures feed smoothly damped camera targets. A pinch can continue as a one-pointer drag without releasing the remaining pointer. Browsers that expose native trackpad rotation also support twist; Chromium reports trackpad pinch as zoom through Ctrl+wheel. Ordinary wheel input still scrolls the page.

Body poses, prime meridians, spin rates, and lighting are illustrative. The Sun starts with an inclined display axis to show its observed active latitudes. Surface spin stops with Pause and with reduced motion. Camera rotation still exposes different longitude and latitude when the simulation is paused. The date and speed controls continue to drive the existing orbital simulation.

## Matteo Sun and optional Earth preview

The default Sun uses Matteo’s baked material. Use `?materials=matteo#maze` for his optional Earth material. The default Earth remains the NASA/NOAA composite. Use `?materials=original#top` for the previous Sun. These samples use the original downloaded Blender scenes, not their marketing preview images. Both scenes are by Matteo Pascale and use the [Blendkit Royalty Free licence](https://www.blendkit.com/docs/licenses/). The licence permits commercial derivative works and prohibits resale as standalone assets. Sources and licence were checked on 22 September 2026. No AI imagery is used.

- [Earth scene](https://www.blendkit.com/asset-gallery-detail/9b27d1a5-f9ce-4802-8eeb-0b14417b8158/), asset version `d348f8ee-2235-42ec-9852-a84bb2c31fb4`. The packed `earth_color_10K.tif`, `earth_clouds_8K.tif`, `earth_landocean_16K.png`, and `earth_nightlights_21K.tif` become `textures/matteo/earth.jpg`, `clouds.jpg`, `land.jpg`, and `night.jpg`. Each is reduced to 4096 × 2048 with Lanczos resampling and JPEG quality 92. The scene labels its source directory “NASA Earth Textures”; individual mission provenance is not supplied. The ocean mask is white over water. The browser adapts the source's ocean desaturation and separate cloud/night layers, and adds illustrative cloud shadows, specular ocean lighting and limb scattering. This is an approximation of the Blender scene, without its terrain displacement or volumetric atmosphere.
- [Realistic Sun scene](https://www.blendkit.com/asset-gallery-detail/c4662bed-ab69-4164-8fba-e8c67ae00b89/), asset version `0bab432d-ecc5-44d2-be02-6ae276b8a652`. `textures/matteo/sun.jpg` is a 2048 × 1024 equirectangular emission bake of its original `Material` on a unit UV sphere at frame 1. Blender 3.6.23, Cycles, four samples; original Filmic / Medium High Contrast / exposure −1.257862 colour management; JPEG quality 95. It is an artist's procedural reconstruction, not global solar photography. The sphere rotates, but the baked surface does not evolve. The preview omits the original particle-driven volumetric flares. The website now adds its own Three.js plasma loops and a soft edge glow. It does not use the previous SDO prominence plane.

The source Blender files remain outside the website. The default change affects only the Sun. The optional Earth preview changes Earth as well. Orbit scale, planet sizes, camera controls and chapter navigation are retained. The software fallback displays the rotating base maps but does not reproduce the extra Earth layers.

## Optional Pedro model preview

Use `?materials=pedro#top` for the chapter tour or `?materials=pedro#system` for the full system. This option renders the original meshes and glTF materials from [High Resolution Solar system](https://sketchfab.com/3d-models/high-resolution-solar-system-59fcc3e1dc634ef192215a7e485f147e) by [Pedro B. Goulart / Pebegou](https://sketchfab.com/Pebegou), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The user supplied the extracted glTF download on 22 September 2026. Its original attribution is retained in `pedro/license.txt`. The glTF, binary geometry and all textures in `pedro/` come from that download without image regeneration or recolouring.

The preview uses Pedro's Sun, Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus and Neptune meshes. Original normal maps, material transparency, Earth's clouds, Jupiter's atmospheric layer, Saturn's and Uranus's rings, and the Sun's corona geometry are retained. The bundled Moon and Pluto are not added to the existing chapter layout. The maps include artistic and enhanced colours; Uranus and Neptune are atmospheric reconstructions, not direct global photography. The source does not give mission-by-mission texture provenance. Venus shows a surface reconstruction rather than its visible cloud envelope. Earth is visibly stylised in the supplied texture.

Adaptations: remove the source's whole-scene transform and baked skeletal placement; centre each body and normalise its radius to the existing orrery scale; centre and resize the misplaced Earth cloud shell to 1.006 Earth radii; correct Jupiter's stretched polar axis to 0.935 of its equatorial radius; reverse Earth's mirrored U coordinates. Body tilt, rotation, camera and lighting follow the website. The source's animated orbital layout is not used. The corona is textured source geometry, not a simulated volume. A fixed source material can look different under this preview's lighting than under Sketchfab's environment.

`js/solar-pedro.js` loads only for this preview. It uses locally vendored Three.js 0.180.0 and its GLTFLoader and BufferGeometryUtils modules, from the official `three` npm distribution through jsDelivr. Three.js is [MIT licensed](https://github.com/mrdoob/three.js/blob/r180/LICENSE); its licence remains in `js/vendor/three/LICENSE`. Vendor import paths are adjusted for local use. Other material options retain the existing renderer.

## Optional custom Sun model

Use `?sun=custom#top`. This option replaces only the Sun. It also works with `?materials=matteo&sun=custom#top` to retain Matteo's Earth. The default material and earlier comparisons remain available.

The surface now uses the [NASA/SDO AIA 171 Å synoptic map for Carrington rotation 2310](https://sdo.gsfc.nasa.gov/assets/img/synoptic/AIA0171/CR2310.fits), from the [official synoptic catalogue](https://sdo.gsfc.nasa.gov/data/synoptic/). Credit NASA/SDO and the AIA science team; the file identifies SDO/JSOC-SDP as its origin. US government data and imagery follow [NASA's media usage guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/). Downloaded on 22 September 2026. The FITS header gives coverage from 15 April to 12 May 2026, in TAI. This is a composite across a solar rotation, not a simultaneous global photograph. Solar activity can change between its observations.

`textures/custom-sun/aia171-cr2310.bin` preserves the source's 3600 × 1080 sample grid in a 16-bit floating-point red-channel texture. `tools/prepare_solar_observations.py` reads the FITS counts, fills missing samples within each longitude by latitude interpolation and nearest-edge extrapolation, applies a logarithmic display range of 20–700 counts, and saves little-endian half floats. Polar filling is an approximation. This is a display conversion of observed data, not AI imagery. The browser maps the grid to the sphere, applies an illustrative orange colour scale and mild limb shading, and blends a narrow band at the longitude wrap to soften the time-composite join. It does not use the earlier repeated photographic patches.

The original, unchanged `textures/sun-sdo.jpg` supplies off-limb photographic emission. Three transparent annular layers rotate with the model and show only outside the projected solar disc. These layers replace the procedural wire loops. They approximate prominence depth and can look different as their viewing angle changes; they are not volumetric reconstructions or measured magnetic field lines. The Sun's body radius and the rest of the orrery are unchanged.

The model uses the existing local Three.js dependency under its MIT licence. The photograph and data show false-colour extreme-ultraviolet structure, not visible-light telescope colour. If loading fails, the existing Sun remains visible and the browser logs the failure. This revision has received desktop visual and camera-rotation checks only.

To reproduce the data conversion, download the linked FITS file, then run `python3 assets/planets/tools/prepare_solar_observations.py /path/to/CR2310.fits assets/planets/textures/custom-sun/aia171-cr2310.bin` from the project root. NumPy is required.

## Matteo Sun colour comparisons

`?sun=white#top`, `?sun=amber#top`, `?sun=orange#top` and `?sun=red#top` provide four colour choices. The default is `?sun=golden#top`, which preserves Matteo’s yellow-white highlights and orange shadows. These can also be combined with `materials=matteo` for Matteo's Earth. The existing custom and original comparison routes remain available.

All colour choices use the unchanged `textures/matteo/sun.jpg` and its Blendkit Royalty Free licence above. The shader decodes sRGB and applies a shared 0.82 exposure factor. The default retains the source RGB detail with linear gains `[1, 0.88, 0.7]` before encoding sRGB. This retains colour differences between bright and dark regions. The four uniform-hue comparisons instead extract linear Rec.709 luminance and apply a colour multiplier. The fine surface pattern, globe radius, spin and camera controls are retained. The software fallback applies the same colour calculation. The soft edge glow uses the selected hue.

Linear RGB multipliers are white `[1, 1, 1]`, amber `[1, 0.46, 0.13]`, orange `[1, 0.23, 0.045]` and red-orange `[1, 0.09, 0.028]`. They share exposure and texture intensity; their perceived brightness differs with hue. These are artistic colour options, not wavelength measurements or calibrated views through Earth's atmosphere. White reflects the broad visible-light appearance, but Matteo's pattern remains an artistic procedural reconstruction. The requested space-versus-Earth spectral comparison was superseded by these colour choices; no spectral data assets are shipped.

No new raster asset or generated imagery is used. The original texture licence and credit apply to every variant.

The Matteo Sun uses a second, perpendicular texture projection at its poles. A smooth blend replaces the pinched polar regions with equatorial detail from the same licensed map. Both projections rotate with the sphere. This is an artistic remapping, not additional solar observations. The colour treatment, texture file and flare geometry remain unchanged. The software fallback uses the same remapping.

## Three.js solar flare treatment

`js/solar-flares.js` adds seven fixed regions of plasma strands to the current Matteo Sun. Each region uses asymmetric nested 3D curves, fine emissive tubes and wider translucent tubes. Shader noise varies their density and follows the existing surface animation clock. The curves keep their attachment points on the sphere. The group uses the same axial tilt and rotational phase as the surface. An invisible depth-writing sphere hides geometry behind the Sun.

The flare renderer composites over the existing Sun without replacing or recolouring its surface. It uses two draw calls: the depth sphere and merged plasma geometry. Pause and reduced motion stop the existing animation clock, including flare flow. Camera movement still changes the view. `?sun=golden&flares=off#top` provides a surface-only comparison. The older original, custom and Pedro previews retain their own treatments.

The flare palette blends orange outer strands into pale golden highlights. It applies the same linear colour gains and 0.82 exposure as the Sun, then converts to display colour. The white, amber, orange and red comparison routes also apply their selected hue to the flares. The loop shapes remain fixed; moving shader noise changes strand brightness and density, and the vertices have a small animated displacement. The animation rate does not scale with the orbital speed buttons; Pause and reduced motion stop it.

The geometry and shader are authored for this prototype. No external flare texture, downloaded model or AI-generated image is used. Three.js and BufferGeometryUtils retain their existing MIT licence in `js/vendor/three/LICENSE`. These are prominence-inspired visual effects, not measured magnetic fields or a physical plasma simulation. The wider translucent strands approximate volume; this is not a volumetric fluid solver. The 2D software fallback retains the Sun surface and omits this WebGL effect.
