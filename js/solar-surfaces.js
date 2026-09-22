class OrrerySurfaces {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.gl = this.canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false });
    this.maps = {};
    this.phase = 0;
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
    if (new URLSearchParams(location.search).get("materials") === "pedro") this.loadPedro();
    if (new URLSearchParams(location.search).get("sun") === "custom") this.loadCustomSun();
    if (this.gl) this.loadFlares(materials, sun);
    this.tilts = { sun: 56, mercury: 0.03, venus: 177.4, earth: 23.44, mars: 25.19, jupiter: 3.13, saturn: 26.73, uranus: 97.77, neptune: 28.32 };
    if (this.gl) this.initialise();
    for (const name of Object.keys(this.tilts)) {
      const useMatteo = name === "sun" ? this.matteoSun : name === "earth" && this.matteo;
      const file = useMatteo ? `matteo/${name}` : name === "sun" ? "sun-global" : name;
      this.load(name, `assets/planets/textures/${file}.jpg?v=20260922-material`);
    }
    this.load("corona", "assets/planets/textures/sun-sdo.jpg");
    if (this.matteo) {
      for (const name of ["clouds", "land", "night"]) this.load(name, `assets/planets/textures/matteo/${name}.jpg`);
    }
  }

  async loadFlares(materials, sun) {
    if (!this.matteoSun || sun === "custom" || materials === "pedro" || new URLSearchParams(location.search).get("flares") === "off") return;
    try {
      const { SolarFlares } = await import("./solar-flares.js?v=20260922-plasma-volume");
      this.flares = new SolarFlares();
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

  initialise() {
    const gl = this.gl;
    const vertex = this.compile(gl.VERTEX_SHADER, `
      attribute vec2 position;
      varying vec2 point;
      void main() {
        point = position * 1.25;
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `);
    const gradients = gl.getExtension("OES_standard_derivatives") && gl.getExtension("EXT_shader_texture_lod");
    const fragment = this.compile(gl.FRAGMENT_SHADER, `
      ${gradients ? "#extension GL_OES_standard_derivatives : enable\n#extension GL_EXT_shader_texture_lod : enable" : ""}
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
      const float PI = 3.14159265359;
      vec3 linearColour(vec3 colour) {
        return mix(pow((colour + 0.055) / 1.055, vec3(2.4)), colour / 12.92, step(colour, vec3(0.04045)));
      }
      vec3 displayColour(vec3 colour) {
        return mix(1.055 * pow(colour, vec3(1.0 / 2.4)) - 0.055, colour * 12.92, step(colour, vec3(0.0031308)));
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
        vec3 light = normalize(vec3(-0.8, 0.3, 0.65));
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
            float a = 0.28 * exp(-(sqrt(r2) - 1.0) * 130.0);
            gl_FragColor = vec4(0.22, 0.48, 0.92, a);
          } else gl_FragColor = vec4(0.0);
          return;
        }
        vec3 n = vec3(point, sqrt(1.0 - r2));
        vec3 world = view * n;
        vec3 local = vec3(world.x, world.y * cos(tilt) - world.z * sin(tilt), world.y * sin(tilt) + world.z * cos(tilt));
        vec2 uv = vec2(fract(atan(local.y, local.x) / (2.0 * PI) + 0.5 + phase / (2.0 * PI)), 0.5 - asin(clamp(local.z, -1.0, 1.0)) / PI);
        ${gradients ? `
          vec2 dx = dFdx(uv), dy = dFdy(uv);
          dx.x -= floor(dx.x + 0.5);
          dy.x -= floor(dy.x + 0.5);
          vec3 colour = texture2DGradEXT(surface, uv, dx, dy).rgb;
        ` : "vec3 colour = texture2D(surface, uv).rgb;"}
        if (kind == 2.0) {
          if (matteo > 0.5) {
            float intensity = dot(linearColour(colour), vec3(0.2126, 0.7152, 0.0722));
            vec3 emission = mix(vec3(intensity), linearColour(colour), sunPreserveColour);
            colour = displayColour(sunColour * emission * 0.82 * (0.96 + 0.04 * n.z));
          } else colour *= 0.96 + 0.04 * n.z;
        } else if (kind == 1.0 && matteo > 0.5) {
          colour = earthMaterial(colour, n, uv);
        } else {
          float light = 0.36 + 0.64 * max(0.0, dot(n, normalize(vec3(-0.35, 0.28, 0.9))));
          colour *= light;
          if (kind == 1.0) colour = mix(colour, vec3(0.23, 0.47, 0.78), 0.28 * pow(1.0 - n.z, 3.0));
        }
        gl_FragColor = vec4(colour, smoothstep(0.0, edge, 1.0 - sqrt(r2)));
      }
    `);
    this.program = gl.createProgram();
    gl.attachShader(this.program, vertex);
    gl.attachShader(this.program, fragment);
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    gl.useProgram(this.program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(this.program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    this.uniforms = Object.fromEntries(["surface", "corona", "clouds", "land", "night", "matteo", "sunColour", "sunPreserveColour", "view", "tilt", "phase", "kind", "edge"].map(name => [name, gl.getUniformLocation(this.program, name)]));
    gl.uniform1i(this.uniforms.surface, 0);
    gl.uniform1i(this.uniforms.corona, 1);
    gl.uniform1i(this.uniforms.clouds, 2);
    gl.uniform1i(this.uniforms.land, 3);
    gl.uniform1i(this.uniforms.night, 4);
  }

  compile(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }

  load(name, source) {
    const image = new Image();
    image.addEventListener("load", () => {
      const map = { width: image.naturalWidth, height: image.naturalHeight };
      if (this.gl) {
        const gl = this.gl;
        map.texture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, map.texture);
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
      this.maps[name] = map;
    });
    image.src = source;
  }

  draw(ctx, name, x, y, radius, yaw, elevation, dpr) {
    if (name === "sun" && this.customSun) return this.customSun.draw(ctx, x, y, radius, yaw, elevation, dpr, this.phase * 0.3);
    if (this.pedro) return this.pedro.draw(ctx, name, x, y, radius, yaw, elevation, dpr, this.phase * (name === "sun" ? 0.3 : 1), this.tilts[name] * Math.PI / 180);
    if (!this.maps[name] || radius <= 0) return false;
    const size = Math.max(16, Math.min(1536, Math.ceil(radius * 2.5 * dpr)));
    if (this.canvas.width !== size) this.canvas.width = this.canvas.height = size;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), ce = Math.cos(elevation), se = Math.sin(elevation);
    const view = [cy, -sy, 0, sy * se, cy * se, ce, -sy * ce, -cy * ce, se];
    const tilt = this.tilts[name] * Math.PI / 180;
    const phase = this.phase * (name === "sun" ? 0.3 : 1);
    if (this.gl) {
      const gl = this.gl;
      gl.viewport(0, 0, size, size);
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
      gl.uniform1f(this.uniforms.edge, 1.25 / size);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    } else this.drawSoftware(name, view, tilt, phase);
    ctx.drawImage(this.canvas, x - radius * 1.25, y - radius * 1.25, radius * 2.5, radius * 2.5);
    if (name === "sun" && this.flares) this.flares.draw(ctx, x, y, radius, yaw, elevation, dpr, phase, tilt);
    return true;
  }

  drawSoftware(name, view, tilt, phase) {
    const size = Math.min(256, this.canvas.width);
    this.canvas.width = this.canvas.height = size;
    const ctx = this.canvas.getContext("2d");
    const image = ctx.createImageData(size, size);
    const map = this.maps[name];
    const w = map.width, h = map.height;
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
        const u = ((lon / (Math.PI * 2) + 0.5) % 1 + 1) % 1;
        const v = 0.5 - lat / Math.PI;
        const source = (Math.min(h - 1, Math.floor(v * h)) * w + Math.floor(u * w)) * 4;
        const target = (y * size + x) * 4;
        const light = 0.36 + 0.64 * Math.max(0, -0.35 * nx + 0.28 * ny + 0.9 * nz);
        const solar = name === "sun" && this.matteoSun;
        const intensity = solar ? [0.2126, 0.7152, 0.0722].reduce((sum, weight, c) => {
          const value = map.pixels[source + c] / 255;
          return sum + weight * (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
        }, 0) * 0.82 * (0.96 + 0.04 * nz) : 0;
        for (let c = 0; c < 3; c++) {
          const value = map.pixels[source + c] / 255;
          const linear = value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
          const emission = this.sunPreserveColour ? linear * 0.82 * (0.96 + 0.04 * nz) : intensity;
          const channel = emission * this.sunColour[c];
          const display = channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
          image.data[target + c] = 255 * (solar ? display : name === "sun" ? value * (0.96 + 0.04 * nz) : value * light);
        }
        image.data[target + 3] = Math.min(255, (1 - r2) * size * 255);
      }
    }
    ctx.putImageData(image, 0, 0);
  }
}
