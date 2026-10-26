import { useSyncExternalStore } from 'react';
import { subscribe, getLanguage } from './core';
export function useLocale() { return useSyncExternalStore(subscribe, getLanguage, () => 'vi'); }
