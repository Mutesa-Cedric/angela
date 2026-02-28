import * as THREE from "three";

const SKY_VERTEX_SHADER = `
varying vec3 vWorldDir;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldDir = normalize(worldPos.xyz - cameraPosition);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAGMENT_SHADER = `
uniform float uTime;
uniform float uPitch;
varying vec3 vWorldDir;

float hash3(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}

float starField(vec3 dir) {
  vec3 p = floor(dir * 290.0);
  float s1 = smoothstep(0.9974, 1.0, hash3(p));
  float s2 = 0.45 * smoothstep(0.9988, 1.0, hash3(p * 1.93 + 17.0));
  float twinkle = 0.6 + 0.4 * sin(uTime * 0.45 + hash3(p) * 31.0);
  float zenith = smoothstep(0.08, 0.95, dir.y * 0.5 + 0.5);
  return (s1 + s2) * twinkle * zenith;
}

void main() {
  vec3 dir = normalize(vWorldDir);
  float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);

  vec3 bottom = mix(vec3(0.010, 0.012, 0.028), vec3(0.015, 0.020, 0.036), uPitch);
  vec3 mid = mix(vec3(0.022, 0.040, 0.082), vec3(0.036, 0.062, 0.115), uPitch);
  vec3 top = mix(vec3(0.012, 0.060, 0.130), vec3(0.032, 0.090, 0.180), uPitch);

  vec3 color = mix(bottom, mid, smoothstep(0.02, 0.50, h));
  color = mix(color, top, smoothstep(0.45, 1.00, h));

  float auroraWave = sin(dir.x * 8.0 + uTime * 0.05) * 0.028 + cos(dir.z * 10.0 - uTime * 0.03) * 0.02;
  float auroraMask = smoothstep(0.24, 0.0, abs(dir.y - 0.2 - auroraWave));
  vec3 auroraColor = mix(vec3(0.030, 0.150, 0.200), vec3(0.050, 0.210, 0.260), uPitch);
  color += auroraColor * auroraMask * 0.55;

  float stars = starField(dir);
  vec3 starColor = mix(vec3(0.70, 0.78, 0.90), vec3(0.85, 0.92, 1.00), uPitch);
  color += starColor * stars;

  float horizonGlow = smoothstep(0.30, 0.02, abs(h - 0.48));
  color += vec3(0.02, 0.03, 0.05) * horizonGlow * (0.45 + 0.35 * uPitch);

  gl_FragColor = vec4(color, 1.0);
}
`;

export class SkyboxLayer {
  private readonly scene: THREE.Scene;
  private mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private cubeTexture: THREE.CubeTexture | null = null;
  private uniforms: {
    uTime: { value: number };
    uPitch: { value: number };
  };

  constructor(
    scene: THREE.Scene,
    options?: {
      faces?: readonly [string, string, string, string, string, string];
    },
  ) {
    this.scene = scene;
    this.uniforms = {
      uTime: { value: 0 },
      uPitch: { value: 0 },
    };

    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: SKY_VERTEX_SHADER,
      fragmentShader: SKY_FRAGMENT_SHADER,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    });
    const geometry = new THREE.SphereGeometry(460, 48, 28);
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.renderOrder = -999;
    scene.add(this.mesh);

    if (options?.faces) {
      this.loadCubeSkybox(options.faces);
    }
  }

  private loadCubeSkybox(faces: readonly [string, string, string, string, string, string]): void {
    const loader = new THREE.CubeTextureLoader();
    loader.load(
      faces,
      (cubeTexture) => {
        cubeTexture.colorSpace = THREE.SRGBColorSpace;
        this.cubeTexture = cubeTexture;
        this.scene.background = cubeTexture;
        this.scene.backgroundIntensity = 0.82;
        this.scene.backgroundBlurriness = 0.035;
        this.mesh.visible = false;
      },
      undefined,
      () => {
        this.cubeTexture = null;
        this.scene.background = null;
        this.scene.backgroundIntensity = 1;
        this.scene.backgroundBlurriness = 0;
        this.mesh.visible = true;
      },
    );
  }

  tick(dt: number): void {
    if (!this.mesh.visible) return;
    this.uniforms.uTime.value += dt;
  }

  setPitchMode(enabled: boolean): void {
    this.uniforms.uPitch.value = enabled ? 1 : 0;
    if (this.cubeTexture) {
      this.scene.backgroundBlurriness = enabled ? 0.025 : 0.045;
      this.scene.backgroundIntensity = enabled ? 0.9 : 0.78;
    }
  }
}
