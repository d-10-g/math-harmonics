import json
import random

new_formulas = []
prefixes = ["Hyper", "Quantum", "Astral", "Void", "Chrono", "Neo", "Cosmic", "Plasma", "Aether", "Stellar", "Flux", "Nexus", "Singularity", "Tachyon", "Orbital", "Fractal", "Harmonic", "Resonant", "Phase", "Echo"]
suffixes = ["Attractor", "Locus", "Knot", "Torus", "Helix", "Spiral", "Wave", "Manifold", "Matrix", "Lattice", "Web", "Field", "Burst", "Pulse", "Core", "Drift", "Flux", "Engine", "Drive", "Shift"]

random.seed(420)
for i in range(100):
    name = f"{random.choice(prefixes)} {random.choice(suffixes)}"
    a = random.randint(1, 20)
    b = random.randint(1, 20)
    c = random.randint(1, 10)
    d = random.uniform(0.1, 3.0)
    
    if i % 4 == 0:
        x = f"sin({a} * p + t) * exp(cos({c} * p)) * {d:.1f}"
        y = f"cos({b} * p + t) * exp(sin({c} * p)) * {d:.1f}"
    elif i % 4 == 1:
        x = f"p * sin({a} * p) + {d:.1f} * cos(t * {c})"
        y = f"p * cos({b} * p) + {d:.1f} * sin(t * {c})"
    elif i % 4 == 2:
        x = f"sin({a} * p + t) + {d:.1f} * sin({b} * p + t*2)"
        y = f"cos({c} * p + t) + {d:.1f} * cos({a} * p + t*2)"
    else:
        x = f"tan(sin({a}*p)) * cos(t) * {d:.1f}"
        y = f"tan(cos({b}*p)) * sin(t) * {d:.1f}"
        
    new_formulas.append({
        "id": f"{101 + i}",
        "name": f"{name} {i}",
        "x": x,
        "y": y,
        "description": f"Auto-generated {name.lower()} mathematical sequence."
    })

with open('src/constants.ts', 'r') as f:
    content = f.read()
array_end_idx = content.rfind('];')
new_formulas_str = "".join([f",\n  {{\n    id: \"{f['id']}\",\n    name: \"{f['name']}\",\n    x: \"{f['x']}\",\n    y: \"{f['y']}\",\n    description: \"{f['description']}\"\n  }}" for f in new_formulas])
content = content[:array_end_idx] + new_formulas_str + "\n" + content[array_end_idx:]
with open('src/constants.ts', 'w') as f:
    f.write(content)

new_shaders = []
s_prefixes = ["Liquid", "Frosted", "Glowing", "Dark", "Neon", "Radiant", "Corrupted", "Holographic", "Iridescent", "Matte", "Glossy", "Reflective", "Emissive", "Crystalline", "Metallic"]
s_materials = ["Gold", "Silver", "Copper", "Iron", "Titanium", "Glass", "Obsidian", "Ruby", "Sapphire", "Emerald", "Amethyst", "Opal", "Pearl", "Carbon", "Silicon"]

for i in range(100):
    name = f"{random.choice(s_prefixes)} {random.choice(s_materials)}"
    
    style = random.randint(0, 2)
    if style == 0:
        shader_body = f"""
          uniform float time;
          varying vec3 vNormal; varying vec3 vViewPosition;
          void main() {{
            vec3 n = normalize(vNormal); vec3 v = normalize(vViewPosition);
            float fresnel = pow(1.0 - max(dot(n, v), 0.0), {random.randint(1,5)}.0);
            vec3 color = vec3({random.random():.2f}, {random.random():.2f}, {random.random():.2f});
            gl_FragColor = vec4(mix(color, vec3(1.0), fresnel), {random.uniform(0.3, 0.9):.2f});
          }}
        """
    elif style == 1:
        shader_body = f"""
          uniform float time;
          varying vec3 vNormal; varying vec3 vPosition;
          void main() {{
            vec3 n = normalize(vNormal);
            float pulse = sin(time * {random.randint(2,8)}.0 + vPosition.x * {random.randint(2,10)}.0) * 0.5 + 0.5;
            vec3 color = vec3({random.random():.2f}, {random.random():.2f}, {random.random():.2f});
            gl_FragColor = vec4(color * (1.0 + pulse * {random.uniform(0.5, 2.0):.2f}), 1.0);
          }}
        """
    else:
        shader_body = f"""
          uniform float time;
          varying vec3 vNormal; varying vec3 vViewPosition;
          void main() {{
            vec3 n = normalize(vNormal); vec3 v = normalize(vViewPosition);
            float diff = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
            float iridescence = dot(n, v);
            vec3 color = vec3(
              sin(iridescence * {random.randint(1,6)}.0 + time * {random.uniform(0.1, 1.0):.2f}),
              cos(iridescence * {random.randint(1,6)}.0 + time * {random.uniform(0.1, 1.0):.2f}),
              sin(iridescence * {random.randint(1,6)}.0 + time * {random.uniform(0.1, 1.0):.2f})
            ) * 0.5 + 0.5;
            gl_FragColor = vec4(color * diff + vec3(pow(max(dot(v, reflect(-normalize(vec3(1.0, 1.0, 1.0)), n)), 0.0), {random.randint(16, 128)}.0)), 1.0);
          }}
        """
        
    new_shaders.append({
        "id": f"s{101 + i}",
        "name": f"{name} {i}",
        "fragmentShader": shader_body,
        "description": f"Generated {name.lower()}."
    })

with open('src/shaders.ts', 'r') as f:
    content = f.read()
array_end_idx = content.rfind('];')
new_shaders_str = "".join([f",\n  {{\n    id: \"{s['id']}\",\n    name: \"{s['name']}\",\n    fragmentShader: `{s['fragmentShader']}`,\n    description: \"{s['description']}\"\n  }}" for s in new_shaders])
content = content[:array_end_idx] + new_shaders_str + "\n" + content[array_end_idx:]
with open('src/shaders.ts', 'w') as f:
    f.write(content)

