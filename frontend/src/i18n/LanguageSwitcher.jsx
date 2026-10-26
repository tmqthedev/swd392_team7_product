import { useLocale } from './useLocale';
import { setLanguage } from './core';

export function LanguageSwitcher() {
  const language = useLocale();
  return (
    <label className="language-switcher">
      <span className="sr-only">{language === 'vi' ? 'Ngôn ngữ giao diện' : 'Interface language'}</span>
      <select aria-label={language === 'vi' ? 'Ngôn ngữ giao diện' : 'Interface language'} value={language} onChange={event => setLanguage(event.target.value)}>
        <option value="vi">Tiếng Việt</option>
        <option value="en">English</option>
      </select>
    </label>
  );
}
