import { useLanguage, SUPPORTED_LANGUAGES } from '../contexts/LanguageContext';
import { Globe } from 'react-feather';

export function LanguageSelector() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="relative">
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value as keyof typeof SUPPORTED_LANGUAGES)}
        className="block w-full pl-10 pr-4 py-2 text-base border-gray-300 dark:border-gray-700 
                 focus:outline-none focus:ring-blue-500 focus:border-blue-500 
                 rounded-md shadow-sm dark:bg-gray-700 dark:text-white"
      >
        {Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <Globe className="h-5 w-5 text-gray-400" aria-hidden="true" />
      </div>
    </div>
  );
}
