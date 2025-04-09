// src/lib/soundEffects.ts
export class SoundEffects {
    private static instance: SoundEffects;
    private sounds: Record<string, HTMLAudioElement> = {};
    private enabled: boolean = true;
    
    private constructor() {
      // Precarica i suoni
      this.loadSound('message', '/sounds/message.mp3');
      this.loadSound('notification', '/sounds/notification.mp3');
    }
    
    public static getInstance(): SoundEffects {
      if (!SoundEffects.instance) {
        SoundEffects.instance = new SoundEffects();
      }
      return SoundEffects.instance;
    }
    
    private loadSound(name: string, url: string): void {
      if (typeof window !== 'undefined') {
        this.sounds[name] = new Audio(url);
        this.sounds[name].load();
      }
    }
    
    public playSound(name: string): void {
      if (this.enabled && this.sounds[name]) {
        // Clona l'elemento audio per consentire la riproduzione sovrapposta
        const sound = this.sounds[name].cloneNode() as HTMLAudioElement;
        sound.volume = 0.5;
        sound.play().catch(e => console.log('Failed to play sound:', e));
      }
    }
    
    public enableSounds(): void {
      this.enabled = true;
    }
    
    public disableSounds(): void {
      this.enabled = false;
    }
    
    public toggleSounds(): boolean {
      this.enabled = !this.enabled;
      return this.enabled;
    }
    
    public isEnabled(): boolean {
      return this.enabled;
    }
  }