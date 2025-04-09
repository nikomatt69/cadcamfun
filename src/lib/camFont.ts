import {
  Aboreto,
  Akaya_Kanadaka,
  Archivo,
  Archivo_Narrow,
  Arima,
  Audiowide,
  Azeret_Mono,
  BioRhyme,

} from 'next/font/google';
import localFont from 'next/font/local';

export const camFont = localFont({
  src: [
    {
      path: '../../public/fonts/helvetica-rounded-bold-5871d05ead8de.ttf',
      weight: '400',
      style: 'normal'
    },
    {
      path: '../../public/fonts/helvetica-rounded-bold-5871d05ead8de.ttf',
      weight: '500',
      style: 'medium'
    },
    {
      path: '../../public/fonts/helvetica-rounded-bold-5871d05ead8de.ttf',
      weight: '700',
      style: 'bold'
    }
  ],
  style: 'normal',
  fallback: ['sans-serif'],
  preload: true,
  display: 'swap'
});


export const aboretoFont = Aboreto({ subsets: ['latin'], weight: '400' });
export const akayaKanadakaFont = Akaya_Kanadaka({
  subsets: ['latin'],
  weight: '400'
});
export const archivoFont = Archivo({ subsets: ['latin'], weight: '400' });
export const archivoNarrowFont = Archivo_Narrow({
  subsets: ['latin'],
  weight: '400'
});
export const arimaFont = Arima({ subsets: ['latin'], weight: '400' });
export const audiowideFont = Audiowide({ subsets: ['latin'], weight: '400' });
export const azeretMonoFont = Azeret_Mono({
  subsets: ['latin'],
  weight: '400'
});
export const bioRhymeFont = BioRhyme({ subsets: ['latin'], weight: '400' });
