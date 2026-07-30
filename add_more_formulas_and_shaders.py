import json

new_formulas = []
formula_names = [
    "Quantum Foam Orbit", "Magnetic Flux", "Graviton Spiral", "Singularity Event",
    "Tachyon Trail", "Neutrino Oscillation", "Plasma Filament", "Solar Corona",
    "Pulsar Binary", "Superstring Loop", "Dark Energy Expansion", "Hawking Radiation",
    "Warp Bubble", "Einstein-Rosen Bridge", "Chronosphere", "Hyperspace Jump",
    "Event Horizon Flare", "Cosmic Microwave", "Quasar Jet", "Nebular Web",
    "Bose-Einstein Condensate", "Fermion Path", "Boson Field", "Hadron Collider",
    "Higgs Mechanism", "Gluon Mesh", "Photon Trajectory", "Strange Quark",
    "Charm Quark", "Top Quark", "Bottom Quark", "Up Quark", "Down Quark",
    "Antimatter Annihilation", "Positron Spiral", "Muon Decay", "Tau Lepton",
    "Pion Exchange", "Kaon Oscillation", "J/psi Meson", "Upsilon Particle",
    "W Boson Interaction", "Z Boson Decay", "Sterile Neutrino", "Dark Matter Web",
    "Axion Field", "WIMP Collision", "MACHOS Orbit", "Monopole Defect", "Cosmic String"
]

import random
random.seed(99)
for i, name in enumerate(formula_names):
    a = random.randint(1, 15)
    b = random.randint(1, 15)
    c = random.randint(1, 8)
    d = random.uniform(0.1, 2.0)
    
    # Generate increasingly complex formulas
    if i % 3 == 0:
        x = f"sin({a} * p + t) * exp(cos({c} * p))"
        y = f"cos({b} * p + t) * exp(sin({c} * p))"
    elif i % 3 == 1:
        x = f"p * sin({a} * p) + {d:.1f} * cos(t)"
        y = f"p * cos({b} * p) + {d:.1f} * sin(t)"
    else:
        x = f"sin({a} * p + t) + 0.5 * sin({b} * p + t*2)"
        y = f"cos({c} * p + t) + 0.5 * cos({a} * p + t*2)"
        
    new_formulas.append({
        "id": f"{51 + i}",
        "name": name,
        "x": x,
        "y": y,
        "description": f"Complex {name.lower()} mathematical simulation."
    })

# Update constants.ts
with open('src/constants.ts', 'r') as f:
    content = f.read()

array_end_idx = content.rfind('];')
new_formulas_str = ""
for f in new_formulas:
    new_formulas_str += f",\n  {{\n    id: \"{f['id']}\",\n    name: \"{f['name']}\",\n    x: \"{f['x']}\",\n    y: \"{f['y']}\",\n    description: \"{f['description']}\"\n  }}"

content = content[:array_end_idx] + new_formulas_str + "\n" + content[array_end_idx:]

with open('src/constants.ts', 'w') as f:
    f.write(content)

# Now generate 50 new shaders
new_shaders = []
shader_names = [
    "Titanium Alloy", "Brushed Aluminum", "Polished Brass", "Oxidized Copper",
    "Rusty Iron", "Galvanized Steel", "Mercury", "Gold Foil", "Silver Mirror",
    "Platinum", "Tungsten", "Cobalt Blue", "Ruby Red", "Emerald Green",
    "Sapphire", "Topaz", "Opal", "Pearlescent White", "Iridescent Black",
    "Rainbow Soap", "Oil Spill", "Bismuth", "Holographic Foil", "Neon Cyan",
    "Neon Magenta", "Neon Yellow", "Radioactive Green", "Lava Hot", "Magma",
    "Plasma Hot", "Ice Cold", "Glacier Blue", "Frostbite", "Crystal Clear",
    "Stained Glass", "Tinted Window", "Milky Glass", "Sea Glass", "Amber",
    "Jade", "Turquoise", "Lapis Lazuli", "Malachite", "Quartz", "Amethyst Deep",
    "Rose Quartz", "Obsidian Black", "Diamond Brilliant", "Moonstone", "Sunstone"
]

for i, name in enumerate(shader_names):
    # Determine shader style based on name/index
    if "Glass" in name or "Crystal" in name or "Diamond" in name or "Ice" in name:
        # Refractive/Glassy
        shader_body = f"""
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {{
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float fresnel = pow(1.0 - max(dot(n, v), 0.0), 2.0 + {i%3}.0);
            vec3 baseColor = vec3({random.random():.2f}, {random.random():.2f}, {random.random():.2f});
            gl_FragColor = vec4(mix(baseColor, vec3(1.0), fresnel), 0.3 + fresnel * 0.7);
          }}
        """
    elif "Neon" in name or "Radioactive" in name or "Plasma" in name:
        # Emissive/Glowing
        shader_body = f"""
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vPosition;
          void main() {{
            vec3 n = normalize(vNormal);
            float pulse = sin(time * 3.0 + vPosition.x * 5.0) * 0.5 + 0.5;
            vec3 glowColor = vec3({random.random():.2f}, {random.random():.2f}, {random.random():.2f});
            gl_FragColor = vec4(glowColor * (1.0 + pulse), 1.0);
          }}
        """
    else:
        # Metallic/Iridescent
        shader_body = f"""
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {{
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float diff = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
            vec3 reflectDir = reflect(-normalize(vec3(1.0, 1.0, 1.0)), n);
            float spec = pow(max(dot(v, reflectDir), 0.0), {32.0 + (i*8)%128});
            float iridescence = dot(n, v);
            vec3 color = vec3(
              sin(iridescence * {i%5+1}.0 + {random.random():.2f}),
              cos(iridescence * {i%4+1}.0 + {random.random():.2f}),
              sin(iridescence * {i%3+1}.0 + {random.random():.2f})
            ) * 0.5 + 0.5;
            gl_FragColor = vec4(color * diff + vec3(spec), 1.0);
          }}
        """
        
    new_shaders.append({
        "id": f"s{51 + i}",
        "name": name,
        "description": f"Procedural {name.lower()} material simulation.",
        "fragmentShader": shader_body
    })

# Update shaders.ts
with open('src/shaders.ts', 'r') as f:
    content = f.read()

array_end_idx = content.rfind('];')
new_shaders_str = ""
for s in new_shaders:
    new_shaders_str += f",\n  {{\n    id: \"{s['id']}\",\n    name: \"{s['name']}\",\n    fragmentShader: `{s['fragmentShader']}`,\n    description: \"{s['description']}\"\n  }}"

content = content[:array_end_idx] + new_shaders_str + "\n" + content[array_end_idx:]

with open('src/shaders.ts', 'w') as f:
    f.write(content)

