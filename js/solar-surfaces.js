class CanvasFit {
  constructor() {
    this.clock = null;
    this.frames = [];
  }

  size(canvas, box, clock) {
    if (clock !== this.clock) [this.clock, this.frames] = [clock, [{ bw: 0, bh: 0 }, ...this.frames.slice(0, 59)]];
    const frame = this.frames[0];
    [frame.bw, frame.bh] = [Math.max(frame.bw, box.bw), Math.max(frame.bh, box.bh)];
    const bw = Math.max(...this.frames.map(f => f.bw)), bh = Math.max(...this.frames.map(f => f.bh));
    if (canvas.width >= box.bw && canvas.height >= box.bh && canvas.width * canvas.height <= 2 * bw * bh) return null;
    return [bw, bh].map(n => Math.ceil(n * 1.25 / 128) * 128);
  }
}

class OrrerySurfaces {
  static visibleBox(ctx, x, y, radius, extent, dpr, resolution = dpr) {
    const [x0, y0] = [Math.max(0, x - radius * extent), Math.max(0, y - radius * extent)];
    const [x1, y1] = [Math.min(ctx.canvas.width / dpr, x + radius * extent), Math.min(ctx.canvas.height / dpr, y + radius * extent)];
    if (x1 <= x0 || y1 <= y0) return null;
    const bucket = n => Math.ceil(n / 128) * 128;
    const [dw, dh] = [Math.ceil((x1 - x0) * resolution), Math.ceil((y1 - y0) * resolution)];
    return { x0, y0, w: x1 - x0, h: y1 - y0, dw, dh, bw: bucket(dw), bh: bucket(dh), window: [(x0 - x) / radius, (y - y1) / radius, (x1 - x) / radius, (y - y0) / radius] };
  }

  trueSpin(name, days) {
    const [start, rate] = this.rotation[name];
    return -(((start + rate * days) % 360 + 360) % 360) * Math.PI / 180;
  }

  sunAzimuth(name, days) {
    const pos = this.orbitPosition(name, days);
    if (!pos) return 0;
    const tilt = this.tilts[name] * Math.PI / 180;
    return Math.atan2(-pos.y * Math.cos(tilt) + pos.z * Math.sin(tilt), -pos.x);
  }

  faceOf(name, days) {
    return this.trueSpin(name, days) + this.sunAzimuth(name, days);
  }

  faceRate(name) {
    const turn = this.sunAzimuth(name, this.days + 0.01) - this.sunAzimuth(name, this.days - 0.01);
    return (Math.atan2(Math.sin(turn), Math.cos(turn)) / 0.02 - this.rotation[name][1] * Math.PI / 180) * this.speed;
  }

  apparentRate(name) {
    const calm = 0.1 * Math.max(1, (this.rotation[name][1] / this.rotation.earth[1]) ** 0.35);
    const rate = Math.abs(this.faceRate(name));
    return rate <= calm ? rate : calm * (1 + 0.2 * Math.log(rate / calm));
  }

  spinOf(name) {
    const rate = this.faceRate(name), shown = this.apparentRate(name), face = this.faces[name];
    if (Math.abs(rate) <= shown || !face) this.faces[name] = { value: this.faceOf(name, this.days), clock: this.clock };
    else if (face.clock !== this.clock) {
      face.value = (face.value + Math.sign(rate) * shown * (this.clock - face.clock)) % (2 * Math.PI);
      face.clock = this.clock;
    }
    return this.faces[name].value - this.sunAzimuth(name, this.days);
  }

  constructor() {
    this.canvas = document.createElement("canvas");
    this.gl = this.canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false, antialias: false });
    this.fit = new CanvasFit();
    this.ready = !this.gl;
    this.compilation = this.gl?.getExtension("KHR_parallel_shader_compile");
    this.detailBody = "sun";
    this.detailAfter = 0;
    this.revision = 0;
    this.renderScale = 1;
    this.maps = {};
    this.time = 0;
    this.days = 0;
    this.speed = 0;
    this.clock = 0;
    this.orbitPosition = () => null;
    this.faces = {};
    this.rotation = {
      sun: [84.176, 14.1844], mercury: [329.5469, 6.1385025], venus: [160.2, 1.4813688],
      earth: [280.46061837, 360.98564736629], mars: [176.63, 350.89198226], jupiter: [284.95, 870.536],
      saturn: [38.9, 810.7939024], uranus: [203.81, 501.1600928], neptune: [249.978, 541.1397757]
    };
    this.regions = [
      [0.25, 0.26, 0.22, 0.12, 0.35],
      [-1.9, -0.18, 0.16, 0.11, -0.6],
      [1.2, -0.48, 0.1, 0.08, 0.7],
      [-1.0, 0.7, 0.09, 0.06, -0.3],
      [2.6, 0.43, 0.13, 0.1, 0.5]
    ];

    const materials = new URLSearchParams(location.search).get("materials");
    this.matteo = materials === "matteo";
    this.matteoSun = materials !== "original";
    const sun = new URLSearchParams(location.search).get("sun");
    const sunColours = {
      golden: [1, 0.88, 0.7],
      white: [1, 1, 1],
      amber: [1, 0.46, 0.13],
      orange: [1, 0.23, 0.045],
      red: [1, 0.09, 0.028]
    };
    this.sunColour = sunColours[sun] || sunColours.golden;
    this.sunPreserveColour = !["white", "amber", "orange", "red"].includes(sun);
    this.photosphere = !sun;
    if (new URLSearchParams(location.search).get("materials") === "pedro") this.loadPedro();
    if (new URLSearchParams(location.search).get("sun") === "custom") this.loadCustomSun();
    this.tilts = { sun: 56, mercury: 0.03, venus: 177.4, earth: 23.44, mars: 25.19, jupiter: 3.13, saturn: 26.73, uranus: 97.77, neptune: 28.32 };
    if (this.gl) this.program = this.initialise();
    this.flareOptions = [materials, sun];
    this.requested = {};
    this.retryAfter = {};
    this.detailRadii = {};
    this.drawn = {};
    this.uploads = [];
    const planets = Object.keys(this.tilts).filter(name => name !== "sun");
    if (this.matteoSun) this.load("sun", "data:image/webp;base64,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");
    this.want("sun", 0)
      .then(() => {
        this.previewsStarted = true;
        return Promise.all(planets.map(name => this.want(name, 0)));
      })
      .then(() => {
        this.upgrades = true;
        if (!this.matteoSun) this.load("corona", "assets/planets/textures/sun-sdo.jpg");
        if (this.matteo) {
          for (const name of ["clouds", "land", "night"]) this.load(name, `assets/planets/textures/matteo/${name}.jpg`);
        }
      });
  }

  textureWidth(name) {
    return (name === "sun" ? !this.matteoSun : ["earth", "mars", "uranus", "neptune"].includes(name)) ? 4096 : 2048;
  }

  textureSource(name, width) {
    const useMatteo = name === "sun" ? this.matteoSun : name === "earth" && this.matteo;
    const file = useMatteo ? `matteo/${name}` : name === "sun" ? "sun-global" : name;
    const size = width === 1024 ? "-preview" : width < this.textureWidth(name) ? `-${width}` : "";
    return `assets/planets/textures/web/${file}${size}.webp?v=20261015-progressive`;
  }

  want(name, radiusPx) {
    const width = Math.min(this.textureWidth(name), 2 ** Math.ceil(Math.log2(Math.max(1024, 5 * radiusPx))));
    if (this.requested[name] || width <= (this.maps[name]?.width || 0) || performance.now() / 1000 < (this.retryAfter[name] || 0)) return;
    this.requested[name] = width;
    return this.load(name, this.textureSource(name, width));
  }

  updateTextures(names) {
    for (const name of this.previewsStarted ? Object.keys(this.tilts) : ["sun"]) this.want(name, 0);
    const idle = this.clock >= this.detailAfter;
    const next = this.uploads.findIndex(([name]) => idle || !this.maps[name]);
    if (next >= 0) this.upload(...this.uploads.splice(next, 1)[0]);
    if (!this.upgrades || !idle || this.requested[this.detailRequest]) return;
    const chapterRadius = 0.3 * Math.min(innerWidth, innerHeight) * Math.min(devicePixelRatio || 1, 2);
    const bodies = names[0] === "system" ? Object.keys(this.detailRadii) : names.filter(name => name !== "system");
    for (const [i, name] of bodies.entries()) {
      const radius = names[0] === "system" || i === 0 ? this.detailRadii[name] || 0 : chapterRadius;
      if (!this.want(name, radius)) continue;
      this.detailRequest = name;
      break;
    }
  }

  async loadFlares(materials, sun) {
    if (!this.matteoSun || sun === "custom" || materials === "pedro" || new URLSearchParams(location.search).get("flares") === "off") return;
    try {
      const { SolarFlares } = await import("./solar-flares.js?v=20261016-merged");
      this.flares = await SolarFlares.create(this.regions, this.sunColour, this.sunPreserveColour, new CanvasFit());
    } catch (error) {
      console.error("Solar flares could not load. Keeping the Sun surface.", error);
    }
  }

  async loadCustomSun() {
    try {
      const { CustomSun } = await import("./solar-sun.js?v=20260922-observations");
      const sun = new CustomSun();
      await sun.load();
      this.customSun = sun;
    } catch (error) {
      console.error("The custom Sun could not load. Showing the existing Sun.", error);
    }
  }

  async loadPedro() {
    const status = document.createElement("p");
    status.textContent = "Loading Pedro’s models…";
    status.setAttribute("role", "status");
    Object.assign(status.style, { position: "fixed", bottom: "64px", left: "24px", zIndex: "100", background: "#10181d", color: "#fff", padding: "8px 12px" });
    document.body.append(status);
    try {
      const { PedroSurfaces } = await import("./solar-pedro.js");
      const pedro = new PedroSurfaces();
      await pedro.load();
      this.pedro = pedro;
      status.remove();
    } catch (error) {
      status.textContent = "Pedro’s models could not load. Showing original materials.";
      console.error(error);
    }
  }

  initialise(detailed = false) {
    const gl = this.gl;
    const vertex = this.compile(gl.VERTEX_SHADER, `
      attribute vec2 position;
      uniform vec4 window;
      varying vec2 point;
      void main() {
        point = mix(window.xy, window.zw, position * 0.5 + 0.5);
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `);
    const gradients = gl.getExtension("OES_standard_derivatives") && gl.getExtension("EXT_shader_texture_lod");
    const fragment = this.compile(gl.FRAGMENT_SHADER, `
      ${gradients ? "#extension GL_OES_standard_derivatives : enable\n#extension GL_EXT_shader_texture_lod : enable" : ""}
      ${detailed ? "#define DETAIL" : ""}
      precision highp float;
      varying vec2 point;
      uniform sampler2D surface;
      uniform sampler2D corona;
      uniform sampler2D clouds;
      uniform sampler2D land;
      uniform sampler2D night;
      uniform float matteo;
      uniform vec3 sunColour;
      uniform float sunPreserveColour;
      uniform mat3 view;
      uniform float tilt;
      uniform float phase;
      uniform float kind;
      uniform float edge;
      uniform float photosphere;
      uniform float discPx;
      uniform float time;
      uniform vec3 light;
      const float PI = 3.14159265359;
      vec3 linearColour(vec3 colour) {
        return mix(pow((colour + 0.055) / 1.055, vec3(2.4)), colour / 12.92, step(colour, vec3(0.04045)));
      }
      vec3 displayColour(vec3 colour) {
        return mix(1.055 * pow(colour, vec3(1.0 / 2.4)) - 0.055, colour * 12.92, step(colour, vec3(0.0031308)));
      }
      #ifdef DETAIL
      vec3 hash33(vec3 p) {
        p = fract(p * vec3(0.1031, 0.1030, 0.0973));
        p += dot(p, p.yxz + 33.33);
        return fract((p.xxy + p.yxx) * p.zyx);
      }
      float valueNoise(vec3 p) {
        vec3 cell = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash33(cell).x, hash33(cell + vec3(1, 0, 0)).x, f.x),
                       mix(hash33(cell + vec3(0, 1, 0)).x, hash33(cell + vec3(1, 1, 0)).x, f.x), f.y),
                   mix(mix(hash33(cell + vec3(0, 0, 1)).x, hash33(cell + vec3(1, 0, 1)).x, f.x),
                       mix(hash33(cell + vec3(0, 1, 1)).x, hash33(cell + vec3(1, 1, 1)).x, f.x), f.y), f.z);
      }
      float granulation(vec3 p) {
        vec3 cell = floor(p), f = fract(p);
        float d1 = 8.0, d2 = 8.0, bright = 0.0;
        for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) for (int k = -1; k <= 1; k++) {
          vec3 o = vec3(float(i), float(j), float(k));
          vec3 h = hash33(cell + o);
          vec3 q = o + 0.5 + 0.42 * sin(time * 0.35 + 6.2831 * h) - f;
          float d = dot(q, q);
          if (d < d1) { d2 = d1; d1 = d; bright = 0.5 + 0.5 * sin(time * 0.6 + 6.2831 * h.y); }
          else if (d < d2) d2 = d;
        }
        float lane = smoothstep(0.0, 0.16, sqrt(d2) - sqrt(d1));
        float dome = 1.06 - 0.22 * smoothstep(0.0, 0.55, sqrt(d1));
        return (0.84 + 0.22 * bright) * dome * mix(0.7, 1.0, lane);
      }
      #endif
      vec3 photosphereColour(float intensity, float mu, float shade) {
        float t = clamp(mix(0.5, intensity, 0.6), 0.0, 1.0);
        float heat = clamp((0.25 + 0.75 * t) * (1.0 - 0.75 * (1.0 - pow(mu, 0.55))) * shade, 0.0, 1.0);
        vec3 ramp = heat < 0.5
          ? mix(vec3(0.55, 0.07, 0.01), vec3(0.95, 0.28, 0.04), smoothstep(0.05, 0.5, heat))
          : mix(vec3(0.95, 0.28, 0.04), vec3(1.0, 0.66, 0.26), smoothstep(0.5, 0.95, heat));
        return displayColour(ramp * heat * 1.4);
      }
      vec3 surfaceColour(vec2 uv) {
        ${gradients ? `
          vec2 dx = dFdx(uv), dy = dFdy(uv);
          dx.x -= floor(dx.x + 0.5);
          dy.x -= floor(dy.x + 0.5);
          return texture2DGradEXT(surface, uv, dx, dy).rgb;
        ` : "return texture2D(surface, uv).rgb;"}
      }
      vec3 rotate(vec3 p, float angle) {
        float c = cos(angle), s = sin(angle);
        vec3 axis = vec3(0.0, sin(tilt), cos(tilt));
        return p * c + cross(axis, p) * s + axis * dot(axis, p) * (1.0 - c);
      }
      vec4 prominence() {
        if (matteo > 0.5) return vec4(displayColour(sunColour), 0.12 * exp(-(length(point) - 1.0) * 42.0));
        vec3 right = rotate(vec3(0.852525, 0.522687, 0.0), -phase);
        vec3 up = rotate(vec3(-0.433333, 0.706776, 0.559193), -phase);
        vec3 normal = cross(right, up);
        vec3 ray = view * vec3(0.0, 0.0, 1.0);
        float facing = dot(ray, normal);
        if (abs(facing) < 0.03) return vec4(0.0);
        vec3 p = view * vec3(point, 0.0);
        p -= ray * dot(p, normal) / facing;
        vec2 uv = vec2(dot(p, right), -dot(p, up)) * 0.398 + vec2(0.5, 0.486);
        if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return vec4(0.0);
        vec3 colour = texture2D(corona, uv).rgb;
        float plasma = max(0.0, colour.r - 1.2 * colour.b - 0.016);
        float alpha = min(0.82, plasma * 3.35) * (1.0 - smoothstep(1.18, 1.25, length(point)));
        return vec4(colour * vec3(1.16, 0.7, 0.3), alpha);
      }
      vec3 earthMaterial(vec3 colour, vec3 n, vec2 uv) {
        float daylight = max(0.0, dot(n, light));
        float ocean = texture2D(land, uv).r;
        float grey = dot(colour, vec3(0.2126, 0.7152, 0.0722));
        colour = mix(colour, vec3(grey), ocean * 0.9);
        vec2 cloudUV = vec2(fract(uv.x + phase * 0.006), uv.y);
        float cloud = texture2D(clouds, cloudUV).r;
        float shadow = texture2D(clouds, cloudUV + vec2(0.002, -0.001)).r;
        colour *= (0.025 + 1.15 * daylight) * (1.0 - shadow * 0.45);
        float specular = pow(max(0.0, dot(n, normalize(light + vec3(0.0, 0.0, 1.0)))), 70.0);
        colour += vec3(0.8, 0.87, 1.0) * specular * ocean * (1.0 - cloud) * 0.55;
        colour += texture2D(night, uv).rgb * vec3(1.0, 0.68, 0.3) * (1.0 - smoothstep(0.0, 0.22, daylight));
        colour = mix(colour, vec3(0.12 + 0.95 * daylight), clamp(cloud * 1.25, 0.0, 1.0));
        return mix(colour, vec3(0.18, 0.43, 0.85) * (0.2 + daylight), 0.65 * pow(1.0 - n.z, 3.0));
      }
      void main() {
        float r2 = dot(point, point);
        if (r2 > 1.0) {
          if (kind == 2.0) gl_FragColor = prominence();
          else if (kind == 1.0) {
            float a = 0.28 * exp(-(sqrt(r2) - 1.0) * 130.0) * smoothstep(-0.2, 0.3, dot(normalize(vec3(point, 0.0)), light));
            gl_FragColor = vec4(0.22, 0.48, 0.92, a);
          } else gl_FragColor = vec4(0.0);
          return;
        }
        vec3 n = vec3(point, sqrt(1.0 - r2));
        vec3 world = view * n;
        vec3 local = vec3(world.x, world.y * cos(tilt) - world.z * sin(tilt), world.y * sin(tilt) + world.z * cos(tilt));
        vec2 uv = vec2(fract(atan(local.y, local.x) / (2.0 * PI) + 0.5 + phase / (2.0 * PI)), 0.5 - asin(clamp(local.z, -1.0, 1.0)) / PI);
        vec3 frame = vec3(mat2(cos(phase), sin(phase), -sin(phase), cos(phase)) * local.xy, local.z);
        #ifdef DETAIL
        if (kind == 2.0 && photosphere > 0.5) uv += (vec2(valueNoise(frame * 3.0 + time * 0.02), valueNoise(frame * 3.0 + 17.0 - time * 0.02)) - 0.5) * 0.012;
        #endif
        vec3 colour = surfaceColour(uv);
        if (kind == 2.0) {
          if (matteo > 0.5) {
            vec2 spun = mat2(cos(phase), sin(phase), -sin(phase), cos(phase)) * local.xy;
            vec2 capUV = vec2(atan(local.z, spun.x) / (2.0 * PI) + 0.5, 0.5 + asin(clamp(spun.y, -1.0, 1.0)) / PI);
            colour = mix(colour, surfaceColour(capUV), smoothstep(0.8, 0.94, abs(local.z)));
            float intensity = dot(linearColour(colour), vec3(0.2126, 0.7152, 0.0722));
            vec3 emission = mix(vec3(intensity), linearColour(colour), sunPreserveColour);
            float shade = 1.0;
            #ifdef DETAIL
            if (photosphere > 0.5) {
              float cells = smoothstep(2.0, 5.0, discPx / 500.0) * n.z;
              if (cells > 0.001) shade = mix(1.0, granulation(frame * 500.0), cells);
            }
            #endif
            colour = photosphere > 0.5 ? photosphereColour(intensity, n.z, shade) : displayColour(sunColour * emission * 0.82 * (0.96 + 0.04 * n.z));
          } else colour *= 0.96 + 0.04 * n.z;
        } else if (kind == 1.0 && matteo > 0.5) {
          colour = earthMaterial(colour, n, uv);
        } else {
          float day = max(0.0, dot(n, light));
          vec3 night = mix(vec3(dot(colour, vec3(0.2126, 0.7152, 0.0722))), colour, 0.85) * vec3(0.3, 0.32, 0.36);
          colour = colour * day + night * (1.0 - day);
          if (kind == 1.0) colour = mix(colour, vec3(0.23, 0.47, 0.78) * smoothstep(-0.1, 0.3, dot(n, light)), 0.28 * pow(1.0 - n.z, 3.0));
        }
        gl_FragColor = vec4(colour, smoothstep(0.0, edge, 1.0 - sqrt(r2)));
      }
    `);
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    return program;
  }

  prepare() {
    const gl = this.gl;
    if (this.detailProgram && (!this.compilation || gl.getProgramParameter(this.detailProgram, this.compilation.COMPLETION_STATUS_KHR))) {
      if (gl.getProgramParameter(this.detailProgram, gl.LINK_STATUS)) {
        gl.deleteProgram(this.program);
        [this.program, this.ready] = [this.detailProgram, false];
        this.revision++;
      } else gl.deleteProgram(this.detailProgram);
      this.detailProgram = null;
    }
    if (this.ready) return true;
    if (this.compilation && !gl.getProgramParameter(this.program, this.compilation.COMPLETION_STATUS_KHR)) return false;
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
    gl.useProgram(this.program);
    this.buffer ||= gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(this.program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    this.uniforms = Object.fromEntries(["surface", "corona", "clouds", "land", "night", "matteo", "sunColour", "sunPreserveColour", "view", "tilt", "phase", "kind", "edge", "photosphere", "discPx", "time", "light", "window"].map(name => [name, gl.getUniformLocation(this.program, name)]));
    gl.uniform1i(this.uniforms.surface, 0);
    gl.uniform1i(this.uniforms.corona, 1);
    gl.uniform1i(this.uniforms.clouds, 2);
    gl.uniform1i(this.uniforms.land, 3);
    gl.uniform1i(this.uniforms.night, 4);
    this.ready = true;
    return true;
  }

  compile(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  }

  static async decode(source) {
    if (!("createImageBitmap" in window)) {
      const image = new Image();
      image.src = source;
      await image.decode();
      return image;
    }
    const response = await fetch(source);
    if (!response.ok) throw new Error(`${source}: HTTP ${response.status}`);
    return createImageBitmap(await response.blob(), { premultiplyAlpha: "none", colorSpaceConversion: "none" });
  }

  async load(name, source) {
    try {
      this.uploads.push([name, await OrrerySurfaces.decode(source)]);
    } catch {
      delete this.requested[name];
      this.retryAfter[name] = performance.now() / 1000 + 2;
    }
  }

  upload(name, image) {
    if (image.width >= (this.requested[name] || 0)) delete this.requested[name];
    if (image.width <= (this.maps[name]?.width || 0)) return image.close?.();
    const map = { width: image.width, height: image.height };
    if (this.gl) {
      const gl = this.gl;
      if (this.maps[name]) gl.deleteTexture(this.maps[name].texture);
      map.texture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, map.texture);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.generateMipmap(gl.TEXTURE_2D);
    } else {
      const canvas = document.createElement("canvas");
      canvas.width = map.width;
      canvas.height = map.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(image, 0, 0);
      map.pixels = ctx.getImageData(0, 0, map.width, map.height).data;
    }
    image.close?.();
    this.maps[name] = map;
    this.revision++;
  }

  prerender(ctx, bodies, yaw, elevation, dpr) {
    this.drawn = {};
    if (!this.gl || this.pedro) return;
    const resolution = dpr * this.renderScale;
    const items = bodies.map(([name, x, y, radius, light = [-0.35, 0.28, 0.9]]) => ({ name, radius, light, box: OrrerySurfaces.visibleBox(ctx, x, y, radius, 1.25, dpr, resolution) }))
      .filter(({ name, radius, box }) => this.maps[name] && radius > 0 && box && !(name === "sun" && this.customSun))
      .sort((a, b) => b.box.dh - a.box.dh);
    if (!items.length || !this.prepare()) return;
    const limit = Math.max(1024, items[0].box.dw);
    const even = n => n + n % 2 + 2;
    let [left, bottom, row, width] = [0, 0, 0, 0];
    for (const item of items) {
      if (left && left + item.box.dw > limit) [left, bottom, row] = [0, even(bottom + row), 0];
      [item.left, item.bottom] = [left, bottom];
      [left, row] = [even(left + item.box.dw), Math.max(row, item.box.dh)];
      width = Math.max(width, left);
    }
    const size = this.fit.size(this.canvas, { bw: Math.ceil(width / 128) * 128, bh: Math.ceil((bottom + row) / 128) * 128 }, this.clock);
    if (size) [this.canvas.width, this.canvas.height] = size;
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    for (const item of items) this.render(item, yaw, elevation, dpr, resolution);
  }

  render(item, yaw, elevation, dpr, resolution) {
    const { name, radius, light, box } = item;
    if ([name, "system"].includes(this.detailBody)) this.detailRadii[name] = radius * dpr;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), ce = Math.cos(elevation), se = Math.sin(elevation);
    const view = [cy, -sy, 0, sy * se, cy * se, ce, -sy * ce, -cy * ce, se];
    const tilt = this.tilts[name] * Math.PI / 180;
    const phase = this.spinOf(name);
    item.phase = phase;
    this.drawn[name] = item;
    const gl = this.gl;
    gl.viewport(item.left, item.bottom, box.dw, box.dh);
    gl.uniform4fv(this.uniforms.window, box.window);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.maps[name].texture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, (this.maps.corona || this.maps[name]).texture);
    for (const [i, layer] of ["clouds", "land", "night"].entries()) {
      gl.activeTexture(gl.TEXTURE2 + i);
      gl.bindTexture(gl.TEXTURE_2D, (this.maps[layer] || this.maps[name]).texture);
    }
    gl.uniform1f(this.uniforms.matteo, (name === "sun" ? this.matteoSun : this.matteo) ? 1 : 0);
    gl.uniform3fv(this.uniforms.sunColour, this.sunColour);
    gl.uniform1f(this.uniforms.sunPreserveColour, this.sunPreserveColour ? 1 : 0);
    gl.uniformMatrix3fv(this.uniforms.view, false, view);
    gl.uniform1f(this.uniforms.tilt, tilt);
    gl.uniform1f(this.uniforms.phase, phase);
    gl.uniform1f(this.uniforms.kind, name === "earth" ? 1 : name === "sun" ? 2 : 0);
    gl.uniform1f(this.uniforms.edge, 1 / (radius * resolution));
    gl.uniform1f(this.uniforms.photosphere, this.photosphere ? 1 : 0);
    gl.uniform1f(this.uniforms.discPx, radius * resolution);
    gl.uniform1f(this.uniforms.time, this.time);
    gl.uniform3fv(this.uniforms.light, light.map(v => v / Math.hypot(...light)));
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  draw(ctx, name, x, y, radius, yaw, elevation, dpr, light = [-0.35, 0.28, 0.9]) {
    if (name === "sun" && this.customSun) return this.customSun.draw(ctx, x, y, radius, yaw, elevation, dpr, -this.spinOf("sun"));
    if (this.pedro) return this.pedro.draw(ctx, name, x, y, radius, yaw, elevation, dpr, -this.spinOf(name), this.tilts[name] * Math.PI / 180);
    if (!this.maps[name] || radius <= 0) return false;
    const resolution = dpr * this.renderScale;
    if (!this.drawn[name] && !OrrerySurfaces.visibleBox(ctx, x, y, radius, 1.25, dpr, resolution)) return true;
    if (this.gl && !this.prepare()) return false;
    const tilt = this.tilts[name] * Math.PI / 180;
    let phase;
    if (this.gl) {
      if (!this.drawn[name]) this.prerender(ctx, [[name, x, y, radius, light]], yaw, elevation, dpr);
      const { box, left, bottom } = this.drawn[name];
      phase = this.drawn[name].phase;
      ctx.drawImage(this.canvas, left, this.canvas.height - bottom - box.dh, box.dw, box.dh, box.x0, box.y0, box.w, box.h);
    } else {
      if ([name, "system"].includes(this.detailBody)) this.detailRadii[name] = radius * dpr;
      const cy = Math.cos(yaw), sy = Math.sin(yaw), ce = Math.cos(elevation), se = Math.sin(elevation);
      const view = [cy, -sy, 0, sy * se, cy * se, ce, -sy * ce, -cy * ce, se];
      phase = this.spinOf(name);
      this.canvas.width = this.canvas.height = Math.max(16, Math.min(1536, Math.ceil(radius * 2.5 * resolution)));
      this.drawSoftware(name, view, tilt, phase, light);
      ctx.drawImage(this.canvas, x - radius * 1.25, y - radius * 1.25, radius * 2.5, radius * 2.5);
    }
    const flareBox = name === "sun" && this.flares && OrrerySurfaces.visibleBox(ctx, x, y, radius, this.flares.extent, dpr, resolution);
    if (flareBox) this.flares.draw(ctx, flareBox, yaw, elevation, phase, this.apparentRate("sun"), tilt, this.time);
    if (name === "sun" && this.gl && !this.flaresRequested && this.maps.sun.width >= 1024) {
      this.flaresRequested = true;
      requestAnimationFrame(() => setTimeout(() => {
        if (this.photosphere) this.detailProgram = this.initialise(true);
        this.loadFlares(...this.flareOptions);
      }, 0));
    }
    return true;
  }

  surfacePixel(name, lon, lat) {
    const map = this.maps[name];
    const pixel = (u, v) => {
      const x = Math.floor(((u % 1 + 1) % 1) * map.width);
      const y = Math.min(map.height - 1, Math.floor(v * map.height));
      const offset = (y * map.width + x) * 4;
      return [0, 1, 2].map(c => map.pixels[offset + c] / 255);
    };
    const colour = pixel(lon / (Math.PI * 2) + 0.5, 0.5 - lat / Math.PI);
    if (name !== "sun" || !this.matteoSun) return colour;
    const z = Math.sin(lat);
    const cap = pixel(Math.atan2(z, Math.cos(lat) * Math.cos(lon)) / (Math.PI * 2) + 0.5, 0.5 + Math.asin(Math.cos(lat) * Math.sin(lon)) / Math.PI);
    const t = Math.max(0, Math.min(1, (Math.abs(z) - 0.8) / 0.14));
    const weight = t * t * (3 - 2 * t);
    return colour.map((value, c) => value * (1 - weight) + cap[c] * weight);
  }

  static photospherePixel(intensity, mu) {
    const t = Math.min(1, Math.max(0, 0.5 + (intensity - 0.5) * 0.6));
    const heat = Math.min(1, Math.max(0, (0.25 + 0.75 * t) * (1 - 0.75 * (1 - mu ** 0.55))));
    const smooth = (a, b, v) => { const k = Math.min(1, Math.max(0, (v - a) / (b - a))); return k * k * (3 - 2 * k); };
    const [edge, mid, core] = [[0.55, 0.07, 0.01], [0.95, 0.28, 0.04], [1, 0.66, 0.26]];
    const [from, to, k] = heat < 0.5 ? [edge, mid, smooth(0.05, 0.5, heat)] : [mid, core, smooth(0.5, 0.95, heat)];
    return from.map((value, c) => (value + (to[c] - value) * k) * heat * 1.4);
  }

  drawSoftware(name, view, tilt, phase, light) {
    const size = Math.min(256, this.canvas.width);
    this.canvas.width = this.canvas.height = size;
    const ctx = this.canvas.getContext("2d");
    const image = ctx.createImageData(size, size);
    const toLinear = value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    const toDisplay = value => value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
    const sunlight = light.map(v => v / Math.hypot(...light));
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = ((x + 0.5) / size * 2 - 1) * 1.25;
        const ny = (1 - (y + 0.5) / size * 2) * 1.25;
        const r2 = nx * nx + ny * ny;
        if (r2 >= 1) continue;
        const nz = Math.sqrt(1 - r2);
        const wx = view[0] * nx + view[3] * ny + view[6] * nz;
        const wy = view[1] * nx + view[4] * ny + view[7] * nz;
        const wz = view[2] * nx + view[5] * ny + view[8] * nz;
        const lon = Math.atan2(wy * Math.cos(tilt) - wz * Math.sin(tilt), wx) + phase;
        const lat = Math.asin(wy * Math.sin(tilt) + wz * Math.cos(tilt));
        const colour = this.surfacePixel(name, lon, lat);
        const target = (y * size + x) * 4;
        const intensity = [0.2126, 0.7152, 0.0722].reduce((sum, weight, c) => sum + weight * toLinear(colour[c]), 0);
        let pixel;
        if (name === "sun" && this.matteoSun && this.photosphere) pixel = OrrerySurfaces.photospherePixel(intensity, nz).map(toDisplay);
        else if (name === "sun" && this.matteoSun) pixel = colour.map((value, c) => toDisplay((this.sunPreserveColour ? toLinear(value) : intensity) * 0.82 * (0.96 + 0.04 * nz) * this.sunColour[c]));
        else if (name === "sun") pixel = colour.map(value => value * (0.96 + 0.04 * nz));
        else {
          const day = Math.max(0, sunlight[0] * nx + sunlight[1] * ny + sunlight[2] * nz);
          const grey = 0.2126 * colour[0] + 0.7152 * colour[1] + 0.0722 * colour[2];
          pixel = colour.map((value, c) => value * day + (grey + (value - grey) * 0.85) * [0.3, 0.32, 0.36][c] * (1 - day));
        }
        for (let c = 0; c < 3; c++) image.data[target + c] = 255 * pixel[c];
        image.data[target + 3] = Math.min(255, (1 - r2) * size * 255);
      }
    }
    ctx.putImageData(image, 0, 0);
  }
}
