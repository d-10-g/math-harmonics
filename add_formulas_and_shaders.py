import json

new_formulas = [
    {"id": f"{i+21}", "name": f"Harmonic Pattern {i+1}", "x": f"sin({i%5+1} * p + t) * cos(p)", "y": f"cos({i%7+1} * p + t) * sin(p)", "description": "Auto-generated harmonic variation."} for i in range(30)
]

# Specifically naming some cool ones
names = [
    "Golden Spiral", "Quantum String", "Magnetic Field", "Pulsar Beam", "Orbital Decay",
    "Torus Knot 3,8", "Chladni Plate", "Lorentz Attractor (2D)", "Strange Loop", "Harmonic Oscillator",
    "Mobius Strip Edge", "Event Horizon", "Synapse Spark", "Gravitational Wave", "Bessel Function",
    "String Theory", "Electron Cloud", "Supernova Core", "Stellar Nursery", "Wormhole Geometry",
    "Navier-Stokes Flow", "Fibonacci Sequence", "Schrodinger Wave", "Plasma Toroid", "Fusion Core",
    "Mandelbrot Edge", "Julia Set Orbit", "Chaos Attractor", "Dark Matter Halo", "Fractal Canopy"
]

for i in range(30):
    new_formulas[i]["name"] = names[i]

# Add more variety to the math
import random
random.seed(42)
for i in range(30):
    a = random.randint(1, 9)
    b = random.randint(1, 9)
    c = random.randint(1, 5)
    new_formulas[i]["x"] = f"sin({a} * p + t) * (1 + 0.5 * cos({c} * p))"
    new_formulas[i]["y"] = f"cos({b} * p + t) * (1 + 0.5 * sin({c} * p))"

# Update constants.ts
with open('src/constants.ts', 'r') as f:
    content = f.read()

# Replace the closing bracket of the array
array_end_idx = content.rfind('];')
new_formulas_str = ""
for f in new_formulas:
    new_formulas_str += f",\n  {{\n    id: \"{f['id']}\",\n    name: \"{f['name']}\",\n    x: \"{f['x']}\",\n    y: \"{f['y']}\",\n    description: \"{f['description']}\"\n  }}"

content = content[:array_end_idx] + new_formulas_str + "\n" + content[array_end_idx:]

with open('src/constants.ts', 'w') as f:
    f.write(content)

# Now shaders
new_shaders = []

# Shader 21: Liquid Metal
new_shaders.append({
    "id": "s21", "name": "Liquid Metal", "description": "Smooth chrome reflection.",
    "fragmentShader": """
      uniform float time;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);
        vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
        
        // Ambient + Diffuse
        float diff = max(dot(normal, lightDir), 0.0);
        
        // Specular (Chrome-like)
        vec3 reflectDir = reflect(-lightDir, normal);
        float spec = pow(max(dot(viewDir, reflectDir), 0.0), 64.0);
        
        // Fake environment reflection using normal
        vec3 env = vec3(0.5, 0.6, 0.8) * (normal.y * 0.5 + 0.5);
        
        vec3 color = env * 0.5 + vec3(0.9) * diff * 0.3 + vec3(1.0) * spec;
        gl_FragColor = vec4(color, 1.0);
      }
    """
})

# Shader 22: Frosted Glass
new_shaders.append({
    "id": "s22", "name": "Frosted Glass", "description": "Refractive translucent glass.",
    "fragmentShader": """
      uniform float time;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);
        
        // Fresnel effect for glass rim
        float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);
        
        vec3 baseColor = vec3(0.8, 0.9, 0.9);
        vec3 color = baseColor * (1.0 - fresnel) + vec3(1.0) * fresnel;
        
        gl_FragColor = vec4(color, 0.4 + fresnel * 0.6);
      }
    """
})

# Shader 23: Obsidian
new_shaders.append({
    "id": "s23", "name": "Obsidian", "description": "Dark glossy stone.",
    "fragmentShader": """
      uniform float time;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);
        vec3 lightDir = normalize(vec3(-1.0, 1.0, 0.5));
        
        float diff = max(dot(normal, lightDir), 0.0);
        vec3 reflectDir = reflect(-lightDir, normal);
        float spec = pow(max(dot(viewDir, reflectDir), 0.0), 128.0);
        
        vec3 color = vec3(0.05, 0.05, 0.06) + vec3(1.0) * spec;
        gl_FragColor = vec4(color, 1.0);
      }
    """
})

# Shader 24: Hologram
new_shaders.append({
    "id": "s24", "name": "Hologram", "description": "Sci-fi scanning hologram.",
    "fragmentShader": """
      uniform float time;
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec3 vViewPosition;
      void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);
        
        float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.0);
        float scanline = sin(vPosition.y * 50.0 - time * 10.0) * 0.5 + 0.5;
        
        vec3 color = vec3(0.0, 0.8, 1.0) * fresnel * scanline;
        gl_FragColor = vec4(color, fresnel);
      }
    """
})

# Add 26 more generic but cool shaders to hit 50
shader_names = [
    "Pearl", "Carbon Fiber", "Lava Flow", "Ice Crystal", "Emerald", "Ruby Core", "Amethyst",
    "Copper", "Brushed Steel", "Anodized Titanium", "Iridescent Soap", "Quantum Foam",
    "Ectoplasm", "Stardust", "Aura Field", "Prismatic", "Dark Energy", "Antimatter",
    "Chrome Shift", "Neon Wire", "Ghost Shell", "Dragon Scale", "Alien Skin", "Abyssal Glow",
    "Bismuth Crystal", "Void Matter"
]

for i, name in enumerate(shader_names):
    new_shaders.append({
        "id": f"s{i+25}", "name": name, "description": f"Auto-generated {name.lower()} material.",
        "fragmentShader": f"""
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vPosition;
          varying vec3 vViewPosition;
          void main() {{
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float f = pow(1.0 - max(dot(n, v), 0.0), {1.0 + (i%5)});
            vec3 c = vec3({(i*0.1)%1.0}, {(i*0.2)%1.0}, {(i*0.3)%1.0}) + f * 0.5;
            gl_FragColor = vec4(c, 1.0);
          }}
        """
    })

# Update shaders.ts
with open('src/shaders.ts', 'r') as f:
    content = f.read()

# Replace DEFAULT_VERTEX_SHADER
old_vs = "export const DEFAULT_VERTEX_SHADER = `\\n  varying vec2 vUv;\\n  varying vec3 vPosition;\\n  void main() {\\n    vUv = uv;\\n    vPosition = position;\\n    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\\n  }\\n`;"
new_vs = "export const DEFAULT_VERTEX_SHADER = `\\n  varying vec2 vUv;\\n  varying vec3 vPosition;\\n  varying vec3 vNormal;\\n  varying vec3 vViewPosition;\\n  void main() {\\n    vUv = uv;\\n    vPosition = position;\\n    vNormal = normalize(normalMatrix * normal);\\n    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);\\n    vViewPosition = -mvPosition.xyz;\\n    gl_Position = projectionMatrix * mvPosition;\\n  }\\n`;"
content = content.replace(old_vs, new_vs)

array_end_idx = content.rfind('];')
new_shaders_str = ""
for s in new_shaders:
    new_shaders_str += f",\n  {{\n    id: \"{s['id']}\",\n    name: \"{s['name']}\",\n    fragmentShader: `{s['fragmentShader']}`,\n    description: \"{s['description']}\"\n  }}"

content = content[:array_end_idx] + new_shaders_str + "\n" + content[array_end_idx:]

with open('src/shaders.ts', 'w') as f:
    f.write(content)

