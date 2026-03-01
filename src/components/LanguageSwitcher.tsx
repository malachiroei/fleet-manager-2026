import { useTranslation } from 'react-i18next';
import { setLanguageDirection } from '@/i18n/config';
import { Button } from './ui/button';
import { Globe } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();

  const handleLanguageChange = (language: string) => {
    i18n.changeLanguage(language);
    setLanguageDirection(language);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Globe className="h-4 w-4" />
          <span className="text-xs font-semibold">
            {i18n.language === 'he' ? 'עברית' : 'EN'}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => handleLanguageChange('he')}
          className={i18n.language === 'he' ? 'bg-blue-100' : ''}
        >
          🇮🇱 {t('common.hebrew')}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleLanguageChange('en')}
          className={i18n.language === 'en' ? 'bg-blue-100' : ''}
        >
          🇬🇧 {t('common.english')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
