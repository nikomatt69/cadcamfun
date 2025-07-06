// src/lib/canvas/ThreeJSUpscaler.ts
import * as THREE from "three";

export interface UpscalerOptions {
  scaleFactor: number;
  useEdgeDetection: boolean;
  enableFSR: boolean;
  adaptiveQuality: boolean;
  debugMode?: boolean;
}

export class ThreeJSUpscaler {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private options: UpscalerOptions;
  private lowResTarget: THREE.WebGLRenderTarget | null = null;
  private highResTarget: THREE.WebGLRenderTarget | null = null;
  private upscaleMaterial: THREE.ShaderMaterial | null = null;
  private fsrMaterial: THREE.ShaderMaterial | null = null;
  private screenQuad: THREE.Mesh | null = null;
  private orthographicCamera: THREE.OrthographicCamera | null = null;
  private isInitialized = false;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    options: Partial<UpscalerOptions> = {}
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    this.options = {
      scaleFactor: 1.5,
      useEdgeDetection: true,
      enableFSR: true,
      adaptiveQuality: true,
      debugMode: false,
      ...options
    };

    this.initRenderTargets();
    this.initShaders();
    this.initScreenQuad();
    this.isInitialized = true;
  }

  private initRenderTargets(): void {
    const size = this.renderer.getSize(new THREE.Vector2());
    const width = Math.floor(size.x / this.options.scaleFactor);
    const height = Math.floor(size.y / this.options.scaleFactor);

    const renderTargetParams = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      stencilBuffer: false,
      type: THREE.UnsignedByteType
    };

    this.lowResTarget = new THREE.WebGLRenderTarget(width, height, renderTargetParams);
    this.highResTarget = new THREE.WebGLRenderTarget(size.x, size.y, renderTargetParams);
  }

  private initShaders(): void {
    // FSR-like upscaling vertex shader
    const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    // FSR-like upscaling fragment shader with edge detection
    const fragmentShader = `
      uniform sampler2D tDiffuse;
      uniform vec2 resolution;
      uniform float scaleFactor;
      uniform bool useEdgeDetection;
      uniform bool enableFSR;
      varying vec2 vUv;

      vec3 fsrUpscale(vec2 uv) {
        vec2 texelSize = 1.0 / resolution;
        
        // Sample neighboring pixels
        vec3 a = texture2D(tDiffuse, uv + vec2(-texelSize.x, -texelSize.y)).rgb;
        vec3 b = texture2D(tDiffuse, uv + vec2(0.0, -texelSize.y)).rgb;
        vec3 c = texture2D(tDiffuse, uv + vec2(texelSize.x, -texelSize.y)).rgb;
        vec3 d = texture2D(tDiffuse, uv + vec2(-texelSize.x, 0.0)).rgb;
        vec3 e = texture2D(tDiffuse, uv).rgb;
        vec3 f = texture2D(tDiffuse, uv + vec2(texelSize.x, 0.0)).rgb;
        vec3 g = texture2D(tDiffuse, uv + vec2(-texelSize.x, texelSize.y)).rgb;
        vec3 h = texture2D(tDiffuse, uv + vec2(0.0, texelSize.y)).rgb;
        vec3 i = texture2D(tDiffuse, uv + vec2(texelSize.x, texelSize.y)).rgb;

        // Edge detection using Sobel operator
        vec3 sobelX = (c + 2.0*f + i) - (a + 2.0*d + g);
        vec3 sobelY = (g + 2.0*h + i) - (a + 2.0*b + c);
        float edge = length(sobelX) + length(sobelY);

        // FSR-style sharpening
        vec3 sharpened = e + 0.2 * (4.0*e - b - d - f - h);
        
        // Adaptive mixing based on edge strength
        float mixFactor = smoothstep(0.1, 0.3, edge);
        return mix(e, sharpened, mixFactor * 0.8);
      }

      vec3 simpleUpscale(vec2 uv) {
        vec2 texelSize = 1.0 / resolution;
        
        // Bilinear upscaling with slight sharpening
        vec3 center = texture2D(tDiffuse, uv).rgb;
        vec3 top = texture2D(tDiffuse, uv + vec2(0.0, texelSize.y)).rgb;
        vec3 bottom = texture2D(tDiffuse, uv - vec2(0.0, texelSize.y)).rgb;
        vec3 left = texture2D(tDiffuse, uv - vec2(texelSize.x, 0.0)).rgb;
        vec3 right = texture2D(tDiffuse, uv + vec2(texelSize.x, 0.0)).rgb;
        
        // Simple edge enhancement
        vec3 sharpened = center + 0.15 * (4.0*center - top - bottom - left - right);
        
        return useEdgeDetection ? sharpened : center;
      }

      void main() {
        vec3 color = enableFSR ? fsrUpscale(vUv) : simpleUpscale(vUv);
        gl_FragColor = vec4(color, 1.0);
      }
    `;

    this.upscaleMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        resolution: { value: new THREE.Vector2() },
        scaleFactor: { value: this.options.scaleFactor },
        useEdgeDetection: { value: this.options.useEdgeDetection },
        enableFSR: { value: this.options.enableFSR }
      },
      vertexShader,
      fragmentShader
    });
  }

  private initScreenQuad(): void {
    const geometry = new THREE.PlaneGeometry(2, 2);
    this.screenQuad = new THREE.Mesh(geometry, this.upscaleMaterial!);

    this.orthographicCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  public updateOptions(newOptions: Partial<UpscalerOptions>): void {
    this.options = { ...this.options, ...newOptions };

    if (this.upscaleMaterial) {
      this.upscaleMaterial.uniforms.scaleFactor.value = this.options.scaleFactor;
      this.upscaleMaterial.uniforms.useEdgeDetection.value = this.options.useEdgeDetection;
      this.upscaleMaterial.uniforms.enableFSR.value = this.options.enableFSR;
    }

    // Reinitialize render targets if scale factor changed
    if (newOptions.scaleFactor !== undefined) {
      this.initRenderTargets();
    }
  }

  public handleResize(): void {
    this.initRenderTargets();
    if (this.upscaleMaterial && this.lowResTarget) {
      this.upscaleMaterial.uniforms.resolution.value.set(this.lowResTarget.width, this.lowResTarget.height);
    }
  }

  public render(): void {
    if (
      !this.isInitialized ||
      !this.lowResTarget ||
      !this.highResTarget ||
      !this.upscaleMaterial ||
      !this.screenQuad ||
      !this.orthographicCamera
    ) {
      // Fallback to normal rendering
      this.renderer.render(this.scene, this.camera);
      return;
    }

    try {
      // Step 1: Render scene to low-resolution target
      const originalRenderTarget = this.renderer.getRenderTarget();
      this.renderer.setRenderTarget(this.lowResTarget);
      this.renderer.render(this.scene, this.camera);

      // Step 2: Upscale using custom shader
      this.upscaleMaterial.uniforms.tDiffuse.value = this.lowResTarget.texture;
      this.upscaleMaterial.uniforms.resolution.value.set(this.lowResTarget.width, this.lowResTarget.height);

      // Render upscaled result to screen
      this.renderer.setRenderTarget(originalRenderTarget);
      this.renderer.render(this.createUpscaleScene(), this.orthographicCamera);
    } catch (error) {
      console.warn("Upscaler render failed, falling back to normal rendering:", error);
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
    }
  }

  private createUpscaleScene(): THREE.Scene {
    const upscaleScene = new THREE.Scene();
    if (this.screenQuad) {
      upscaleScene.add(this.screenQuad);
    }
    return upscaleScene;
  }

  public getQualityStats(): { scaleFactor: number; resolution: string; isActive: boolean } {
    const size = this.renderer.getSize(new THREE.Vector2());
    return {
      scaleFactor: this.options.scaleFactor,
      resolution: this.lowResTarget
        ? `${this.lowResTarget.width}x${this.lowResTarget.height} → ${size.x}x${size.y}`
        : `${size.x}x${size.y}`,
      isActive: this.isInitialized
    };
  }

  public dispose(): void {
    this.lowResTarget?.dispose();
    this.highResTarget?.dispose();
    this.upscaleMaterial?.dispose();
    this.screenQuad?.geometry.dispose();
    this.isInitialized = false;
  }
}
